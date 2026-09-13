import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { PatientService } from 'src/app/services/patientServices/patient.service';
import { SummaryReportService } from 'src/app/services/summaryServices/summary-report.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { Role, RoleId } from 'src/app/constant/enums';

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

/** One bar in the "Tests This Week" sparkline. */
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

  /** Inline style strings for floating hero particles (generated once on init). */
  particleStyles: string[] = [];

  /** Controls the video tutorial modal. */
  isVideoOpen = false;

  // ── Dashboard state ─────────────────────────────────────────────────────
  //  Null means "not loaded yet" so the template can show a dash instead of a
  //  misleading 0 while the requests are still in flight (or after they fail).

  patientsToday: number | null = null;
  reportsDone:   number | null = null;
  testsPending:  number | null = null;
  revenueToday:  number | null = null;

  /** Today's most recent registrations, newest first. Max 3. */
  activityRows: ActivityRow[] = [];

  /** Mon–Sun registration counts for the current week. */
  sparkBars: SparkBar[] = [];

  isDashboardLoading = true;

  /**
   * Page size for the "today" lookup. The exact count always comes from the
   * response total, so this only caps how many rows we can break down by
   * status — well beyond a single lab's daily registrations.
   */
  private static readonly TODAY_PAGE_SIZE = 200;

  /** Same idea for the week's sparkline buckets. */
  private static readonly WEEK_PAGE_SIZE = 1000;

  private destroy$ = new Subject<void>();

  constructor(
    private pathologyService: PathologyService,
    private patientService: PatientService,
    private summaryReportService: SummaryReportService,
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

  // ── Dashboard data ──────────────────────────────────────────────────────

  /**
   * Loads everything the hero needs in three parallel requests:
   *
   *   1. today   — the KPI tiles and the live-activity rows
   *   2. week    — the sparkline buckets
   *   3. revenue — today's collection
   *
   * Today's rows are a subset of the week's, so this could be two requests.
   * It isn't, deliberately: the patient search returns pages ordered by
   * Reg_Id ASCENDING, so page 1 of a busy week would be the OLDEST rows and
   * today's registrations might not appear at all. Scoping one request to
   * today keeps the tiles and the activity list correct regardless of volume.
   *
   * Each request degrades on its own — a failing revenue report leaves the
   * other three tiles populated rather than blanking the whole hero.
   */
  private loadDashboard(): void {
    const today     = new Date();
    const weekStart = this.startOfWeek(today);
    const todayApi  = this.toApiDate(today);

    const todayPatients$ = this.patientService
      .searchPatients('', 1, PathologyHomeComponent.TODAY_PAGE_SIZE, todayApi, todayApi, '')
      .pipe(catchError(() => of(null)));

    const weekPatients$ = this.patientService
      .searchPatients('', 1, PathologyHomeComponent.WEEK_PAGE_SIZE, this.toApiDate(weekStart), todayApi, '')
      .pipe(catchError(() => of(null)));

    // Period 'day' resolves to (today, today) server-side — see PeriodResolver.
    //
    // Uses daily-collection, NOT referrer-collection. The referrer report attributes
    // one receipt to several rows (a panel referrer AND a collection boy), so summing
    // its rows double-counts; it also drops walk-ins that have neither, and ignores
    // refunds entirely. daily-collection counts each receipt once and nets off refunds.
    const revenue$ = this.summaryReportService
      .getTableReport('dailyCollection', { period: 'day' })
      .pipe(catchError(() => of(null)));

    forkJoin({ today: todayPatients$, week: weekPatients$, revenue: revenue$ })
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ today: todayRes, week: weekRes, revenue: revenueRes }) => {
        this.applyTodayStats(todayRes);
        this.applyWeekSparkline(weekRes, weekStart);

        // netCollection is already paid − refunded, floored at 0, server-side.
        const net = revenueRes?.netCollection;
        this.revenueToday = typeof net === 'number' ? net : null;

        this.isDashboardLoading = false;
        this.cdr.detectChanges();
      });
  }

  /** KPI tiles + live-activity rows, from the today-scoped search response. */
  private applyTodayStats(res: any): void {
    if (!res) return;

    const rows: any[] = Array.isArray(res.item2) ? res.item2 : [];

    // item1 is the true total for the range, so the headline count stays exact
    // even if the range somehow exceeds TODAY_PAGE_SIZE.
    this.patientsToday = typeof res.item1 === 'number' ? res.item1 : rows.length;

    this.reportsDone  = rows.filter(r => this.statusOf(r) === 'completed').length;
    this.testsPending = rows.filter(r => this.statusOf(r) === 'pending').length;

    // Rows arrive oldest-first, so the newest registrations are at the end.
    this.activityRows = rows
      .slice(-3)
      .reverse()
      .map(r => this.toActivityRow(r));
  }

  /** Seven Mon–Sun buckets, counted from the week-scoped search response. */
  private applyWeekSparkline(res: any, weekStart: Date): void {
    const rows: any[] = res && Array.isArray(res.item2) ? res.item2 : [];

    const counts = new Map<string, number>();
    for (const r of rows) {
      const key = this.regDateOf(r);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const labels   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayKey = this.toApiDate(new Date());

    const days = labels.map((label, i) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const key = this.toApiDate(date);
      return { label, count: counts.get(key) ?? 0, future: this.isAfterToday(key, todayKey, weekStart, i) };
    });

    // Scale against the busiest day so the tallest bar always fills the track.
    const max = Math.max(1, ...days.map(d => d.count));

    this.sparkBars = days.map(d => ({
      ...d,
      height: d.count === 0 ? 4 : Math.round(8 + (d.count / max) * 32),
    }));
  }

  private toActivityRow(r: any): ActivityRow {
    const status = this.statusOf(r);

    const badgeClass =
      status === 'completed' ? 'vb-done' :
      status === 'partial'   ? 'vb-prog' : 'vb-wait';

    const dotColor =
      status === 'completed' ? '#00b894' :
      status === 'partial'   ? '#1e88e5' : '#ffc107';

    const label =
      status === 'completed' ? 'Report Ready' :
      status === 'partial'   ? 'In Lab' : 'Pending';

    const salutation = r.patientSalutation ?? r.patient_Salutation ?? '';
    const name       = r.patientName ?? r.patient_Name ?? 'Unknown';

    return {
      name: `${salutation} ${name}`.trim(),
      status: label,
      badgeClass,
      dotColor,
    };
  }

  /** Normalises the API's TestStatus to a lowercase key. */
  private statusOf(r: any): string {
    return String(r?.testStatus ?? r?.status ?? r?.patientStatus ?? '').trim().toLowerCase();
  }

  /** Registration date as dd-MM-yyyy, matching the API's own formatting. */
  private regDateOf(r: any): string {
    const raw = r?.patient_Reg_Date ?? r?.patientRegDate ?? '';
    return typeof raw === 'string' ? raw.trim() : '';
  }

  /** dd-MM-yyyy — the format the patient search expects for date filters. */
  private toApiDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  /** Monday of the week containing `date`, at local midnight. */
  private startOfWeek(date: Date): Date {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = (7 + (d.getDay() - 1)) % 7;   // getDay(): 0 = Sunday
    d.setDate(d.getDate() - diff);
    return d;
  }

  private isAfterToday(key: string, todayKey: string, weekStart: Date, index: number): boolean {
    if (key === todayKey) return false;
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    const today = new Date();
    return day > new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private loadUserInfo(): void {
    this.userRole        = this.tokenService.getUserRole();
    this.userRoleDisplay = this.userRole !== null
      ? (Object.values(Role).find(r => r.id === this.userRole)?.label ?? '')
      : '';
    this.userName        = this.tokenService.getUserId() ?? 'User';
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
