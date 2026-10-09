import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DashboardService } from 'src/app/services/dashboardServices/dashboard.service';
import { WorklistService } from 'src/app/services/worklistServices/worklist.service';
import { LicenceService } from 'src/app/services/licenceServices/licence.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { HomeSummary } from 'src/app/models/dashboard/home-summary';
import { Role } from 'src/app/constant/enums';
import { DEFAULT_ACCESS, MODULE_ACCESS, ModuleAccess } from 'src/app/constant/module-access';
import { WORK_QUEUE_META, WORK_QUEUE_ORDER, WorkQueue, WorkQueueTone } from 'src/app/utilities/work-queue.util';

/** A big "what do you want to do" button. */
interface TaskTile {
  label: string;
  hint: string;
  icon: string;
  route: string;
  query?: Record<string, string>;
  /** Items waiting. Null hides the count (unknown, or not a queue). */
  count: number | null;
  tone: 'primary' | 'blue' | 'amber' | 'purple' | 'green';
}

/** One stage of the pipeline strip. */
interface PipeStage {
  queue: WorkQueue;
  label: string;
  hint: string;
  icon: string;
  tone: WorkQueueTone;
  count: number | null;
}

interface BookingRow {
  name: string;
  patientId: string;
  label: string;
  tone: 'ok' | 'info' | 'wait';
}

interface WeekBar {
  label: string;
  count: number;
  pct: number;
  future: boolean;
  today: boolean;
}

/**
 * HomeDashboardComponent — the task-first home page for the sidebar shell.
 * ─────────────────────────────────────────────────────────────────────────────
 * Answers, in this order, the three questions someone opening the app asks:
 *
 *   1. "What do I need to do?"   → four big task buttons, each with the number
 *                                   of items waiting for it.
 *   2. "Where is today's work?"  → the sample pipeline, one box per step, from
 *                                   "To collect" to "Ready to print".
 *   3. "How is the day going?"   → four plain numbers, then the latest bookings
 *                                   and the week's registrations.
 *
 * It reads the same two endpoints the app already has — the home summary and
 * the worklist counts — so it needs no API change. Replaces the hero home page
 * only while USE_SIDEBAR_SHELL is on (see app-routing.module.ts).
 */
@Component({
  selector: 'app-home-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home-dashboard.component.html',
  styleUrls: ['./home-dashboard.component.css'],
})
export class HomeDashboardComponent implements OnInit, OnDestroy {
  greeting = '';
  todayLabel = '';
  userName = '';

  access: ModuleAccess = DEFAULT_ACCESS;
  /** Admin, Super Admin and Doctor sign reports off. */
  canVerify = false;
  /** Collection boys cannot open /work. */
  canSeeWork = false;

  isLicenceExpired = false;
  licenceDaysLeft: number | null = null;

  summaryLoading = true;
  summaryFailed = false;
  patientsToday: number | null = null;
  testsBooked: number | null = null;
  reportsDone: number | null = null;
  testsPending: number | null = null;
  revenueToday: number | null = null;
  bookings: BookingRow[] = [];
  week: WeekBar[] = [];

  queueCounts: Partial<Record<WorkQueue, number>> = {};
  queuesLoaded = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private dashboard: DashboardService,
    private worklist: WorklistService,
    private licence: LicenceService,
    private tokens: TokenService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const role = this.tokens.getUserRole();
    this.access = role !== null ? (MODULE_ACCESS[role] ?? DEFAULT_ACCESS) : DEFAULT_ACCESS;
    this.canVerify = role === Role.Admin.id || role === Role.Super_Admin.id || role === Role.Doctor.id;
    this.canSeeWork = role !== Role.Collection_Boy.id && (this.access.labOps || this.access.patientTestsLink);
    this.userName = this.tokens.getUserId() ?? '';
    this.buildGreeting();

    this.licence.load().pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.isLicenceExpired = this.licence.isExpired;
      this.licenceDaysLeft = this.licence.daysLeft;
      this.cdr.markForCheck();
    });

    this.loadSummary();
    if (this.canSeeWork) this.loadQueues();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  private loadSummary(): void {
    this.dashboard.getHomeSummary(this.apiDate(new Date()))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: s => { this.applySummary(s); this.summaryLoading = false; this.cdr.markForCheck(); },
        error: () => { this.summaryLoading = false; this.summaryFailed = true; this.cdr.markForCheck(); },
      });
  }

  /** One page of one row is enough: only the per-queue counts are read. */
  private loadQueues(): void {
    this.worklist.getWorklist({ pageNumber: 1, pageSize: 1 })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: page => {
          for (const c of page?.counts ?? []) this.queueCounts[c.queue] = c.count;
          this.queuesLoaded = true;
          this.cdr.markForCheck();
        },
        error: () => { this.queuesLoaded = false; },
      });
  }

  private applySummary(s: HomeSummary): void {
    if (!s) return;
    this.patientsToday = num(s.patientsToday);
    this.testsBooked   = num(s.testsBooked);
    this.reportsDone   = num(s.reportsDone);
    this.testsPending  = num(s.testsPending);
    this.revenueToday  = num(s.revenueToday);

    this.bookings = (s.recentActivity ?? []).map(r => {
      const st = (r.status ?? '').trim().toLowerCase();
      return {
        name: (r.patientName ?? '').trim() || 'Unknown',
        patientId: r.patientId,
        label: st === 'completed' ? 'Report ready' : st === 'partial' ? 'In the lab' : 'Waiting',
        tone: st === 'completed' ? 'ok' : st === 'partial' ? 'info' : 'wait',
      } as BookingRow;
    });

    const days = s.weekRegistrations ?? [];
    const max = Math.max(1, ...days.map(d => d.count ?? 0));
    const today = this.apiDate(new Date());
    this.week = days.map(d => ({
      label: d.label,
      count: d.count ?? 0,
      pct: Math.round(((d.count ?? 0) / max) * 100),
      future: d.future === true,
      today: d.date === today,
    }));
  }

  // ── View model ────────────────────────────────────────────────────────────

  private q(queue: WorkQueue): number | null {
    return this.queuesLoaded ? (this.queueCounts[queue] ?? 0) : null;
  }

  private sum(...queues: WorkQueue[]): number | null {
    if (!this.queuesLoaded) return null;
    return queues.reduce((t, k) => t + (this.queueCounts[k] ?? 0), 0);
  }

  /** The task buttons this role can actually use, in the order the day runs. */
  get tasks(): TaskTile[] {
    const t: TaskTile[] = [];
    if (this.access.labOps) {
      t.push({ label: 'Register a patient', hint: 'New patient, book tests, take payment',
               icon: 'fa-user-plus', route: '/patients/add', count: null, tone: 'primary' });
    }
    if (this.canSeeWork && this.access.labOps) {
      t.push({ label: 'Collect samples', hint: 'Patients waiting for a sample to be taken',
               icon: 'fa-vial', route: '/work', query: { queue: 'to-collect' },
               count: this.q('to-collect'), tone: 'blue' });
      t.push({ label: 'Enter results', hint: 'Samples in the lab waiting for results',
               icon: 'fa-flask', route: '/work', query: { queue: 'awaiting-results' },
               count: this.sum('awaiting-results', 'partly-entered', 'returned'), tone: 'amber' });
    }
    if (this.canSeeWork && this.canVerify) {
      t.push({ label: 'Check & sign reports', hint: 'Results waiting for a doctor to approve',
               icon: 'fa-user-doctor', route: '/work', query: { queue: 'to-verify' },
               count: this.q('to-verify'), tone: 'purple' });
    }
    if (this.canSeeWork && this.access.labOps) {
      t.push({ label: 'Print & hand over', hint: 'Finished reports to print or send on WhatsApp',
               icon: 'fa-print', route: '/work', query: { queue: 'ready-to-print' },
               count: this.q('ready-to-print'), tone: 'green' });
    }
    if (!this.access.labOps && this.access.patientsLink) {
      t.push({ label: 'Find a patient', hint: 'Look up a patient and their visit',
               icon: 'fa-users', route: '/patients', count: null, tone: 'primary' });
    }
    return t;
  }

  /** The flow, left to right. "Needs attention" is shown separately, not as a step. */
  get pipeline(): PipeStage[] {
    return WORK_QUEUE_ORDER
      .filter(q => q !== 'needs-attention')
      .map(q => ({
        queue: q,
        label: WORK_QUEUE_META[q].label,
        hint: WORK_QUEUE_META[q].hint,
        icon: WORK_QUEUE_META[q].icon,
        tone: WORK_QUEUE_META[q].tone,
        count: this.q(q),
      }));
  }

  get attentionCount(): number | null {
    return this.q('needs-attention');
  }

  /** Reports done as a share of tests booked — the day's progress bar. */
  get progressPct(): number {
    if (!this.testsBooked || this.reportsDone === null) return 0;
    return Math.min(100, Math.round((this.reportsDone / this.testsBooked) * 100));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private buildGreeting(): void {
    const now = new Date();
    const h = now.getHours();
    this.greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    this.todayLabel = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  private apiDate(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }
}

function num(v: number | null | undefined): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}
