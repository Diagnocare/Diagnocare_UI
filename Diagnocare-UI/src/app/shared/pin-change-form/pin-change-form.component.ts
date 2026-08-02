import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';

import { PinService } from 'src/app/services/pinServices/pin.service';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { AuthType } from 'src/app/constant/enums';
import { OtpMfaDialogComponent } from 'src/app/shared/otp-mfa/otp-mfa-dialog.component';

/**
 * PinChangeFormComponent
 * ──────────────────────
 * Reusable change-PIN form shared by the standalone /change-pin page (forced
 * expiry flow) and the Settings → Session PIN section, so both behave identically.
 *
 * Flow:
 *   • Enter Current PIN + New PIN + Confirm, or
 *   • "Forgot PIN?" → verify identity via OTP (email/phone/authenticator using the
 *     Bearer-authenticated profile OTP endpoints) → current-PIN step is skipped.
 *
 * Validation:
 *   • New PIN must be 4–6 digits and must not reuse any of the last N PINs.
 *   • All PIN fields accept digits only.
 *
 * The component owns validation + persistence (PinService.setPin) and emits
 * `changed` on success. The host decides what happens next (redirect vs. stay).
 */
@Component({
  selector: 'app-pin-change-form',
  standalone: true,
  imports: [CommonModule, FormsModule, OtpMfaDialogComponent],
  templateUrl: './pin-change-form.component.html',
  styleUrls: ['./pin-change-form.component.css'],
})
export class PinChangeFormComponent implements OnInit {

  /** Username / userId whose PIN is being changed. Required. */
  @Input() userName = '';
  /** Whether to render the Cancel button (hidden in the forced-expiry flow). */
  @Input() showCancel = true;
  /** Label for the cancel button. */
  @Input() cancelLabel = 'Cancel';
  /** Label for the submit button. */
  @Input() submitLabel = 'Change PIN';

  /** Emitted after the PIN has been changed successfully. */
  @Output() changed = new EventEmitter<void>();
  /** Emitted when the user cancels. */
  @Output() cancelled = new EventEmitter<void>();

  /** Loaded profile — provides email/phone for the OTP dialog. */
  user: any = null;

  currentPin = '';
  newPin     = '';
  confirmPin = '';

  showCurrentPin = false;
  showNewPin     = false;
  showConfirmPin = false;

  /** True once identity is verified via Forgot-PIN OTP; current PIN is then skipped. */
  isResetMode   = false;
  showMfaDialog = false;
  mfaSubmitting = false;
  mfaError      = '';

  pinError = '';
  saving   = false;

  readonly historySize = PinService.PIN_HISTORY_SIZE;

  /** Custom OTP sender (Bearer-authenticated profile OTP endpoint). */
  forgotOtpSender = (method: string): Observable<any> => {
    const id    = this.user?.user_Id ?? 0;
    const email = method === 'email' ? (this.user?.email ?? '') : undefined;
    const phone = method === 'phone' ? (this.user?.contactPhone?.toString() ?? '') : undefined;
    return this.headerService.sendProfileOtp(id, this.userName, method as 'email' | 'phone', email, phone);
  };

  constructor(
    private pinService:    PinService,
    private headerService: HeaderService,
  ) {}

  ngOnInit(): void {
    // Load profile so the OTP dialog can show masked email/phone and pre-select
    // the user's preferred channel.
    if (this.userName) {
      this.headerService.getUserDetails(this.userName).subscribe({
        next: (data: any) => { this.user = data; },
        error: () => { /* non-critical — dialog will show the method picker */ },
      });
    }
  }

  // ── Numeric-only helper ─────────────────────────────────────────────────────

  /** Strips any non-digit characters so PIN fields accept numbers only. */
  onlyDigits(value: string): string {
    return (value || '').replace(/\D/g, '');
  }

  // ── Masked contact details + preferred method for OtpMfaDialogComponent ──────

  get maskedEmail(): string {
    const email = this.user?.email ?? '';
    if (!email || !email.includes('@')) return email;
    const [local, domain] = email.split('@');
    return `${local[0]}***@${domain}`;
  }

  get maskedPhone(): string {
    const phone = (this.user?.contactPhone ?? '').toString();
    if (!phone || phone.length < 4) return phone;
    return `******${phone.slice(-4)}`;
  }

  get preferredMfaMethod(): string | null {
    switch (this.user?.loginType) {
      case AuthType.Mobile: return 'phone';
      case AuthType.Email:  return 'email';
      default:              return null;
    }
  }

  get isTotpPreferred(): boolean {
    return this.user?.loginType === AuthType.AuthenticationApp;
  }

  // ── Visibility toggles ───────────────────────────────────────────────────────

  toggleCurrent() { this.showCurrentPin = !this.showCurrentPin; }
  toggleNew()     { this.showNewPin     = !this.showNewPin;     }
  toggleConfirm() { this.showConfirmPin = !this.showConfirmPin; }

  // ── Forgot-PIN (OTP) flow ────────────────────────────────────────────────────

  /** Opens the OTP dialog so the user can verify identity without the current PIN. */
  startForgotPin(): void {
    this.pinError      = '';
    this.mfaError      = '';
    this.mfaSubmitting = false;
    this.showMfaDialog = true;
  }

  /** Called by OtpMfaDialogComponent after the user enters a code. */
  onForgotVerify(event: { code: string; authType: number }): void {
    this.mfaSubmitting = true;
    this.mfaError      = '';
    this.headerService.verifyProfileOtp(this.userName, event.code, event.authType).subscribe({
      next: (res: { success: boolean; message: string }) => {
        this.mfaSubmitting = false;
        if (res.success) {
          this.showMfaDialog = false;
          this.isResetMode   = true;
          this.currentPin    = '';
        } else {
          this.mfaError = res.message || 'Verification failed. Please try again.';
        }
      },
      error: () => {
        this.mfaSubmitting = false;
        this.mfaError = 'Verification failed. Please try again.';
      },
    });
  }

  onMfaClose(): void {
    this.showMfaDialog = false;
    this.mfaError      = '';
    this.mfaSubmitting = false;
  }

  // ── Validation + submit ──────────────────────────────────────────────────────

  private isValidPin(pin: string): boolean {
    return /^\d{4,6}$/.test(pin);
  }

  /**
   * True only when every client-side criterion is satisfied, so the Change PIN
   * button stays disabled while any validation error is showing:
   *   • not currently saving,
   *   • current PIN entered (unless identity was verified via Forgot PIN),
   *   • new PIN is 4–6 digits,
   *   • confirm PIN matches the new PIN.
   */
  get canSubmit(): boolean {
    if (this.saving) return false;
    if (!this.isResetMode && !this.currentPin) return false;
    if (!this.isValidPin(this.newPin)) return false;
    if (this.newPin !== this.confirmPin) return false;
    return true;
  }

  async save(): Promise<void> {
    this.pinError = '';

    if (!this.isValidPin(this.newPin)) {
      this.pinError = 'PIN must be 4–6 digits.';
      return;
    }
    if (this.newPin !== this.confirmPin) {
      this.pinError = 'PINs do not match.';
      return;
    }

    this.saving = true;

    // Verify current PIN — unless identity was already confirmed via Forgot-PIN OTP.
    if (!this.isResetMode) {
      const currentOk = await this.pinService.verifyPin(this.userName, this.currentPin);
      if (!currentOk) {
        this.pinError = 'Current PIN is incorrect.';
        this.saving   = false;
        return;
      }
    }

    // Enforce last-N-PIN history.
    const isReuse = await this.pinService.isRecentPin(this.userName, this.newPin);
    if (isReuse) {
      this.pinError = `You cannot reuse any of your last ${this.historySize} PINs. Please choose a different PIN.`;
      this.saving   = false;
      return;
    }

    await this.pinService.setPin(this.userName, this.newPin);
    this.saving = false;
    this.resetFields();
    this.changed.emit();
  }

  cancel(): void {
    this.resetFields();
    this.cancelled.emit();
  }

  private resetFields(): void {
    this.currentPin  = '';
    this.newPin      = '';
    this.confirmPin  = '';
    this.isResetMode = false;
    this.pinError    = '';
  }
}
