import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
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
import { DiscountApprovalService } from 'src/app/services/discountApprovalServices/discount-approval.service';
import { AttendanceService } from 'src/app/services/attendanceServices/attendance.service';
import { NotificationService } from 'src/app/services/notificationServices/notification.service';
import {
  EMPTY_NOTIFICATION_COUNTS, NotificationModuleKey, UserNotification, UserNotificationCounts,
} from 'src/app/models/notification/user-notification.model';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ConfirmModalComponent]
})

export class HeaderComponent implements OnInit, OnDestroy {
  // Named handler so the profile-updated listener can be removed on destroy
  // (anonymous listeners leak and stack when the header is re-created).
  private readonly profileUpdatedHandler = (): void => { this.fetchProfileImage(); };

  labOperationMenu = Object.values(labOperationMenu);
  summaryReportMenu = Object.values(summaryReportMenu);
  profileMenu = Object.values(profileMenu);
  adminOptions = Object.values(adminOptions);
  /** Every possible User Panel item; `visibleUserOptions` is what renders. */
  userOptions = Object.values(userOptions);
  labSetupMenu =Object.values(labSetupMenu);

  /**
   * The User Panel items this role may actually open, filtered by each item's
   * matching ModuleAccess flag. Recomputed in checkAdminPanelAccess() once the
   * role is resolved. Never bind the raw `userOptions` list — that hands a role
   * links its own route guard will bounce it off of.
   */
  visibleUserOptions: typeof this.userOptions = [];

  userName: string | null = null;
  profilePhotoUrl: string | null = null;
  pathologyId: string | null = null;

  /** Resolved from the JWT role claim — drives all nav visibility. */
  access: ModuleAccess = DEFAULT_ACCESS;
  /** True for Admin or Super Admin — controls whether the Admin Panel is shown. */
  isAdmin = false;
  /** True only for Super Admin — hides owner-level items (payroll) from Admin. */
  isSuperAdmin = false;
  /** Human-readable role label shown in the profile dropdown. */
  roleLabel = '';

  mobileNavOpen = false;

  /** Super Admin only: discounts over the lab limit awaiting a decision (nav badge). */
  discountPendingCount = 0;
  /** Super Admin only: attendance corrections / withdrawals awaiting a decision (nav badge). */
  attendanceRequestPendingCount = 0;
  /** Everyone: the caller's own unread notifications (bell + User Panel badges). */
  notificationCounts: UserNotificationCounts = EMPTY_NOTIFICATION_COUNTS;

  /** Bell dropdown state. Click-toggled rather than hover, so it works on touch screens. */
  bellOpen = false;
  bellLoading = false;
  bellItems: UserNotification[] = [];

  private badgeSubs = new Subscription();
  /**
   * How often every badge re-checks — ONE timer for all of them. A minute is plenty
   * for a front-desk queue, and live push was removed on purpose (see
   * services/sessionSignalR/session-signalr.service.ts).
   */
  private static readonly BADGE_POLL_MS = 60_000;
  /** Refresh straight away when the tab comes back into view, rather than up to a minute later. */
  private readonly visibilityHandler = (): void => {
    if (document.visibilityState === 'visible') this.refreshBadges();
  };

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
    private discountApprovals: DiscountApprovalService,
    private attendanceSvc: AttendanceService,
    private notifications: NotificationService,
    private host: ElementRef<HTMLElement>,
  ) {
    this.extractUserName();
    this.extractPathologyId();
    this.checkAdminPanelAccess();
    this.fetchProfileImage();
    // Listen for profile update event
    window.addEventListener('diagnocare-profile-updated', this.profileUpdatedHandler);
  }

  ngOnInit(): void {
    this.licenceSvc.load().subscribe(() => {
      this.isLicenceExpired      = this.licenceSvc.isExpired;
      this.isLicenceExpiringSoon = this.licenceSvc.isExpiringSoon(15);
      this.licenceDaysLeft       = this.licenceSvc.daysLeft;
      this.licenceExpiryDate     = this.licenceSvc.expiryDate;
    });

    // ── Badges: Super Admin queues + everyone's own notifications ────────────
    if (this.isSuperAdmin) {
      this.badgeSubs.add(
        this.discountApprovals.pendingCount$.subscribe(n => this.discountPendingCount = n));
      this.badgeSubs.add(
        this.attendanceSvc.pendingRequestCount$.subscribe(n => this.attendanceRequestPendingCount = n));
    }
    if (this.userName) {
      this.badgeSubs.add(
        this.notifications.counts$.subscribe(c => this.notificationCounts = c));
    }
    this.refreshBadges();
    this.badgeSubs.add(
      interval(HeaderComponent.BADGE_POLL_MS).subscribe(() => this.refreshBadges()));
    document.addEventListener('visibilitychange', this.visibilityHandler);

    // ── PIN expiry banner ────────────────────────────────────────────────────
    if (this.userName) {
      this.isPinExpiringSoon = this.pinService.isPinExpiringSoon(this.userName);
      this.pinDaysLeft       = this.pinService.getPinDaysLeft(this.userName);
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('diagnocare-profile-updated', this.profileUpdatedHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.badgeSubs.unsubscribe();
  }

  /**
   * One pass over every badge this user can see. Skipped while the licence is expired
   * (every module is locked, so there is nothing to act on) and while the tab is
   * hidden (the visibility handler catches up when it comes back).
   */
  private refreshBadges(): void {
    if (this.isLicenceExpired || document.visibilityState === 'hidden') return;
    if (this.isSuperAdmin) {
      this.discountApprovals.refreshPendingCount();
      this.attendanceSvc.refreshPendingRequestCount();
    }
    if (this.userName) this.notifications.refreshUnread();
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
    this.isAdmin      = this.tokenService.isAdmin();
    this.isSuperAdmin = this.tokenService.isSuperAdmin();

    // Derive the readable role label directly from the Role config
    this.roleLabel = role !== null
      ? (Object.values(Role).find(r => r.id === role)?.label ?? '')
      : '';

    // Filter the full User Panel item list down to what this role's ModuleAccess
    // flags allow. Was never computed, so the User Panel dropdown always rendered
    // empty (no My Attendance / My Salary / My Holidays / My Visits) for every role.
    this.visibleUserOptions = this.userOptions.filter(item => this.access[item.access]);
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


  /**
   * Badge count for an Admin Panel or User Panel item.
   * Admin Panel: things waiting on the Super Admin (a queue).
   * User Panel: the user's own unread notifications for that page (events).
   */
  badgeFor(item: { id: string }): number {
    const m = this.notificationCounts.byModule;
    switch (item.id) {
      case 'discountApprovals': return this.isSuperAdmin ? this.discountPendingCount : 0;
      case 'attendance':        return this.isSuperAdmin ? this.attendanceRequestPendingCount : 0;
      case 'myVisits':          return m.visit;
      case 'mySalary':          return m.salary;
      // Request decisions surface on My Attendance too — that is where a request is raised.
      case 'myAttendance':      return m.attendance + m.attendanceRequest;
      default:                  return 0;
    }
  }

  /** Total on the Admin Panel button: every Super Admin queue. */
  get adminPanelBadge(): number {
    return this.isSuperAdmin ? this.discountPendingCount + this.attendanceRequestPendingCount : 0;
  }

  /** Tooltip naming each part, e.g. "2 discount approvals, 3 attendance requests". */
  get adminPanelBadgeTitle(): string {
    const parts: string[] = [];
    if (this.discountPendingCount > 0)
      parts.push(`${this.discountPendingCount} discount approval${this.discountPendingCount === 1 ? '' : 's'}`);
    if (this.attendanceRequestPendingCount > 0)
      parts.push(`${this.attendanceRequestPendingCount} attendance request${this.attendanceRequestPendingCount === 1 ? '' : 's'}`);
    return parts.length ? `${parts.join(', ')} awaiting your decision` : '';
  }

  // No total on the User Panel button on purpose: it would repeat the bell's count
  // (same unread notifications). The bell carries the total; the per-item badges inside
  // the User Panel dropdown only point to which page has something new.

  /** "9+" above nine, so the badge never widens the header. */
  badgeText(n: number): string {
    return n > 9 ? '9+' : String(n);
  }

  // ── Notification bell ──────────────────────────────────────────────────────

  toggleBell(event: Event): void {
    event.stopPropagation();
    this.bellOpen = !this.bellOpen;
    if (this.bellOpen) this.loadBell();
  }

  private loadBell(): void {
    this.bellLoading = true;
    this.notifications.list(20).subscribe(items => {
      this.bellItems = items;
      this.bellLoading = false;
    });
  }

  openNotification(n: UserNotification): void {
    this.bellOpen = false;
    if (!n.isRead) {
      n.isRead = true;
      this.notifications.markRead(n.id).subscribe();
    }
    if (n.route) this._router.navigateByUrl(n.route);
  }

  markAllNotificationsRead(event: Event): void {
    event.stopPropagation();
    this.bellItems.forEach(n => n.isRead = true);
    this.notifications.markAllRead().subscribe();
  }

  get hasUnreadInBell(): boolean {
    return this.bellItems.some(n => !n.isRead);
  }

  /** Font Awesome icon per module. */
  notificationIcon(module: NotificationModuleKey): string {
    switch (module) {
      case 'visit':             return 'fa-route';
      case 'salary':            return 'fa-money-bill-wave';
      case 'attendanceRequest': return 'fa-clipboard-check';
      default:                  return 'fa-calendar-check';
    }
  }

  /** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
  timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    const s = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (s < 60) return 'just now';
    const min = Math.round(s / 60);
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    if (d < 7) return `${d} d ago`;
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** Close the bell on any click outside it. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.bellOpen) return;
    const bell = this.host.nativeElement.querySelector('.dc-bell-host');
    if (bell && !bell.contains(event.target as Node)) this.bellOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.bellOpen = false;
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
