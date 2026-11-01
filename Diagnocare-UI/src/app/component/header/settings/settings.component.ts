import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonService } from 'src/app/shared/common.service';
import { jwtDecode } from 'jwt-decode';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { AuthType } from 'src/app/constant/enums';
import { ThemeService, Theme } from 'src/app/services/themeServices/theme.service';
import { PinService } from 'src/app/services/pinServices/pin.service';
import { OtpMfaDialogComponent } from 'src/app/shared/otp-mfa/otp-mfa-dialog.component';
import { SetupMfaComponent } from '../setup-mfa/setup-mfa.component';
import { SetupFingerprintComponent } from '../setup-fingerprint/setup-fingerprint.component';
import { FingerprintService } from 'src/app/services/loginServices/fingerprint.service';
import { MaskedInputDirective } from 'src/app/shared/directives/masked-input.directive';
import { PinModalService } from 'src/app/shared/pin-modal/pin-modal.service';

/**
 * Shown when the account details cannot be fetched. Deliberately generic —
 * backend exception text never reaches the user.
 */
const PROFILE_LOAD_ERROR = "We couldn't load your account details. Please try again.";

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['../account-pages.shared.css', './settings.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, OtpMfaDialogComponent, SetupMfaComponent, SetupFingerprintComponent, MaskedInputDirective]
})
export class SettingsComponent implements OnInit {
  user: any;
  pathology_Id: string = '';
  userName: string = '';
  selectedAuthType: AuthType | null = null;
  authTypeOptions = Object.keys(AuthType)
    .filter(key => !isNaN(Number(AuthType[key as any])))
    .map(key => ({ value: AuthType[key as keyof typeof AuthType], label: key.replace(/([A-Z])/g, ' $1').trim() }));
  editingAuthType: boolean = false;

  AuthType = AuthType;
  errorMsg:   string = '';
  successMsg: string = '';

  // ── Profile load state ───────────────────────────────────────────────────
  /** True while the signed-in user's account details are being fetched. */
  profileLoading = false;
  /** User-facing message when the fetch failed; '' when there is no error. */
  profileError = '';

  /**
   * Whether the Authenticator App (TOTP MFA) is currently set up for this user.
   * Drives whether "Authenticator App" can be chosen as the login method:
   * it can only be selected once MFA has actually been configured.
   */
  isMfaEnabled = false;

  /**
   * Whether at least one WebAuthn fingerprint credential is registered.
   * Drives whether "Fingerprint" can be chosen as the preferred login method.
   */
  isFingerprintEnabled = false;

  // ── Session PIN ──────────────────────────────────────────────────────────
  hasPinSet = false;
  pinMode: 'none' | 'set' | 'change' | 'remove' = 'none';
  /** True when the user was sent here by the "Set Up a PIN" modal (?setupPin=1). */
  cameForPinSetup = false;

  // ── MFA dialog (reused OtpMfaDialogComponent) ────────────────────────────
  showMfaDialog = false;
  mfaSubmitting = false;
  mfaError      = '';
  /** Which PIN action follows a successful MFA verification. */
  mfaAction: 'set' | 'change' = 'set';

  /**
   * Custom OTP sender passed to OtpMfaDialogComponent.
   * Calls the profile OTP endpoint (Bearer-authenticated) instead of the login endpoint.
   */
  profileOtpSender = (method: string): Observable<any> => {
    const id    = this.user?.user_Id ?? 0;
    const email = method === 'email' ? (this.user?.email ?? '') : undefined;
    const phone = method === 'phone' ? (this.user?.contactPhone?.toString() ?? '') : undefined;
    return this.headerService.sendProfileOtp(
      id,
      this.userName,
      method as 'email' | 'phone',
      email,
      phone,
    );
  };

  // Set PIN fields
  newPin        = '';
  confirmPin    = '';
  // Remove PIN field (current PIN confirmation)
  currentPin    = '';
  // Shared
  pinError   = '';
  pinSuccess = '';
  pinSaving  = false;
  showNewPin     = false;
  showCurrentPin = false;

  // ── Theme ────────────────────────────────────────────────────────────────
  selectedTheme: Theme = 'light';
  readonly themeOptions: { value: Theme; label: string; icon: string; desc: string }[] = [
    { value: 'light',    label: 'Light',    icon: 'fa-sun',     desc: 'Clean white, high clarity'           },
    { value: 'dark',     label: 'Dark',     icon: 'fa-moon',    desc: 'Dark slate, easy on the eyes'        },
    { value: 'midnight', label: 'Midnight', icon: 'fa-star',    desc: 'Deep navy, maximum contrast'         },
    { value: 'warm',     label: 'Warm',     icon: 'fa-fire',    desc: 'Sepia tones, reduced eye strain'     },
    { value: 'system',   label: 'System',   icon: 'fa-desktop', desc: 'Follows your OS appearance setting'  },
  ];

  constructor(
    private headerService: HeaderService,
    private common: CommonService,
    private themeService: ThemeService,
    private pinService:   PinService,
    private router:       Router,
    private route:        ActivatedRoute,
    private fingerprint:  FingerprintService,
    private pinModalService: PinModalService,
  ) {
    this.readIdentityFromToken();
  }

  /**
   * Resolves the signed-in user from the JWT — the app's single source of truth
   * for identity (the same `sub` claim TokenService.getUserId() reads, and the
   * same account the API derives from the Bearer token server-side).
   *
   * Called from the constructor AND again before each load: arriving from the
   * "Set Up a PIN" modal renews the token on the way in, so the token held at
   * construction time is not necessarily the one in play when the data loads.
   * Never clears an already-resolved identity if the token is momentarily gone.
   */
  private readIdentityFromToken(): void {
    const token = this.common.getAccessToken();
    if (!token) return;
    try {
      const decoded = jwtDecode<any>(token);
      this.pathology_Id = decoded.typ;
      this.userName     = decoded.sub;
    } catch {
      // Malformed token — keep whatever identity we already had.
    }
  }

  ngOnInit(): void {
    // Read this FIRST: the load below branches on it.
    this.cameForPinSetup = this.route.snapshot.queryParamMap.get('setupPin') === '1';

    if (this.userName) {
      this.selectedTheme = this.themeService.getForUser(this.userName);
    }

    this.hasPinSet = this.pinService.hasPin(this.userName);

    this.loadAccountData();

    // Arrived from the "Set Up a PIN" modal (?setupPin=1): highlight the
    // Session PIN card and scroll to it so the user lands on the thing they
    // were sent here to do.  The session is deliberately left untouched —
    // a missing PIN is a setup state, not an authentication failure.
    if (this.cameForPinSetup && !this.hasPinSet) {
      setTimeout(() => {
        document.getElementById('session-pin-card')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  /**
   * Loads everything this page shows about the signed-in user: their profile
   * (login type, and the id + contact details the PIN-setup MFA dialog needs),
   * plus their MFA and fingerprint enrolment status.
   *
   * Uses the existing HeaderService.getUserDetails — the same call the Profile
   * page makes. The server ignores the userName in the query string and derives
   * the account from the Bearer token (SEC-010), so this always returns the
   * caller's own profile.
   *
   * A failure here never touches the session: it shows a retryable message and
   * leaves the Session PIN card working, since the PIN is stored client-side.
   */
  loadAccountData(): void {
    // Re-resolve identity: the token may have been renewed on the way to this
    // page, after the constructor ran.
    this.readIdentityFromToken();

    this.profileLoading = true;
    this.profileError   = '';

    this.headerService.getUserDetails(this.userName).subscribe({
      next: (data: any) => {
        this.profileLoading = false;
        if (!data) {
          this.profileError = PROFILE_LOAD_ERROR;
          return;
        }
        // Assign only on success, so a failed reload never blanks out details
        // that are already on screen.
        this.user = data;
        this.selectedAuthType = data.loginType ?? this.selectedAuthType;
      },
      error: () => {
        this.profileLoading = false;
        this.profileError   = PROFILE_LOAD_ERROR;
      },
    });

    // Load MFA status so the "Authenticator App" login-method option can be
    // disabled until MFA is actually set up.
    this.headerService.getMFAStatus(this.userName).subscribe({
      next: (status) => { this.isMfaEnabled = status?.isMfaEnabled === true; },
      error: () => { this.isMfaEnabled = false; },
    });

    // Load fingerprint status so the "Fingerprint" login-method option can be
    // disabled until at least one credential is registered.
    this.fingerprint.getStatus(this.userName).subscribe({
      next: (status: any) => { this.isFingerprintEnabled = status?.isFingerprintEnabled === true; },
      error: () => { this.isFingerprintEnabled = false; },
    });
  }

  /**
   * "Try again" in the profile error banner. Re-issues the same requests and
   * never touches the session — a failed load is not a sign-out.
   *
   * Deliberately does NOT call LoginService.refreshToken() to force a new token
   * first: that method uses rawHttp (no interceptors), so renewing from a
   * component would sidestep the auth interceptor's PIN gate — the same reason
   * authGuard refuses to refresh silently. Token renewal stays with the
   * interceptor.
   */
  retryLoadAccountData(): void {
    this.loadAccountData();
  }

  /**
   * PIN creation is gated by an OTP/TOTP check that needs the account's id and
   * contact details, so it stays disabled until the profile has loaded. Without
   * this the button opened a dialog that could only fail verification.
   */
  get canSetPin(): boolean {
    return !this.profileLoading && !!this.user?.user_Id;
  }

  setTheme(theme: Theme): void {
    this.selectedTheme = theme;
    if (this.userName) {
      this.themeService.setForUser(this.userName, theme);
    }
  }

  /**
   * Called when the embedded Authenticator App panel enables or removes MFA.
   * Updates the MFA flag immediately so the "Authenticator App" option in the
   * preferred-auth-method section enables/disables without a page refresh, and
   * re-syncs the displayed current mode (the backend resets it to Email when MFA
   * is removed).
   */
  onMfaStatusChanged(enabled: boolean): void {
    this.isMfaEnabled = enabled;
    this.headerService.getUserDetails(this.userName).subscribe((data: any) => {
      this.user = data;
      this.selectedAuthType = data.loginType;
    });
  }

  /**
   * Called when the embedded Fingerprint panel registers or removes credentials.
   * Keeps the "Fingerprint" preferred-login option in sync without a refresh.
   */
  onFingerprintStatusChanged(enabled: boolean): void {
    this.isFingerprintEnabled = enabled;
  }

  get currentAuthTypeLabel(): string {
    const found = this.authTypeOptions.find(opt => opt.value === this.selectedAuthType);
    return found ? found.label : 'Unknown';
  }

  // ── Masked contact details for OtpMfaDialogComponent ─────────────────────

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

  /**
   * Maps the user's preferred login type to the method key used by
   * OtpMfaDialogComponent, so it pre-selects the right channel — mirroring
   * the login flow behaviour.  Returns null for TOTP (handled via isTotpPreferred)
   * and for unknown / unset types (show full method picker).
   */
  get preferredMfaMethod(): string | null {
    switch (this.user?.loginType) {
      case AuthType.Mobile: return 'phone';
      case AuthType.Email:  return 'email';
      default:              return null;
    }
  }

  /** True when the user's preferred login type is TOTP (Authenticator App). */
  get isTotpPreferred(): boolean {
    return this.user?.loginType === AuthType.AuthenticationApp;
  }

  // ── PIN methods ───────────────────────────────────────────────────────────

  startSetPin(): void {
    this.mfaAction     = 'set';
    this.mfaError      = '';
    this.mfaSubmitting = false;
    this.pinError      = '';
    this.pinSuccess    = '';
    this.newPin        = '';
    this.confirmPin    = '';
    this.showMfaDialog = true;
  }

  /** Called by OtpMfaDialogComponent (verify output) after the user enters a code. */
  onMfaVerify(event: { code: string; authType: number }): void {
    this.mfaSubmitting = true;
    this.mfaError      = '';

    this.headerService.verifyProfileOtp(this.userName, event.code, event.authType).subscribe({
      next: (res: { success: boolean; message: string }) => {
        this.mfaSubmitting = false;
        if (res.success) {
          this.showMfaDialog = false;
          this.pinMode       = this.mfaAction; // 'set' or 'change'
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

  /** Close the MFA dialog without proceeding (cancel / back button). */
  onMfaClose(): void {
    this.showMfaDialog = false;
    this.mfaError      = '';
    this.mfaSubmitting = false;
  }

  /**
   * "Change PIN" now navigates to the dedicated /change-pin page (the single
   * change-PIN screen shared with the header "Change PIN now" banner), rather
   * than rendering an inline form — keeping one consistent entry point.
   */
  startChangePin(): void {
    this.router.navigate(['/change-pin']);
  }

  /** Strips any non-digit characters so PIN fields accept numbers only. */
  onlyDigits(value: string): string {
    return (value || '').replace(/\D/g, '');
  }

  startRemovePin(): void {
    this.pinMode    = 'remove';
    this.pinError   = '';
    this.pinSuccess = '';
    this.currentPin = '';
  }

  cancelPin(): void {
    this.pinMode  = 'none';
    this.pinError = '';
  }

  /** Validate PIN: 4–6 digits */
  private isValidPin(pin: string): boolean {
    return /^\d{4,6}$/.test(pin);
  }

  async saveNewPin(): Promise<void> {
    this.pinError = '';
    if (!this.isValidPin(this.newPin)) {
      this.pinError = 'PIN must be 4–6 digits.';
      return;
    }
    if (this.newPin !== this.confirmPin) {
      this.pinError = 'PINs do not match.';
      return;
    }
    const isReuse = await this.pinService.isRecentPin(this.userName, this.newPin);
    if (isReuse) {
      this.pinError = `You cannot reuse any of your last ${PinService.PIN_HISTORY_SIZE} PINs. Please choose a different PIN.`;
      return;
    }
    this.pinSaving = true;
    await this.pinService.setPin(this.userName, this.newPin);
    this.hasPinSet  = true;
    this.pinMode    = 'none';
    this.pinSaving  = false;
    // The setup journey is complete — allow the PIN modal to prompt normally again.
    this.pinModalService.endPinSetup();
    this.cameForPinSetup = false;
    this.pinSuccess = 'PIN set successfully. It will be used for session re-authentication.';
    setTimeout(() => this.pinSuccess = '', 5000);
  }

  async removePin(): Promise<void> {
    this.pinError = '';
    const ok = await this.pinService.verifyPin(this.userName, this.currentPin);
    if (!ok) {
      this.pinError = 'Current PIN is incorrect.';
      return;
    }
    this.pinSaving = true;
    this.pinService.clearPin(this.userName);
    this.hasPinSet  = false;
    this.pinMode    = 'none';
    this.pinSaving  = false;
    this.pinSuccess = 'PIN removed. You will be redirected to login when your session expires.';
    setTimeout(() => this.pinSuccess = '', 5000);
  }

  saveAuthTypeChange(): void {
    this.errorMsg   = '';
    this.successMsg = '';
    const newType = this.selectedAuthType;
    if (newType === null) {
      this.errorMsg = 'Please select an authentication type.';
      return;
    }
    if (newType === AuthType.Mobile && !this.user.contactPhone) {
      this.errorMsg = 'No valid mobile number found in your profile. Update using Profile section first.';
      return;
    }
    if (newType === AuthType.Email && !this.user.email) {
      this.errorMsg = 'No valid email found in your profile. Update using Profile section first.';
      return;
    }
    if (newType === AuthType.AuthenticationApp && !this.isMfaEnabled) {
      this.errorMsg = 'Set up the Authenticator App below before choosing it as your login method.';
      return;
    }
    if (newType === AuthType.Fingerprint && !this.isFingerprintEnabled) {
      this.errorMsg = 'Register your fingerprint below before choosing it as your login method.';
      return;
    }
    this.headerService.updateAuthType(this.userName, Number(newType)).subscribe({
      next: () => {
        this.successMsg = 'Preferred authentication mode updated.';
        this.editingAuthType = false;
      },
      error: () => {
        this.errorMsg = 'Failed to update authentication mode.';
      }
    });
  }
}
