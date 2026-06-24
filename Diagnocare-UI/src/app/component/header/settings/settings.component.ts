import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { CommonService } from 'src/app/shared/common.service';
import { jwtDecode } from 'jwt-decode';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { AuthType } from 'src/app/constant/enums';
import { ThemeService, Theme } from 'src/app/services/themeServices/theme.service';
import { PinService } from 'src/app/services/pinServices/pin.service';
import { OtpMfaDialogComponent } from 'src/app/shared/otp-mfa/otp-mfa-dialog.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['../account-pages.shared.css', './settings.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, OtpMfaDialogComponent]
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

  // ── Session PIN ──────────────────────────────────────────────────────────
  hasPinSet = false;
  pinMode: 'none' | 'set' | 'change' | 'remove' = 'none';

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
  // Change PIN fields (requires current PIN verification)
  currentPin        = '';
  changedPin        = '';
  confirmChangedPin = '';
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
  ) {
    const token = this.common.getAccessToken();
    if (token) {
      const decoded = jwtDecode<any>(token || '');
      this.pathology_Id = decoded.typ;
      this.userName = decoded.sub;
    }
  }

  ngOnInit(): void {
    this.headerService.getUserDetails(this.userName).subscribe((data: any) => {
      this.user = data;
      this.selectedAuthType = data.loginType;
    });

    if (this.userName) {
      this.selectedTheme = this.themeService.getForUser(this.userName);
    }

    this.hasPinSet = this.pinService.hasPin(this.userName);
  }

  setTheme(theme: Theme): void {
    this.selectedTheme = theme;
    if (this.userName) {
      this.themeService.setForUser(this.userName, theme);
    }
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

  startChangePin(): void {
    this.mfaAction         = 'change';
    this.mfaError          = '';
    this.mfaSubmitting     = false;
    this.pinError          = '';
    this.pinSuccess        = '';
    this.currentPin        = '';
    this.changedPin        = '';
    this.confirmChangedPin = '';
    this.showMfaDialog     = true;
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
    this.pinSuccess = 'PIN set successfully. It will be used for session re-authentication.';
    setTimeout(() => this.pinSuccess = '', 5000);
  }

  async saveChangedPin(): Promise<void> {
    this.pinError = '';
    const currentOk = await this.pinService.verifyPin(this.userName, this.currentPin);
    if (!currentOk) {
      this.pinError = 'Current PIN is incorrect.';
      return;
    }
    if (!this.isValidPin(this.changedPin)) {
      this.pinError = 'New PIN must be 4–6 digits.';
      return;
    }
    if (this.changedPin !== this.confirmChangedPin) {
      this.pinError = 'New PINs do not match.';
      return;
    }
    const isReuse = await this.pinService.isRecentPin(this.userName, this.changedPin);
    if (isReuse) {
      this.pinError = `You cannot reuse any of your last ${PinService.PIN_HISTORY_SIZE} PINs. Please choose a different PIN.`;
      return;
    }
    this.pinSaving = true;
    await this.pinService.setPin(this.userName, this.changedPin);
    this.pinMode    = 'none';
    this.pinSaving  = false;
    this.pinSuccess = 'PIN changed successfully.';
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
