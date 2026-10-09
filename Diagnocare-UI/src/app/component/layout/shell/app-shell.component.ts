import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { Role } from 'src/app/constant/enums';
import { HeaderComponent } from '../../header/header-menu/header.component';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';

/** One link in the sidebar. */
interface NavItem {
  label: string;
  /** Absolute app route, without the leading slash. */
  route: string;
  icon: string;
  /** Optional query string, e.g. a pre-selected work queue. */
  query?: Record<string, string>;
}

/** A titled block of links. Sections are always open — nothing hides on hover. */
interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Sub-line under the page title, keyed by the first URL segment. Says in one
 * sentence what this screen is for, so the person who landed here by accident
 * knows straight away whether they are in the right place.
 */
const PAGE_HINTS: Record<string, string> = {
  'pathology':          "Today's work at your lab, at a glance",
  'work':               'Each box is a step. Pick one with a number in it and work down the list.',
  'patients':           'Find a patient, register a new one, or open their tests',
  'patient-tests':      'Test results and reports for every patient',
  'receipt':            'Bills and payment receipts',
  'manage-tests':       'The tests your lab offers, their parameters and prices',
  'test-reminders':     'Patients who are due for a repeat test',
  'contacts':           'Doctors, referrers and other contacts',
  'reports':            'Collection, registers and business reports',
  'users':              'Staff accounts and what each person can open',
  'attendance':         'Who is in today and the attendance register',
  'salary':             'Monthly salary and payments',
  'holidays':           'Lab holidays for the year',
  'visit-schedule':     'Home sample collection visits and who is assigned',
  'discount-approvals': 'Discounts above the limit, waiting for your decision',
  'template':           'Report layouts used when printing',
  'lab-setup':          'Sampling locations, areas and other lab settings',
  'lab-profile':        'Lab name, logo and what prints on every report',
  'my-attendance':      'Your own attendance and requests',
  'my-visits':          'Home collection visits assigned to you today',
  'my-salary':          'Your payslips',
  'my-holidays':        'Lab holidays for the year',
  'profile':            'Your name, photo and contact details',
  'settings':           'Theme, text size and sign-in options',
};

/**
 * AppShellComponent — the sidebar frame around every signed-in screen.
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the top header's hover dropdowns with a persistent left sidebar.
 *
 * Why: the old header hid 30+ screens inside five hover menus. A hover menu
 * closes the moment the pointer drifts off it, does nothing on a touch screen,
 * and makes people remember which heading a screen lives under. The sidebar
 * shows every place the person may go, all the time, grouped by the job it
 * belongs to ("Daily work", "Lab setup", "Team"), with live counts beside the
 * ones that have something waiting.
 *
 * It extends HeaderComponent rather than copying it, so access rules, badges,
 * the notification bell, licence banners and logout behave identically in both
 * frames. Only the template differs. Toggle with USE_SIDEBAR_SHELL.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ConfirmModalComponent],
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.css'],
})
export class AppShellComponent extends HeaderComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly tokens = inject(TokenService);
  private navSub?: Subscription;

  sections: NavSection[] = [];
  /** The business reports list is long, so it is the one group that folds. */
  reportsOpen = false;

  pageTitle = '';
  pageHint = '';
  profileOpen = false;
  /** Below 980px the sidebar becomes a drawer. */
  drawerOpen = false;

  findTerm = '';

  /** Front-desk shortcut — shown to every role allowed to register a patient. */
  canRegister = false;
  canFind = false;

  override ngOnInit(): void {
    super.ngOnInit();
    this.buildNav();
    this.updatePageTitle();
    this.navSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => {
        this.updatePageTitle();
        this.drawerOpen = false;
        this.profileOpen = false;
      });
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.navSub?.unsubscribe();
  }

  // ── Navigation model ──────────────────────────────────────────────────────

  /**
   * Builds the sidebar from the same ModuleAccess flags the old header used, so
   * a role sees exactly the screens its route guards allow — never a link that
   * lands on Access Denied.
   */
  private buildNav(): void {
    const a = this.access;
    const roleId = this.tokenRoleId();
    const isCollectionBoy = roleId === Role.Collection_Boy.id;
    const isDoctor = roleId === Role.Doctor.id;

    this.canRegister = a.labOps;
    this.canFind = a.labOps || a.patientsLink;

    const daily: NavItem[] = [];
    if (a.home)                    daily.push({ label: 'Home',             route: 'pathology',     icon: 'fa-house' });
    if (a.labOps && !isCollectionBoy)
                                   daily.push({ label: 'Work queue',       route: 'work',          icon: 'fa-list-check' });
    if (isDoctor)                  daily.push({ label: 'Reports to verify', route: 'work',         icon: 'fa-user-doctor', query: { queue: 'to-verify' } });
    if (a.labOps || a.patientsLink) daily.push({ label: 'Patients',        route: 'patients',      icon: 'fa-users' });
    if (a.labOps || a.patientTestsLink)
                                   daily.push({ label: 'Test reports',     route: 'patient-tests', icon: 'fa-file-medical' });
    if (a.labOps)                  daily.push({ label: 'Bills & receipts', route: 'receipt',       icon: 'fa-receipt' });
    if (a.labOps)                  daily.push({ label: 'Test reminders',   route: 'test-reminders', icon: 'fa-bell' });

    const lab: NavItem[] = [];
    if (a.labOps)    lab.push({ label: 'Tests & prices',    route: 'manage-tests', icon: 'fa-vials' });
    if (a.labOps)    lab.push({ label: 'Doctors & contacts', route: 'contacts',    icon: 'fa-address-book' });
    if (a.labSetup)  lab.push({ label: 'Lab profile',       route: 'lab-profile',  icon: 'fa-hospital' });
    if (a.labSetup)  lab.push({ label: 'Lab settings',      route: 'lab-setup',    icon: 'fa-sliders' });

    const team: NavItem[] = [];
    if (a.adminPanel) {
      for (const item of this.adminOptions) {
        if (item.superAdminOnly && !this.isSuperAdmin) continue;
        team.push({
          label: this.friendlyAdminLabel(item.id, item.label),
          route: item.route,
          icon: item.icon ?? 'fa-circle',
        });
      }
    }

    const mine: NavItem[] = this.visibleUserOptions.map(item => ({
      label: item.label,
      route: item.route,
      icon: item.icon ?? 'fa-circle',
    }));

    // 'Reports' carries no items of its own: the template draws the folding
    // business-reports group under that heading.
    this.sections = [
      { title: 'Daily work', items: daily },
      ...(a.summaryReports ? [{ title: 'Reports', items: [] }] : []),
      { title: 'Lab setup',  items: lab },
      { title: 'Team',       items: team },
      { title: 'My things',  items: mine },
    ].filter(s => s.items.length > 0 || s.title === 'Reports');
  }

  /** Badges change every minute; re-read them on each change-detection pass. */
  liveBadge(item: NavItem): number {
    const admin = this.adminOptions.find(o => o.route === item.route);
    if (admin) return this.badgeFor(admin);
    const user = this.visibleUserOptions.find(o => o.route === item.route);
    return user ? this.badgeFor(user) : 0;
  }

  /** Plainer words for the admin items, without touching the shared constants. */
  private friendlyAdminLabel(id: string, fallback: string): string {
    switch (id) {
      case 'userDetails': return 'Staff';
      case 'template':    return 'Report layouts';
      default:            return fallback;
    }
  }

  private tokenRoleId(): number | null {
    return this.tokens.getUserRole();
  }

  // ── Page title ────────────────────────────────────────────────────────────

  private updatePageTitle(): void {
    let snap: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    let title = '';
    while (snap) {
      if (snap.title) title = snap.title;
      snap = snap.firstChild;
    }
    const first = this.router.url.split(/[/?#]/).filter(Boolean)[0] ?? '';
    this.pageTitle = first === 'pathology' ? 'Home' : title;
    this.pageHint = PAGE_HINTS[first] ?? '';
    if (first === 'reports') this.reportsOpen = true;
  }

  // ── Top bar actions ───────────────────────────────────────────────────────

  findPatient(): void {
    const term = this.findTerm.trim();
    if (!term) return;
    this.router.navigate(['/patients'], { queryParams: { search: term } });
  }

  routeFor(item: NavItem): string {
    return this.isLicenceExpired ? '/licence-expired' : '/' + item.route;
  }

  reportRoute(id: string): string {
    return this.isLicenceExpired ? '/licence-expired' : '/reports/' + id;
  }

  /** Two initials for the avatar tile when there is no photo. */
  get initials(): string {
    const name = (this.userName ?? 'U').replace(/[^A-Za-z ]/g, ' ').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  get hasPhoto(): boolean {
    return !!this.profilePhotoUrl && this.profilePhotoUrl !== '/assets/defaultPic.jpg';
  }

  toggleProfile(event: Event): void {
    event.stopPropagation();
    this.profileOpen = !this.profileOpen;
    this.bellOpen = false;
  }

  override toggleBell(event: Event): void {
    this.profileOpen = false;
    super.toggleBell(event);
  }

  @HostListener('document:click')
  closeProfile(): void {
    this.profileOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    this.profileOpen = false;
    this.drawerOpen = false;
  }
}
