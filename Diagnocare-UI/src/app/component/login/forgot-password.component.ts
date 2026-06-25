import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { LoginService } from 'src/app/services/loginServices/login.service';
import { response } from '../../models/common/response';
import { MemberDto } from '../../models/member/member.dto';
import { OtpMfaDialogComponent } from '../../shared/otp-mfa/otp-mfa-dialog.component';
import { CommonService } from '../../shared/common.service';
import { OtpResponse } from 'src/app/models/otpRequest/otpRequest';
import { VerifyAuthRequest } from 'src/app/models/auth/otp-request.dto';
import { OtpManagerService } from 'src/app/services/otpServices/otp-manager.service';
import { FieldErrorComponent } from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';

const passwordMatchValidator = (group: AbstractControl): ValidationErrors | null => {
  const newPassword = group.get('newPassword')?.value as string | undefined;
  const confirmPassword = group.get('confirmPassword')?.value as string | undefined;
  if (!newPassword || !confirmPassword) {
    return null;
  }
  return newPassword === confirmPassword ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, OtpMfaDialogComponent, FieldErrorComponent, FormKeyboardDirective]
})
export class ForgotPasswordComponent {
  private methodModal: any = null;

  showOtpDialog = false;
  showRecoverModal = false;

  verifyForm: FormGroup;
  methodForm: FormGroup;
  resetForm: FormGroup;
  recoverForm: FormGroup;

  isVerified = false;
  isOtpSent = false;
  isOtpVerified = false;
  isSubmitting = false;
  otpResendSeconds = 60;
  otpResendRemaining = 60;
  private otpTimerId: number | null = null;
  verifiedUserId = '';
  verifiedPathId = '';
  maskedContactNumber = '';
  maskedEmail = '';
  selectedChannel = '';
  disabled = false;
  id:number=0;

  // recover-userid specific state
  recoverIsLookedUp = false;
  recoverIsOtpVerified = false;
  recoveredUserId = '';

  // OTP dialog control flags (change per flow)
  otpShowMethodSelect = true;
  otpShowOtpInput = false;
  otpInfoMessage = '';

  // Flow customisation
  isExpiredFlow = false;

  // Account lockout state
  isAccountLocked = false;
  lockedUntil: Date | null = null;


  constructor(
    private fb: FormBuilder,
    private loginService: LoginService,
    private _otpManager: OtpManagerService,
    private toastr: ToastrService,
    private _common: CommonService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.isExpiredFlow = this.route.snapshot.queryParamMap.get('expired') === 'true';
    window.addEventListener('closeMfaDialog', () => {
      this.showOtpDialog = false;
    });
    window.addEventListener('backFromMfaDialog', () => {
      this.showOtpDialog = false;
      this.isOtpSent = false;
      this.isOtpVerified = false;
      this.isVerified = false;
      this.recoverIsLookedUp = false;
      this.selectedChannel = '';
      this.methodForm.reset();
    });
    this.verifyForm = this.fb.group({
      userId: ['', Validators.required]
    });

    this.methodForm = this.fb.group({
      channel: ['', Validators.required],
      otherValue: ['']
    });
    this.resetForm = this.fb.group(
      {
        newPassword: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', Validators.required]
      },
      { validators: [passwordMatchValidator] }
    );

    this.recoverForm = this.fb.group({
      recoverMethod: ['contact', Validators.required],
      recoverValue: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]]
    });
  }

  get errors(): string[] {
    // this.disabled=true;
    let errorMessage = this._common.getFormValidationErrors(this.verifyForm);
    errorMessage.length > 0 ? this.disabled = true : this.disabled = false;
    return errorMessage;
  }

  private openOtpDialog() {
    this.showOtpDialog = true;
  }
  private closeOtpDialog() {
    this.showOtpDialog = false;
  }
  onOtpVerify(event: { code: string; authType: number }): void {
    this.isSubmitting = true;
    const request: VerifyAuthRequest = {
      authType: event.authType,
      userId:   this.verifiedUserId,
      id:       event.authType === 3 ? 0 : this.id,
      code:     event.code,
    };
    this.loginService.verifyAuth(request).subscribe({
      next: (resp) => {
        this.isSubmitting = false;
        if (resp?.success) {
          this.closeOtpDialog();
          if (this.recoverIsLookedUp) {
            this.recoveredUserId = this.verifiedUserId;
            this.recoverIsOtpVerified = true;
          } else {
            this.isOtpVerified = true;
          }
        } else {
          const msg = (resp as any)?.message || 'Invalid OTP. Please try again.';
          // Lockout detected from verify response — close dialog, show lockout banner
          if (msg.toLowerCase().includes('locked')) {
            this.isAccountLocked = true;
            this.lockedUntil     = null;
            this.closeOtpDialog();
            this.toastr.error(msg, 'Access Denied', { timeOut: 6000 });
            return;
          }
          this.toastr.error(msg);
        }
      },
      error: () => {
        this.isSubmitting = false;
        this.toastr.error('Invalid OTP. Please try again.');
      },
    });
  }

  /**
   * Called when the OTP dialog emits (lockoutDetected) — the dialog detected
   * a lockout internally (from a failed resend/send response).
   */
  onDialogLockoutDetected(): void {
    this.isAccountLocked = true;
    this.lockedUntil     = null;
    this.closeOtpDialog();
    this.toastr.error(
      'Your account is locked due to multiple failed attempts. Please try again after 15 minutes.',
      'Access Denied',
      { timeOut: 6000 }
    );
  }

  onOtpResend() {
    this._otpManager.resendOtp(this.id, this.verifiedUserId).subscribe({
      next: () => {
        this.toastr.info('OTP resent!');
        this.otpResendRemaining = this.otpResendSeconds;
        if (this.otpTimerId) {
          clearInterval(this.otpTimerId);
        }
      },
      error: () => { this.toastr.error('Failed to resend OTP. Please try again.'); }
    });
    this.otpTimerId = window.setInterval(() => {
      this.otpResendRemaining--;
      if (this.otpResendRemaining <= 0 && this.otpTimerId) {
        clearInterval(this.otpTimerId);
        this.otpTimerId = null;
      }
    }, 1000);
  }
  onChannelChange(channel: string) {
    // Handle channel change if needed
  }
  private maskContactNumber(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (!digits) {
      return '';
    }
    const maskIndices = new Set([1, 4, 5, 6, 8]);
    return digits
      .split('')
      .map((char, index) => (maskIndices.has(index) ? '*' : char))
      .join('');
  }

  private maskEmail(value: string): string {
    const trimmed = value.trim();
    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0) {
      return '';
    }
    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);
    const lastIndex = local.length - 1;
    const lastSecondIndex = local.length - 2;
    const visibleIndices = new Set([0, 1, 4, 5, lastSecondIndex, lastIndex]);
    const maskedLocal = local
      .split('')
      .map((char, index) => (visibleIndices.has(index) ? char : '*'))
      .join('');
    return `${maskedLocal}@${domain}`;
  }
  verifyUser(): void {
    if (this.verifyForm.invalid) {
      this.verifyForm.markAllAsTouched();
      this.toastr.error('Please enter user name.');
      return;
    }

    const userId = this.verifyForm.get('userId')?.value as string;

    this.isSubmitting = true;
    // Use checkUserExists (no password hashing) — forgot password only needs to
    // confirm the userId is valid before sending an OTP.
    this.loginService.checkUserExists(userId).subscribe({
      next: (resp: MemberDto & { success?: boolean; message?: string; token?: string; accountLocked?: boolean; lockedUntil?: string }) => {
        // Account locked — block the OTP flow entirely.
        if ((resp as any)?.accountLocked === true) {
          this.isAccountLocked = true;
          this.lockedUntil = (resp as any).lockedUntil ? new Date((resp as any).lockedUntil) : null;
          this.toastr.error(
            'Your account is locked due to multiple failed attempts. Please try again after 15 minutes.',
            'Access Denied',
            { timeOut: 6000 }
          );
          this.isSubmitting = false;
          return;
        }

        // Clear any stale lockout state on a valid response.
        this.isAccountLocked = false;
        this.lockedUntil = null;

        // Handle explicit invalid credentials response
        if (resp && resp.success === false && resp.message === 'Invalid credentials') {
          this.toastr.error('Invalid credential');
          this.isSubmitting = false;
          return;
        }

        if (resp) {
          // Backend serialises User_Id as "user_Id" (camelCase); resp.id is always undefined
          this.id = (resp as any).user_Id ?? resp.id ?? 0;
          this.isVerified = true;
          this.isOtpSent = false;
          this.isOtpVerified = false;
          this.verifiedUserId = userId;
          this.selectedChannel = '';
          this.methodForm.reset();
          this.resetForm.reset();
          // Set masked details and open dialog
          this.maskedContactNumber = resp?.contactPhone ? this.maskContactNumber(String(resp.contactPhone)) : '';
          if (this.maskedContactNumber && !this.maskedContactNumber.startsWith('(')) {
            this.maskedContactNumber = `(${this.maskedContactNumber})`;
          }
          this.maskedEmail = resp?.email ? this.maskEmail(String(resp.email)) : '';
          if (this.maskedEmail && !this.maskedEmail.startsWith('(')) {
            this.maskedEmail = `(${this.maskedEmail})`;
          }
          this.openOtpDialog();
        } else {
          this.toastr.error('User name do not match our records.');
        }
        this.isSubmitting = false;
      },
      error: () => {
        this.isSubmitting = false;
        this.toastr.error('User name do not match our records.');
      }
    });
  }

  resetPassword(): void {
    if (!this.isVerified || !this.isOtpVerified) {
      this.toastr.error('Please verify your OTP before resetting the password.');
      return;
    }

    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      this.toastr.error('Please fix the password fields.');
      return;
    }

    const newPassword = this.resetForm.get('newPassword')?.value as string;

    this.isSubmitting = true;
    this.loginService.forgotPassword(this.verifiedUserId, newPassword).subscribe({
      next: (resp: response) => {
        this.isSubmitting = false;
        if (resp?.success) {
          this.toastr.success(resp?.message || 'Password updated successfully.');
          this.router.navigate(['/login']);
        } else {
          this.toastr.error(resp?.message || 'Unable to update password.');
          this.resetForm.get('newPassword')?.reset();
          this.resetForm.get('confirmPassword')?.reset();
        }
      },
      error: () => {
        this.isSubmitting = false;
        this.toastr.error('Unable to update password.');
        this.resetForm.get('newPassword')?.reset();
        this.resetForm.get('confirmPassword')?.reset();
      }
    });
  }

  get passwordMismatch(): boolean {
    return !!this.resetForm.errors?.['passwordMismatch'];
  }

  openRecoverModal(): void {
    this.recoverIsLookedUp = false;
    this.recoverIsOtpVerified = false;
    this.recoveredUserId = '';
    this.showOtpDialog = false;
    this.recoverForm.reset({ recoverMethod: 'contact', recoverValue: '' });
    this.recoverForm.get('recoverValue')?.setValidators([Validators.required, Validators.pattern(/^[0-9]{10}$/)]);
    this.recoverForm.get('recoverValue')?.updateValueAndValidity();
    this.showRecoverModal = true;
  }

  closeRecoverModal(): void {
    this.showRecoverModal = false;
    this.recoverIsLookedUp = false;
    this.recoverIsOtpVerified = false;
    this.recoveredUserId = '';
    this.maskedContactNumber = '';
    this.maskedEmail = '';
    this.verifiedUserId = '';
    this.recoverForm.reset({ recoverMethod: 'contact', recoverValue: '' });
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeRecoverModal();
    }
  }

  onRecoverMethodChange(): void {
    const method = this.recoverForm.get('recoverMethod')?.value as string;
    const valueControl = this.recoverForm.get('recoverValue');
    valueControl?.reset();
    if (method === 'contact') {
      valueControl?.setValidators([Validators.required, Validators.pattern(/^[0-9]{10}$/)]);
    } else {
      valueControl?.setValidators([Validators.required, Validators.email]);
    }
    valueControl?.updateValueAndValidity();
  }

  lookupForRecovery(): void {
    if (this.recoverForm.invalid) {
      this.recoverForm.markAllAsTouched();
      return;
    }
    const method = this.recoverForm.get('recoverMethod')?.value as 'contact' | 'email';
    const value = this.recoverForm.get('recoverValue')?.value as string;
    const channel = method === 'contact' ? 'phone' : 'email';

    this.isSubmitting = true;
    this.loginService.getUserIdByContact(method, value).subscribe({
      next: (resp) => {
        if (resp?.success) {
          this.verifiedUserId = resp.token || resp.userId || '';
          this.id = (resp as any).id ?? 0;
          // Mask the entered value for display in OTP dialog
          if (method === 'contact') {
            this.maskedContactNumber = `(${this.maskContactNumber(value)})`;
            this.maskedEmail = '';
          } else {
            this.maskedEmail = `(${this.maskEmail(value)})`;
            this.maskedContactNumber = '';
          }
          this.recoverIsLookedUp = true;
          // Auto-send OTP to the contact/email they provided
          const emailVal = method === 'email' ? value : undefined;
          const phoneVal = method === 'contact' ? value : undefined;
          this._otpManager.generateOtp({
            id: this.id,
            userId: this.verifiedUserId,
            channel: channel as any,
            email: emailVal,
            contactPhone: phoneVal
          }).subscribe({
            next: (resp) => {
              this.isSubmitting = false;
              if (resp?.success === false) {
                // Mark lockout if the backend says the account is locked.
                if (resp.message?.toLowerCase().includes('locked')) {
                  this.isAccountLocked = true;
                }
                this.toastr.error(resp.message || 'Failed to send OTP. Please try again.');
              } else {
                this.otpShowMethodSelect = false;
                this.otpShowOtpInput = true;
                this.otpInfoMessage = method === 'contact'
                  ? `OTP sent to your contact number ${this.maskedContactNumber}`
                  : `OTP sent to your email address ${this.maskedEmail}`;
                this.openOtpDialog();
              }
            },
            error: () => {
              this.isSubmitting = false;
              this.toastr.error('Account found but failed to send OTP. Please try again.');
            }
          });
        } else {
          this.isSubmitting = false;
          const fieldLabel = method === 'contact' ? 'contact number' : 'email address';
          this.toastr.error(resp?.message || `No account found with this ${fieldLabel}.`);
        }
      },
      error: () => {
        this.isSubmitting = false;
        const fieldLabel = method === 'contact' ? 'contact number' : 'email address';
        this.toastr.error(`No account found with this ${fieldLabel}.`);
      }
    });
  }
}
