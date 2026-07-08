import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, timer } from 'rxjs';
import { CommonService } from 'src/app/shared/common.service';
import { jwtDecode } from 'jwt-decode';
import { FormsModule } from '@angular/forms';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { ToastrService } from 'ngx-toastr';
import { Role } from 'src/app/constant/enums';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';

/** sessionStorage key for the cached profile photo data-URL. */
const PROFILE_PHOTO_CACHE_KEY = (userName: string) => `diagnocare_profile_img_${userName}`;

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['../account-pages.shared.css', './change-password.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, FormKeyboardDirective]
})
export class ChangePasswordComponent {
  oldPassword = '';
  newPassword = '';
  confirmPassword = '';
  oldPasswordValid: boolean | null = null;
  validating: boolean = false;
  newPasswordMatch: boolean | null = null;
  newPasswordValid: boolean | null = null;
  isForceChange: boolean = false;
  passwordChanged: boolean = false;
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
  private debounceSub?: Subscription;
  private confirmDebounceSub?: Subscription;
  
  userName: string = '';

  // debounce duration in milliseconds for async checks
  private static readonly DEBOUNCE_MS = 500;

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

  onOldPasswordChange() {
    if (this.debounceSub) {
      this.debounceSub.unsubscribe();
    }
    if (!this.oldPassword) {
      this.oldPasswordValid = null;
      return;
    }
    this.validating = true;
    this.debounceSub = timer(ChangePasswordComponent.DEBOUNCE_MS).subscribe(() => {
      this.headerService.validateOldPassword(this.userName, this.oldPassword).subscribe({
        next: (res: any) => {
          this.oldPasswordValid = !!res;
          this.validating = false;
        },
        error: () => {
          this.oldPasswordValid = false;
          this.validating = false;
        }
      });
    });
  }
  
  onConfirmPasswordChange() {
    if (this.confirmDebounceSub) {
      this.confirmDebounceSub.unsubscribe();
    }
    if (!this.newPassword || !this.confirmPassword) {
      this.newPasswordMatch = null;
      return;
    }
    this.confirmDebounceSub = timer(ChangePasswordComponent.DEBOUNCE_MS).subscribe(() => {
      this.newPasswordMatch = this.newPassword === this.confirmPassword;
    });
  }

  changePassword() {
    if (this.newPassword !== this.confirmPassword) {
      this.toastr.warning('New passwords do not match!', 'Validation Error');
      return;
    }
    if (!this.isForceChange && this.oldPasswordValid === false) {
      this.toastr.warning("Old password doesn't match!", 'Validation Error');
      return;
    }
    if (this.newPasswordValid === false) {
      this.toastr.warning('Password does not meet requirements!', 'Validation Error');
      return;
    }
    this.headerService.resetPassword(this.userName, this.newPassword).subscribe({
      next: (res: any) => {
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
        this.oldPasswordValid = null;
        this.newPasswordMatch = null;
        this.newPasswordValid = null;
        if (this.isForceChange) {
          const token = this.common.getAccessToken();
          const payload: any = token ? jwtDecode(token) : {};
          const userType = payload?.aud;
          if (userType === Role.Assistant.label || userType === Role.User.label || userType === Role.Admin.label) {
            this.router.navigate(['/patients']);
          } else {
            this.router.navigate(['/pathology']);
          }
        } else {
          this.passwordChanged = true;
        }
      },
      error: () => {
        this.toastr.error('Failed to change password.', 'Error');
      }
    });
  }
}
