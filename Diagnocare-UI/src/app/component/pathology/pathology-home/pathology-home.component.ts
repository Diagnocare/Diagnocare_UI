import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { DashboardService } from 'src/app/services/dashboardServices/dashboard.service';
import { HomeSummary, HomeActivity, HomeWeekDay } from 'src/app/models/dashboard/home-summary';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { Role, RoleId } from 'src/app/constant/enums';
import { MODULE_ACCESS, DEFAULT_ACCESS, ModuleAccess } from 'src/app/constant/module-access';

/**
 * A count the API sent, or null when it sent nothing usable.
 *
 * The tiles render null as a dash, so a missing figure reads as "not known" rather
 * than as a genuinely quiet day. Revenue arrives as null by design for a role that
 * may not see report data.
 */
function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

/**
 * One tile in the "Every Module, at a Glance" gallery.
 *
 * The tiles were previously decorative — they carried `cursor: pointer` and a
 * hover lift but no handler, so they read as clickable and did nothing. Each one
 * now carries the route of the module it previews.
 */
interface ShowcaseModule {
  /** Used for the aria-label, so it must match the title rendered on the tile. */
  title: string;
  /** Route the tile opens. Must exist in app-routing.module.ts. */
  route: string;
  /**
   * Module-access flag the role must hold to open this route. Omitted when every
   * role that can reach this page can also open the route.
   *
   * This mirrors the route's own roleGuard — without it a User would click
   * Revenue Dashboards and land on Access Denied, because /reports is granted to
   * every role EXCEPT User (see MODULE_ACCESS and the /reports guard).
   */
  requires?: keyof ModuleAccess;
}

interface ActionCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  color: string;
}

interface CardGroup {
  label: string;
  icon: string;
  cards: ActionCard[];
}

/** One row in the hero's live-activity card. */
interface ActivityRow {
  name: string;
  /** 'Pending' | 'Partial' | 'Completed' — as computed by the API. */
  status: string;
  /** CSS class for the status pill (vb-done | vb-prog | vb-wait). */
  badgeClass: string;
  /** Dot colour, matched to the status. */
  dotColor: string;
}

/** One bar in the hero's "Registrations This Week" sparkline. */
interface SparkBar {
  /** Mon…Sun */
  label: string;
  count: number;
  /** Rendered height in px, scaled against the busiest day of the week. */
  height: number;
  /** True for days that haven't happened yet — rendered flat and faded. */
  future: boolean;
}

@Component({
  selector: 'app-pathology-home',
  templateUrl: './pathology-home.component.html',
  styleUrls: ['./pathology-home.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class PathologyHomeComponent implements OnInit, OnDestroy {

  userRole: RoleId | null = null;
  userRoleDisplay = '';
  userName = '';

  greeting = '';
  todayDisplay = '';
  currentYear = new Date().getFullYear();

  showExpiryBanner = false;
  isLicenseExpired = false;
  expiryDate = '';
  daysUntilExpiry = 0;

  cardGroups: CardGroup[] = [];

  /**
   * Routes behind the module gallery tiles. Kept here rather than inline in the
   * template so the four tiles, their guards and their labels sit in one place.
   *
   * Routes are the same ones the header menu uses (see labOperationMenu in
   * constants.ts), so a tile and the nav entry for the same module always land
   * on the same screen.
   */
  readonly modules: Record<'patients' | 'reports' | 'analytics' | 'billing', ShowcaseModule> = {
    patients:  { title: 'Patient Registration', route: '/patients' },
    reports:   { title: 'PDF Report Engine',    route: '/patient-tests' },
    analytics: { title: 'Revenue Dashboards',   route: '/reports/referrer-collection',
                 requires: 'summaryReports' },
    billing:   { title: 'Billing & Receipts',   route: '/receipt' },
  };

  /** Nav/module permissions for the signed-in role; drives the tile locks. */
  private access: ModuleAccess = DEFAULT_ACCESS;

  /** Inline style strings for floating hero particles (generated once on init). */
  particleStyles: string[] = [];

  /** Controls the video tutorial modal. */
  isVideoOpen = false;

  // ── Dashboard state ─────────────────────────────────────────────────────
  //  Null means "no value": still loading, or the request failed. Deliberately
  //  not 0, which would read as a real quiet day.
  //
  //  All five come from one call (see loadDashboard), and the three test counts
  //  are at test grain, so the row adds up:
  //  testsBookedToday = reportsDone + testsPending.

  patientsToday:    number | null = null;
  /** Individual tests booked today — a three-test visit counts three. */
  testsBookedToday: number | null = null;
  /** Of today's booked tests, how many have results. */
  reportsDone:      number | null = null;
  /** Of today's booked tests, how many are still waiting. */
  testsPending:     number | null = null;
  /** Null for a role that may not see report data — the tile shows a dash. */
  revenueToday:     number | null = null;

  /** Today's most recent bookings, newest first. Max 3. */
  activityRows: ActivityRow[] = [];

  /** Mon–Sun registration counts for the current week. */
  sparkBars: SparkBar[] = [];

  isDashboardLoading = true;

  private destroy$ = new Subject<void>();

  constructor(
    private pathologyService: PathologyService,
    private dashboardService: DashboardService,
    private router: Router,
    private tokenService: TokenService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadUserInfo();
    this.buildGreeting();
    this.buildCards();
    this.checkPathologyExpiry();
    this.initParticles();
    this.loadDashboard();
  }

  // ── Licence progress ────────────────────────────────────────────────────

  /**
   * Percentage of licence days remaining (0–100).
   * Assumes a 365-day full licence; clamps to [0, 100].
   */
  get licenceProgressPct(): number {
    if (this.daysUntilExpiry <= 0) return 0;
    return Math.min(100, Math.round((this.daysUntilExpiry / 365) * 100));
  }

  // ── Video modal ─────────────────────────────────────────────────────────

  openVideo(): void  { this.isVideoOpen = true;  }
  closeVideo(): void { this.isVideoOpen = false; }

  // ── Navigation ──────────────────────────────────────────────────────────

  navigate(route: string): void {
    this.router.navigate([route]);
  }

  /**
   * True when the signed-in role may open this tile's route.
   *
   * A tile the role cannot open stays on the page — the gallery is a tour of what
   * the product does, not a menu — but it is rendered inert and out of the tab
   * order instead of routing the user into Access Denied.
   */
  canOpen(module: ShowcaseModule): boolean {
    return !module.requires || this.access[module.requires] === true;
  }

  /** Opens a module gallery tile. Ignored for tiles the role cannot open. */
  openModule(module: ShowcaseModule): void {
    if (!this.canOpen(module)) return;
    this.router.navigate([module.route]);
  }

  // ── Dashboard data ──────────────────────────────────────────────────────

  /**
   * Loads the whole hero in one request.
   *
   * It used to take four — two pages of the patient search, the daily-collection
   * report and a booked-test count — and assemble the tiles here. That left the
   * counts capped by a page size, had two of them counting patients while their
   * labels said tests, and drew the hero in pieces as each call landed.
   *
   * The browser's own date is sent, so the figures follow the user's calendar day
   * rather than the server's. On failure every tile stays null and shows a dash,
   * which is the honest answer: nothing was read.
   */
  private loadDashboard(): void {
    this.dashboardService
      .getHomeSummary(this.toApiDate(new Date()))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: summary => {
          this.applySummary(summary);
          this.isDashboardLoading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.isDashboardLoading = false;
          this.cdr.detectChanges();
        },
      });
  }

  /** Spreads the one response across the tiles, the activity card and the sparkline. */
  private applySummary(summary: HomeSummary): void {
    if (!summary) return;

    this.patientsToday    = numberOrNull(summary.patientsToday);
    this.testsBookedToday = numberOrNull(summary.testsBooked);
    this.reportsDone      = numberOrNull(summary.reportsDone);
    this.testsPending     = numberOrNull(summary.testsPending);
    this.revenueToday     = numberOrNull(summary.revenueToday);

    this.activityRows = (summary.recentActivity ?? []).map(row => this.toActivityRow(row));
    this.sparkBars    = this.toSparkBars(summary.weekRegistrations ?? []);
  }

  /** Turns an API activity row into its pill, dot and wording. */
  private toActivityRow(row: HomeActivity): ActivityRow {
    const status = (row.status ?? '').trim().toLowerCase();

    const badgeClass =
      status === 'completed' ? 'vb-done' :
      status === 'partial'   ? 'vb-prog' : 'vb-wait';

    const dotColor =
      status === 'completed' ? '#00b894' :
      status === 'partial'   ? '#1e88e5' : '#ffc107';

    const label =
      status === 'completed' ? 'Report Ready' :
      status === 'partial'   ? 'In Lab' : 'Pending';

    return {
      name: (row.patientName ?? '').trim() || 'Unknown',
      status: label,
      badgeClass,
      dotColor,
    };
  }

  /**
   * Scales the week's counts into bar heights. Against the busiest day of the week,
   * so the tallest bar always fills the track whatever the lab's volume; a day with
   * nothing keeps a 4px stub rather than disappearing.
   */
  private toSparkBars(week: HomeWeekDay[]): SparkBar[] {
    const max = Math.max(1, ...week.map(d => d.count ?? 0));

    return week.map(d => ({
      label: d.label,
      count: d.count ?? 0,
      future: d.future === true,
      height: !d.count ? 4 : Math.round(8 + (d.count / max) * 32),
    }));
  }

  /** dd-MM-yyyy — the one date format the API reads. */
  private toApiDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private loadUserInfo(): void {
    this.userRole        = this.tokenService.getUserRole();
    this.userRoleDisplay = this.userRole !== null
      ? (Object.values(Role).find(r => r.id === this.userRole)?.label ?? '')
      : '';
    this.userName        = this.tokenService.getUserId() ?? 'User';
    this.access          = this.userRole !== null
      ? (MODULE_ACCESS[this.userRole] ?? DEFAULT_ACCESS)
      : DEFAULT_ACCESS;
  }

  private buildGreeting(): void {
    const hour = new Date().getHours();
    if (hour < 12)      this.greeting = 'Good Morning';
    else if (hour < 17) this.greeting = 'Good Afternoon';
    else                this.greeting = 'Good Evening';

    const now     = new Date();
    const weekday = now.toLocaleDateString('en-IN', { weekday: 'long' });
    const dd      = now.getDate().toString().padStart(2, '0');
    const mm      = (now.getMonth() + 1).toString().padStart(2, '0');
    this.todayDisplay = `${weekday}, ${dd}-${mm}-${now.getFullYear()}`;
  }

  private buildCards(): void {
    const isAdmin      = this.tokenService.isAdmin();

    const patientCards: ActionCard[] = [
      {
        title: 'Patients',
        description: 'Register, search and manage patient records',
        icon: 'fa-users',
        route: '/patients',
        color: 'indigo'
      },
      {
        title: 'Patient Tests',
        description: 'View and manage test requests and results',
        icon: 'fa-flask',
        route: '/patient-tests',
        color: 'blue'
      },
    ];

    const labCards: ActionCard[] = [
      {
        title: 'Manage Tests',
        description: 'Configure lab tests, parameters and pricing',
        icon: 'fa-list-alt',
        route: '/manage-tests',
        color: 'teal'
      },
      {
        title: 'Reports',
        description: 'Generate and export diagnostic reports',
        icon: 'fa-bar-chart',
        route: '/reports',
        color: 'green'
      },
    ];

    const adminCards: ActionCard[] = [];
    if (isAdmin) {
      adminCards.push(
        {
          title: 'Users',
          description: 'Create and manage system user accounts',
          icon: 'fa-user-circle',
          route: '/users',
          color: 'violet'
        },
        {
          title: 'Doctors',
          description: 'Maintain the referring doctors directory',
          icon: 'fa-stethoscope',
          route: '/doctors',
          color: 'amber'
        },
        {
          title: 'Collection Boys',
          description: 'Manage sample collection staff',
          icon: 'fa-motorcycle',
          route: '/collection-boys',
          color: 'rose'
        },
        {
          title: 'Address Manager',
          description: 'Manage contact and address records',
          icon: 'fa-address-book',
          route: '/contacts',
          color: 'cyan'
        },
      );
    }

    const systemCards: ActionCard[] = [];
      systemCards.push(
        {
          title: 'Lab Profile',
          description: 'View and update lab information',
          icon: 'fa-building',
          route: '/lab-profile',
          color: 'indigo'
        },
        {
          title: 'Lab Setup',
          description: 'Configure lab settings and preferences',
          icon: 'fa-cogs',
          route: '/lab-setup',
          color: 'slate'
        },
        {
          title: 'Report Templates',
          description: 'Design and manage report templates',
          icon: 'fa-file-text',
          route: '/template',
          color: 'violet'
        },
      );

    const accountCards: ActionCard[] = [
      {
        title: 'Attendance',
        description: 'Track and manage staff attendance',
        icon: 'fa-calendar-check-o',
        route: '/attendance',
        color: 'teal'
      },
      {
        title: 'Settings',
        description: 'Manage your account preferences',
        icon: 'fa-sliders',
        route: '/settings',
        color: 'slate'
      },
    ];

    this.cardGroups = [
      { label: 'Patient Management', icon: 'fa-user-md',  cards: patientCards },
      { label: 'Laboratory',         icon: 'fa-flask',     cards: labCards     },
      { label: 'Administration',     icon: 'fa-users',     cards: adminCards   },
      { label: 'System',             icon: 'fa-cog',       cards: systemCards  },
      { label: 'Account',            icon: 'fa-id-badge',  cards: accountCards },
    ].filter(g => g.cards.length > 0);
  }

  private checkPathologyExpiry(): void {
    this.pathologyService.getPathologyExpiryDate()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any) => {
          if (response?.pathologyExpiryDate) {
            const expiryDate = new Date(response.pathologyExpiryDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            expiryDate.setHours(0, 0, 0, 0);
            this.daysUntilExpiry = Math.ceil(
              (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );
            const ed = expiryDate;
            this.expiryDate =
              `${ed.getDate().toString().padStart(2, '0')}-` +
              `${(ed.getMonth() + 1).toString().padStart(2, '0')}-` +
              `${ed.getFullYear()}`;

            if (this.daysUntilExpiry <= 0) {
              this.isLicenseExpired = true;
            } else if (this.daysUntilExpiry <= 15) {
              this.showExpiryBanner = true;
            }
          }
        },
        error: () => {}
      });
  }

  /**
   * Generates inline-style strings for the floating hero particles.
   * Called once in ngOnInit so positions are stable across re-renders.
   */
  private initParticles(): void {
    this.particleStyles = Array.from({ length: 22 }, () => {
      const size = (Math.random() * 2.5 + 1).toFixed(1);
      return [
        `left:${(Math.random() * 100).toFixed(1)}%`,
        `width:${size}px`,
        `height:${size}px`,
        `animation-duration:${(Math.random() * 14 + 9).toFixed(1)}s`,
        `animation-delay:${(Math.random() * 14).toFixed(1)}s`,
      ].join(';');
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
