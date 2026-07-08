import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { labOperationMenu, summaryReportMenu, labSetupMenu, profileMenu, adminOptions, userOptions } from 'src/app/constant/constants';
import { Role, RoleId } from 'src/app/constant/enums';
import { ModuleAccess, MODULE_ACCESS, DEFAULT_ACCESS } from 'src/app/constant/module-access';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { CommonService } from 'src/app/shared/common.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { LoginService } from 'src/app/services/loginServices/login.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { LicenceService } from 'src/app/services/licenceServices/licence.service';
import { PinService } from 'src/app/services/pinServices/pin.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ConfirmModalComponent]
})

export class HeaderComponent implements OnInit {
  labOperationMenu = Object.values(labOperationMenu);
  summaryReportMenu = Object.values(summaryReportMenu);
  profileMenu = Object.values(profileMenu);
  adminOptions = Object.values(adminOptions);
  userOptions = Object.values(userOptions);
  labSetupMenu =Object.values(labSetupMenu);

  userName: string | null = null;
  profilePhotoUrl: string | null = null;
  pathologyId: string | null = null;

  /** Resolved from the JWT role claim — drives all nav visibility. */
  access: ModuleAccess = DEFAULT_ACCESS;
  /** True only for Super Admin — controls super-admin-only items inside Admin Panel. */
  isSuperAdmin = false;
  /** Human-readable role label shown in the profile dropdown. */
  roleLabel = '';

  mobileNavOpen = false;

  // ── Licence state ──────────────────────────────────────────────────────────
  isLicenceExpired   = false;
  isLicenceExpiringSoon = false;
  licenceDaysLeft: number | null = null;
  licenceExpiryDate: Date | null = null;

  // ── PIN expiry state ────────────────────────────────────────────────────────
  isPinExpiringSoon  = false;
  pinDaysLeft: number | null = null;

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
  }

  constructor(
    private common: CommonService,
    private headerService: HeaderService,
    private _router: Router,
    private confirmModal: ConfirmModalService,
    private tokenService: TokenService,
    private loginService: LoginService,
    private licenceSvc: LicenceService,
    private pinService: PinService,
  ) {
    this.extractUserName();
    this.extractPathologyId();
    this.checkAdminPanelAccess();
    this.fetchProfileImage();
    // Listen for profile update event
    window.addEventListener('diagnocare-profile-updated', () => {
      this.fetchProfileImage();
    });
  }

  ngOnInit(): void {
    this.licenceSvc.load().subscribe(() => {
      this.isLicenceExpired      = this.licenceSvc.isExpired;
      this.isLicenceExpiringSoon = this.licenceSvc.isExpiringSoon(15);
      this.licenceDaysLeft       = this.licenceSvc.daysLeft;
      this.licenceExpiryDate     = this.licenceSvc.expiryDate;
    });

    // ── PIN expiry banner ────────────────────────────────────────────────────
    if (this.userName) {
      this.isPinExpiringSoon = this.pinService.isPinExpiringSoon(this.userName);
      this.pinDaysLeft       = this.pinService.getPinDaysLeft(this.userName);
    }
  }

  navigateToHome() {
    // Emit custom event for home navigation
    const navigationEvent = new CustomEvent('diagnocare-navigate', {
      detail: { page: 'home' },
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(navigationEvent);
  }

  onProfileMenuClick(item: { id: string; label: string; route: string; icon: string }, event: Event) {
    event.preventDefault();
    if (item?.route) {
      this._router.navigate([item.route]);
    }
  }

  extractUserName(): void {
    this.userName = this.tokenService.decodeToken()?.sub ?? null;
  }

  extractPathologyId(): void {
    // `typ` is a non-standard claim — cast through unknown to access it safely
    this.pathologyId = (this.tokenService.decodeToken() as any)?.typ ?? null;
  }

  /**
   * Resolve module access and role label from the JWT.
   * Called once in the constructor and whenever the profile is refreshed.
   */
  checkAdminPanelAccess(): void {
    const role = this.tokenService.getUserRole();
    this.access      = role !== null ? (MODULE_ACCESS[role] ?? DEFAULT_ACCESS) : DEFAULT_ACCESS;
    this.isSuperAdmin = this.tokenService.isSuperAdmin();

    // Derive the readable role label directly from the Role config
    this.roleLabel = role !== null
      ? (Object.values(Role).find(r => r.id === role)?.label ?? '')
      : '';
  }

  fetchProfileImage() {
    if (!this.userName) {
      this.profilePhotoUrl = '/assets/defaultPic.jpg';
      return;
    }
    // Inject HeaderService and call getProfileImage
    this.headerService.getProfileImage(this.userName).subscribe({
      next: (blob: any) => {
        // If the response is a Blob and has size, and not JSON, show the image
        if (blob instanceof Blob && blob.size > 0 && blob.type !== 'application/json') {
          const reader = new FileReader();
          reader.onload = (e: any) => {
            this.profilePhotoUrl = e.target.result;
          };
          reader.readAsDataURL(blob);
        } else {
          // If the response is JSON (error), show default pic
          this.profilePhotoUrl = '/assets/defaultPic.jpg';
        }
      },
      error: () => {
        this.profilePhotoUrl = '/assets/defaultPic.jpg';
      }
    });
  }


  redirectionToModule(item: any): void {
    if (this.isLicenceExpired) {
      this._router.navigate(['/licence-expired']);
      return;
    }
    if (item.route) {
      this._router.navigate([item.route]);
    } else {
      console.warn('Invalid route ID:', item);
    }
  }

  redirectionToSummaryReport(item: any): void {
    if (this.isLicenceExpired) {
      this._router.navigate(['/licence-expired']);
      return;
    }
    // Navigate directly to the child route — no ?report= query param needed.
    // item.id is the kebab-case segment (e.g. 'register-reports', 'address-manager').
    if (item.id) {
      this._router.navigate(['/reports', item.id]);
    } else {
      console.warn('Invalid menu item:', item);
    }
  }

  // navigateToAddressManager(): void {
  //   if (this.isLicenceExpired) {
  //     this._router.navigate(['/licence-expired']);
  //     return;
  //   }
  //   this.redirectionToModule({ route: 'contacts' });
  // }

  /** Formatted expiry date string for the banner. */
  get formattedExpiryDate(): string {
    if (!this.licenceExpiryDate) return '';
    const d = this.licenceExpiryDate;
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
  }

  logout(event: Event) {
    event.preventDefault();
    this.confirmModal.confirm({
      title: 'Confirm Logout',
      message: 'Are you sure you want to logout?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
      showLoadingOnConfirm: true
    }).subscribe(confirmed => {
      if (!confirmed) return;
      // Keep the modal open with a spinner while the backend clears ActiveSessionId.
      this.confirmModal.setLoading(true);
      this.loginService.logout().subscribe({
        next: () => {
          this.confirmModal.dismiss();
          window.location.href = '/';
        },
        error: () => {
          // Re-enable the modal so the user can try again or cancel.
          this.confirmModal.setLoading(false);
        }
      });
    });
  }
}
