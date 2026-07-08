import { ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { Router } from '@angular/router';
import { LoginService } from 'src/app/services/loginServices/login.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { AppValidators } from 'src/app/shared/validators/app-validators';

export interface MethodDef {
  key:        string;               // internal key used for routing
  label:      string;               // display name
  icon:       string;               // fa icon class
  iconClass:  string;               // colour class on .otp-method-icon
  sub:        string;               // sub-label shown on card
  authType:   number;               // maps to backend AuthType enum
}

@Component({
  selector: 'app-otp-mfa-dialog',
  templateUrl: './otp-mfa-dialog.component.html',
  styleUrls: ['./otp-mfa-dialog.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LoadingSpinnerComponent]
})
export class OtpMfaDialogComponent implements OnInit, OnDestroy {

  // ── Inputs ────────────────────────────────────────────────────────
  @Input() maskedContactNumber = '';
  @Input() maskedEmail         = '';
  @Input() selectedMethod: string | null = null;
  @Input() showOtpInput        = false;
  @Input() userId: string      = '';
  @Input() type: 'otp' | 'mfa' = 'otp';
  @Input() channelOptions: Array<{ label: string; value: string }> = [];
  @Input() resendSeconds       = 60;
  @Input() showMethodSelect    = false;
  /** True when the user's preferred loginType is 3 (Google Authenticator / TOTP). */
  @Input() isTotpMode          = false;
  /** True when the user has a registered authenticator app (independent of preferred method). */
  @Input() hasMfa              = false;
  @Input() showQr              = false;
  @Input() qrCodeData          = '';
  @Input() isSubmitting        = false;
  @Input() otpMessage          = '';
  @Input() resendDisabled      = false;
  @Input() id: number          = 0;
  /**
   * When set to a future Date, the dialog switches to a lockout view:
   * method picker, OTP input, and Resend button are all hidden/disabled.
   * Pass `lockedUntil` from the parent component after receiving an
   * `accountLocked` response from the backend.
   */
  @Input() lockoutEnd: Date | null = null;
  /**
   * When provided, this function is called instead of loginService.generateOtp().
   * Allows reusing the dialog outside the login flow (e.g. Settings PIN setup).
   * Receives the selected method ('phone' | 'email') and must return an Observable.
   */
  @Input() sendOtpFn: ((method: string) => Observable<any>) | null = null;
  /** Label for the back/cancel navigation button (default: 'Back to Login'). */
  @Input() backLabel = 'Back to Login';
  /** Error message to show after a failed verify attempt; set by parent. */
  @Input() verifyError = '';

  // ── Outputs ───────────────────────────────────────────────────────
  @Output() verify           = new EventEmitter<{ code: string; authType: number }>();
  @Output() channelChange    = new EventEmitter<string>();
  @Output() close            = new EventEmitter<void>();
  @Output() back             = new EventEmitter<void>();
  /**
   * Emitted whenever the dialog detects a lockout from a backend API response
   * (resend or send OTP returning "Account is locked").
   * The parent should close the dialog and show the lockout banner.
   */
  @Output() lockoutDetected  = new EventEmitter<void>();
  /**
   * Emitted when the 5-minute session timer expires.
   * The parent can listen to this to close the dialog and update UI state.
   * The component also auto-calls logout and navigates to /login.
   */
  @Output() sessionExpired   = new EventEmitter<void>();

  // ── Form ──────────────────────────────────────────────────────────
  form: FormGroup;

  // ── Internal view state ───────────────────────────────────────────
  activeTotpMode   = false;
  showMethodPicker = false;
  /** Non-empty while the "method unavailable" message screen is showing. */
  unavailableTitle   = '';
  unavailableMessage = '';
  /**
   * Set to true when a backend API response (resend / send OTP) explicitly
   * indicates the account is locked, even if the parent hasn't yet updated
   * the [lockoutEnd] input.  Complements the input-based isLocked check so
   * the dialog enforces lockout regardless of whether the parent is aware.
   */
  private lockedFromBackend = false;

  pendingMethod   = '';
  resendRemaining = 0;
  isSendingOtp    = false;
  private timerId: any = null;

  // ── Session timer (5 minutes) ─────────────────────────────────────
  readonly sessionSeconds     = 300; // 5 minutes
  sessionRemaining            = 300;
  sessionExpiredFlag          = false;
  private sessionTimerId: any = null;

  // ── Static method definitions (always all shown) ──────────────────
  readonly methods: MethodDef[] = [
    {
      key:       'phone',
      label:     'SMS / Phone',
      icon:      'fa-mobile',
      iconClass: 'phone',
      sub:       '',            // filled dynamically in template via maskedContactNumber
      authType:  1,
    },
    {
      key:       'email',
      label:     'Email',
      icon:      'fa-envelope',
      iconClass: 'email',
      sub:       '',            // filled dynamically via maskedEmail
      authType:  2,
    },
    {
      key:       'totp',
      label:     'Authenticator App',
      icon:      'fa-mobile-alt',
      iconClass: 'totp',
      sub:       'Google / Microsoft TOTP',
      authType:  3,
    },
  ];

  constructor(
    private fb: FormBuilder,
    private loginService: LoginService,
    private router: Router,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {
    this.form = this.fb.group({
      code:   [''],
      digits: this.fb.array(
        Array.from({ length: 6 }, () => this.fb.control('', [AppValidators.singleDigit()])),
      ),
      channel: [''],
    });
  }

  // ── Lockout helpers ───────────────────────────────────────────────

  /**
   * True when the account is locked — either because:
   *   a) the parent passed a future [lockoutEnd] date, OR
   *   b) a backend API call returned an "Account is locked" response.
   * The getter is intentionally cheap (no async / no HTTP) so it can be
   * called freely from the template.
   */
  get isLocked(): boolean {
    return this.lockedFromBackend ||
           (this.lockoutEnd != null && this.lockoutEnd > new Date());
  }

  /** Formatted lockout end time shown in the lockout message panel. */
  get lockoutUntilLabel(): string {
    if (!this.lockoutEnd) return '';
    return this.lockoutEnd.toLocaleTimeString([], {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  /**
   * Human-readable lockout message shown in the lockout view.
   * Uses the exact time when available; falls back to a generic message
   * when lockout was detected from a backend response without a timestamp.
   */
  get lockoutMessage(): string {
    if (this.lockoutEnd) {
      return `Your account is locked due to multiple failed attempts. Please try again after 15 minutes (at ${this.lockoutUntilLabel}). OTP and MFA are disabled during this period.`;
    }
    return 'Your account is locked due to multiple failed attempts. Please try again after 15 minutes. OTP and MFA are disabled during this period.';
  }

  /** Returns true when a backend response message signals an account lockout. */
  private isLockoutResponse(resp: any): boolean {
    return typeof resp?.message === 'string' &&
           resp.message.toLowerCase().includes('locked');
  }

  /**
   * Switches the dialog into lockout mode based on a backend response.
   * Stops the resend timer, hides all OTP UI, and notifies the parent.
   */
  private applyBackendLockout(): void {
    this.lockedFromBackend = true;
    this.clearResendTimer();
    this.resendRemaining  = 0;
    this.showOtpInput     = false;
    this.showMethodPicker = false;
    this.activeTotpMode   = false;
    this.lockoutDetected.emit();
  }

  ngOnInit(): void {
    this.startSessionTimer();
    if (this.isLocked) {
      // Account locked — keep all OTP/method UI hidden.
      this.showMethodPicker = false;
      this.showOtpInput     = false;
      this.activeTotpMode   = false;
      return;
    }
    this.activeTotpMode  = this.isTotpMode;
    this.showMethodPicker = this.showMethodSelect && !this.showOtpInput && !this.isTotpMode;
    this.startResendTimer();
  }

  ngOnDestroy(): void {
    this.clearResendTimer();
    this.clearSessionTimer();
  }

  // ── Validity helpers ──────────────────────────────────────────────

  isMethodValid(key: string): boolean {
    switch (key) {
      case 'phone': return !!this.maskedContactNumber;
      case 'email': return !!this.maskedEmail;
      case 'totp':  return this.hasMfa || this.isTotpMode;
      default:      return true;
    }
  }

  methodSub(key: string): string {
    switch (key) {
      case 'phone': return this.maskedContactNumber || 'No number registered';
      case 'email': return this.maskedEmail         || 'No email registered';
      case 'totp':  return (this.hasMfa || this.isTotpMode) ? 'Google / Microsoft TOTP' : 'Not configured';
      default:      return '';
    }
  }

  // ── Method selection ──────────────────────────────────────────────

  onMethodCardClick(method: MethodDef): void {
    if (!this.isMethodValid(method.key)) {
      this.showUnavailableMessage(method);
      return;
    }
    if (method.key === 'totp') {
      this.selectTotpMethod();
    } else {
      this.selectMethod(method.key);
    }
  }

  private showUnavailableMessage(method: MethodDef): void {
    this.unavailableTitle = `${method.label} Unavailable`;
    switch (method.key) {
      case 'phone':
        this.unavailableMessage =
          'No phone number is registered on your account. ' +
          'Please update your profile to add a mobile number, then try again.';
        break;
      case 'email':
        this.unavailableMessage =
          'No email address is registered on your account. ' +
          'Please update your profile to add an email address, then try again.';
        break;
      case 'totp':
        this.unavailableMessage =
          'Authenticator app has not been set up for your account. ' +
          'Go to Settings → Authenticator App to configure it, then log in again.';
        break;
      default:
        this.unavailableMessage = 'This verification method is not available.';
    }
  }

  clearUnavailableMessage(): void {
    this.unavailableTitle   = '';
    this.unavailableMessage = '';
    this.pendingMethod      = '';
    // Return to method picker
    this.showMethodPicker   = true;
    this.activeTotpMode     = false;
    this.selectedMethod     = null;
    this.showOtpInput       = false;
  }

  selectMethod(method: string): void {
    this.selectedMethod      = method;
    this.showOtpInput        = false;
    this.activeTotpMode      = false;
    this.showMethodPicker    = false;
    this.unavailableTitle    = '';
    this.unavailableMessage  = '';
  }

  selectTotpMethod(): void {
    this.selectedMethod      = null;
    this.activeTotpMode      = true;
    this.showOtpInput        = true;
    this.showMethodPicker    = false;
    this.unavailableTitle    = '';
    this.unavailableMessage  = '';
    this.clearDigits();
  }

  switchMethod(): void {
    this.activeTotpMode      = false;
    this.selectedMethod      = null;
    this.showOtpInput        = false;
    this.showMethodPicker    = true;
    this.unavailableTitle    = '';
    this.unavailableMessage  = '';
    this.pendingMethod       = '';
    this.clearDigits();
  }

  resetMethod(): void {
    this.selectedMethod      = null;
    this.showOtpInput        = false;
    this.showMethodPicker    = true;
    this.unavailableTitle    = '';
    this.unavailableMessage  = '';
  }

  // ── OTP send ──────────────────────────────────────────────────────

  sendOtpRequest(): void {
    if (this.isLocked || !this.userId || !this.selectedMethod || this.isSendingOtp) return;
    this.isSendingOtp = true;
    const sender$ = this.sendOtpFn
      ? this.sendOtpFn(this.selectedMethod)
      : this.loginService.generateOtp(this.id, this.userId, this.selectedMethod);
    sender$.subscribe({
      next: (resp: any) => {
        this.isSendingOtp = false;
        if (resp?.success === false) {
          if (this.isLockoutResponse(resp)) {
            this.applyBackendLockout();
          }
          // OTP not sent — leave showOtpInput = false and don't start the timer
          return;
        }
        this.showOtpInput = true;
        this.startResendTimer();
      },
      error: () => { this.isSendingOtp = false; },
    });
  }

  // ── Getters ───────────────────────────────────────────────────────

  get digits(): FormArray {
    return this.form.get('digits') as FormArray;
  }

  buildCode(): string {
    return this.digits.controls.map(c => c.value ?? '').join('');
  }

  get otpSentMessage(): string {
    if (this.activeTotpMode)                return 'Open your authenticator app and enter the current 6-digit code.';
    if (this.selectedMethod === 'phone')    return `OTP sent to Phone Number: ${this.maskedContactNumber}`;
    if (this.selectedMethod === 'email')    return `OTP sent to Email: ${this.maskedEmail}`;
    return '';
  }

  /** Maps internal state to the backend AuthType number. */
  get currentAuthType(): number {
    if (this.activeTotpMode)               return 3; // AuthenticationApp
    if (this.selectedMethod === 'phone')   return 1; // Mobile
    if (this.selectedMethod === 'email')   return 2; // Email
    return 4;                                         // Other
  }

  // ── Events ────────────────────────────────────────────────────────

  onVerify(): void {
    if (this.isLocked) return;
    this.verify.emit({ code: this.buildCode(), authType: this.currentAuthType });
  }

  onClose(): void {
    this.clearResendTimer();
    this.close.emit();
    window.dispatchEvent(new CustomEvent('closeMfaDialog', { bubbles: true }));
  }

  onBack(): void {
    this.back.emit();
    window.dispatchEvent(new CustomEvent('backFromMfaDialog', { bubbles: true }));
  }

  onResend(): void {
    if (this.isLocked || !this.userId || !this.selectedMethod || this.isSendingOtp) return;
    this.isSendingOtp = true;
    this.clearDigits();
    this.focusInput(0);
    const sender$ = this.sendOtpFn
      ? this.sendOtpFn(this.selectedMethod)
      : this.loginService.generateOtp(this.id, this.userId, this.selectedMethod);
    sender$.subscribe({
      next: (resp: any) => {
        this.isSendingOtp = false;
        if (resp?.success === false) {
          if (this.isLockoutResponse(resp)) {
            // Account locked — enter lockout view; DO NOT start the resend timer
            this.applyBackendLockout();
          }
          // OTP not sent — don't start timer regardless
          return;
        }
        // OTP sent successfully — start the cooldown timer
        this.startResendTimer();
      },
      error: () => { this.isSendingOtp = false; },
    });
  }

  onChannelChange(event: Event): void {
    this.channelChange.emit((event.target as HTMLInputElement).value);
  }

  // ── Input handling ────────────────────────────────────────────────

  onInput(index: number, event: Event): void {
    const input     = event.target as HTMLInputElement;
    const sanitized = input.value.replace(/\D/g, '');
    input.value     = sanitized;
    this.digits.at(index).setValue(sanitized);
    this.form.get('code')?.setValue(this.buildCode(), { emitEvent: false });
    if (sanitized && index < this.digits.length - 1) this.focusInput(index + 1);
    if (this.digits.controls.every(c => c.value && c.value.length === 1)) {
      setTimeout(() => this.onVerify(), 100);
    }
  }

  onKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace') {
      const input = event.target as HTMLInputElement;
      if (input.value) {
        // Box is filled — clear it and stay on this box.
        event.preventDefault();
        this.digits.at(index).setValue('');
        input.value = '';
        this.form.get('code')?.setValue(this.buildCode(), { emitEvent: false });
        return;   // do NOT move focus; a second backspace will navigate back
      }
      // Box is already empty — move to the previous box.
      if (index > 0) this.focusInput(index - 1);
    }
  }

  onPaste(event: ClipboardEvent): void {
    const pasted = (event.clipboardData?.getData('text') ?? '')
      .replace(/\D/g, '').slice(0, this.digits.length);
    if (!pasted) return;
    event.preventDefault();
    pasted.split('').forEach((digit, i) => this.digits.at(i).setValue(digit));
    this.form.get('code')?.setValue(this.buildCode(), { emitEvent: false });
    this.focusInput(Math.min(pasted.length, this.digits.length - 1));
    if (pasted.length === this.digits.length) setTimeout(() => this.onVerify(), 100);
  }

  focusInput(index: number): void {
    const el = document.querySelectorAll('.otp-box')[index] as HTMLInputElement;
    if (el) { el.focus(); el.select(); }
  }

  // ── Timer ─────────────────────────────────────────────────────────

  startResendTimer(): void {
    this.clearResendTimer();
    this.resendRemaining = this.resendSeconds;
    this.timerId = setInterval(() => {
      if (this.resendRemaining > 0) this.resendRemaining--;
      if (this.resendRemaining === 0) this.clearResendTimer();
    }, 1000);
  }

  clearResendTimer(): void {
    if (this.timerId) { clearInterval(this.timerId); this.timerId = null; }
  }

  // ── Session timer ─────────────────────────────────────────────────

  /** Formatted mm:ss countdown shown in the dialog header. */
  get sessionRemainingLabel(): string {
    const m = Math.floor(this.sessionRemaining / 60).toString().padStart(2, '0');
    const s = (this.sessionRemaining % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /** True when the session is in the final 60 seconds (shows red). */
  get sessionUrgent(): boolean {
    return this.sessionRemaining <= 60 && !this.sessionExpiredFlag;
  }

  startSessionTimer(): void {
    this.clearSessionTimer();
    this.sessionRemaining   = this.sessionSeconds;
    this.sessionExpiredFlag = false;
    // Wrap in ngZone.run() so each tick triggers Angular change detection
    // even when called from outside the zone (e.g. login/interceptor context).
    this.ngZone.run(() => {
      this.sessionTimerId = setInterval(() => {
        if (this.sessionRemaining > 0) {
          this.sessionRemaining--;
        } else {
          this.onSessionExpired();
        }
        this.cdr.detectChanges();   // force re-render of ring + progress bar
      }, 1000);
    });
  }

  clearSessionTimer(): void {
    if (this.sessionTimerId) { clearInterval(this.sessionTimerId); this.sessionTimerId = null; }
  }

  private onSessionExpired(): void {
    this.clearSessionTimer();
    this.clearResendTimer();
    this.sessionExpiredFlag = true;
    this.sessionExpired.emit();
    // Auto logout — call the service then navigate to login
    try {
      this.loginService.logout().subscribe({ complete: () => this.router.navigate(['/login']) });
    } catch {
      this.router.navigate(['/login']);
    }
  }

  private clearDigits(): void {
    this.digits.controls.forEach(c => c.setValue(''));
    this.form.get('code')?.setValue('', { emitEvent: false });
  }
}
