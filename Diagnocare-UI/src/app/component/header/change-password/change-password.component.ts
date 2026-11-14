import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonService } from 'src/app/shared/common.service';
import { jwtDecode } from 'jwt-decode';
import { FormsModule } from '@angular/forms';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { ToastrService } from 'ngx-toastr';
import { Role } from 'src/app/constant/enums';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';
import { MaskedInputDirective } from 'src/app/shared/directives/masked-input.directive';

/** sessionStorage key for the cached profile photo data-URL. */
const PROFILE_PHOTO_CACHE_KEY = (userName: string) => `diagnocare_profile_img_${userName}`;

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['../account-pages.shared.css', './change-password.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, FormKeyboardDirective, MaskedInputDirective]
})
export class ChangePasswordComponent {
  oldPassword = '';
  newPassword = '';
  confirmPassword = '';
  newPasswordMatch: boolean | null = null;
  newPasswordValid: boolean | null = null;
  isForceChange: boolean = false;
  passwordChanged: boolean = false;
  /** True while the change request is in flight, so the form cannot be submitted twice. */
  submitting: boolean = false;
  profilePhotoUrl: string = '/assets/defaultPic.jpg';
    onNewPasswordChange() {
      this.newPasswordValid = this.validatePasswordStrength(this.newPassword);
      // Also re-check confirm password match if confirmPassword has value
      if (this.confirmPassword) {
        this.onConfirmPasswordChange();
      }
    }

    validatePasswordStrength(password: string): boolean {
      // At least 8 chars, 1 lower, 1 upper, 1 number, 1 special
      const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
      return pattern.test(password);
    }
  userName: string = '';

  constructor(
    private headerService: HeaderService,
    private common: CommonService,
    private router: Router,
    private toastr: ToastrService,
    private route: ActivatedRoute
  ) {
    const token = this.common.getAccessToken();
    if (token) {
      try {
        const payload = jwtDecode<any>(token);
        this.userName = payload.sub || '';
      } catch (e) {
        this.userName = '';
      }
    }
    this.isForceChange = this.route.snapshot.queryParamMap.get('forceChange') === 'true';
    
  }

  // The current password is verified by the server when the change is submitted. There is
  // deliberately no live "is this my password?" check: that would be a password oracle. So the
  // only thing the form can assert locally is that the field has been filled in.

  onConfirmPasswordChange() {
    // A string comparison is synchronous: debouncing it only left the button's enabled state
    // trailing behind what the user had actually typed.
    if (!this.newPassword || !this.confirmPassword) {
      this.newPasswordMatch = null;
      return;
    }
    this.newPasswordMatch = this.newPassword === this.confirmPassword;
  }

  changePassword() {
    if (this.submitting) {
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.toastr.warning('New passwords do not match!', 'Validation Error');
      return;
    }
    if (this.newPasswordValid === false) {
      this.toastr.warning('Password does not meet requirements!', 'Validation Error');
      return;
    }
    this.submitting = true;
    this.headerService.changePassword(this.isForceChange ? '' : this.oldPassword, this.newPassword).subscribe({
      next: (res: any) => {
        this.submitting = false;
        if (res?.success === false) {
          this.toastr.error(res.message || 'Failed to change password.', 'Error');
          this.newPassword = '';
          this.confirmPassword = '';
          this.newPasswordMatch = null;
          this.newPasswordValid = null;
          return;
        }
        this.oldPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
        this.newPasswordMatch = null;
        this.newPasswordValid = null;
        if (this.isForceChange) {
          const token = this.common.getAccessToken();
          const payload: any = token ? jwtDecode(token) : {};
          const userType = payload?.aud;
          if (userType === Role.Assistant.label || userType === Role.Receptionist.label || userType === Role.Admin.label) {
            this.router.navigate(['/patients']);
          } else {
            this.router.navigate(['/pathology']);
          }
        } else {
          this.passwordChanged = true;
        }
      },
      error: () => {
        this.submitting = false;
        this.toastr.error('Failed to change password.', 'Error');
      }
    });
  }
}
