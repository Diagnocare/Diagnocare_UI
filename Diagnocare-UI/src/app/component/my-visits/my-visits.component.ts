import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { NotificationService } from 'src/app/services/notificationServices/notification.service';

import { VisitScheduleService } from 'src/app/services/visitScheduleServices/visit-schedule.service';
import { TokenService }         from 'src/app/core/interceptors/token.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { VisitCalendarComponent } from 'src/app/shared/visit-calendar/visit-calendar.component';
import { VisitCardComponent }     from 'src/app/shared/visit-card/visit-card.component';
import {
  VisitScheduleGetDto,
  VisitCalendarDayDto,
} from 'src/app/models/visitSchedule/visit-schedule.dto';
import {
  VisitCompleteModalComponent,
  VisitCompletionData,
} from 'src/app/shared/visit-complete-modal/visit-complete-modal.component';

/**
 * My Visits — staff self-service field-visit view.
 *
 * Shares the calendar + card UI with the admin Visit Schedule via the shared
 * <app-visit-calendar> and <app-visit-card> components. Role-aware: staff see only
 * their own visits (resolved from the JWT); Admin / Super Admin see all staff.
 */
@Component({
  selector:    'app-my-visits',
  standalone:  true,
  imports:     [CommonModule, LoadingSpinnerComponent, VisitCalendarComponent, VisitCardComponent, VisitCompleteModalComponent],
  templateUrl: './my-visits.component.html',
  styleUrls:   ['./my-visits.component.scss'],
})
export class MyVisitsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  visits:    VisitScheduleGetDto[] = [];
  isLoading  = false;
  today      = new Date();
  /** Day currently being viewed (YYYY-MM-DD). */
  selectedDate = '';
  memberId   = 0;


  // ── Calendar state (owned here; the shared calendar renders it) ────────────
  viewYear  = new Date().getFullYear();
  viewMonth = new Date().getMonth() + 1;
  calendarData: VisitCalendarDayDto[] = [];

  // ── Status filter ──────────────────────────────────────────────────────────
  statusFilter: 'all' | 'Pending' | 'Completed' = 'all';

  // ── Modals ─────────────────────────────────────────────────────────────────
  completingVisit: VisitScheduleGetDto | null = null;
  savingComplete   = false;
  viewingVisit:    VisitScheduleGetDto | null = null;

  constructor(
    private _visitSvc:  VisitScheduleService,
    private _tokenSvc:  TokenService,
    private _route:     ActivatedRoute,
    private _notifications: NotificationService,
  ) {}

  ngOnInit(): void {
    const uid = this._tokenSvc.decodeToken()?.uid;
    if (uid && !isNaN(Number(uid))) this.memberId = +uid;

    this.selectedDate = this.toIso(this.today);
    this.viewYear  = this.today.getFullYear();
    this.viewMonth = this.today.getMonth() + 1;
    this.applyDeepLinkDate(this._route.snapshot.queryParamMap.get('date'));

    this.loadCalendar();
    this.loadVisits();

    // Deep link from a notification: /my-visits?date=YYYY-MM-DD opens that day.
    // Subscribed (not a snapshot) so clicking a second notification while already on
    // this page still moves to the new date — Angular reuses the component.
    this._route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe(q => {
      const monthBefore = `${this.viewYear}-${this.viewMonth}`;
      if (this.applyDeepLinkDate(q.get('date'))) {
        if (`${this.viewYear}-${this.viewMonth}` !== monthBefore) this.loadCalendar();
        this.loadVisits();
      }
    });

    // Seeing the page is seeing the news — clear the My Visits badge.
    this._notifications.markModuleRead('visit');
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  /**
   * Moves the view to a YYYY-MM-DD date from the URL. Returns true only when the
   * selected day actually changed, so the caller knows whether to reload.
   */
  private applyDeepLinkDate(date: string | null): boolean {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date === this.selectedDate) return false;
    const [y, m] = date.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return false;
    this.selectedDate = date;
    this.viewYear = y;
    this.viewMonth = m;
    return true;
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  loadVisits(): void {
    this.isLoading    = true;
    this.statusFilter = 'all';
    const dateStr = this.selectedDate || this.toIso(this.today);

    // Always the signed-in member's own visits, for every role.
    //
    // This used to branch on the isAdmin() helper and call getByDate(), the
    // all-staff endpoint — so an Admin or Super Admin opening "My Visits" got
    // the whole lab's schedule. The all-staff view is its own screen
    // (/visit-schedule, Admin Panel -> Visit Schedule); this one is
    // self-service and has no business showing other people's assignments.
    if (!this.memberId) { this.visits = []; this.isLoading = false; return; }

    this._visitSvc.getMyVisits(this.memberId, dateStr)
      .pipe(takeUntil(this.destroy$)).subscribe({
      next: data => { this.visits = data ?? []; this.isLoading = false; },
      error: ()  => { this.visits = [];         this.isLoading = false; },
    });
  }

  loadCalendar(): void {
    // Own calendar for every role — see loadVisits() for why this is not
    // branched by role.
    this._visitSvc.getMyCalendar(this.viewYear, this.viewMonth)
      .pipe(takeUntil(this.destroy$)).subscribe({
      next: data => { this.calendarData = data ?? []; },
      error: ()  => { this.calendarData = []; },
    });
  }

  // ── Calendar events (from <app-visit-calendar>) ────────────────────────────

  onPrevMonth(): void {
    if (this.viewMonth === 1) { this.viewMonth = 12; this.viewYear--; } else { this.viewMonth--; }
    this.loadCalendar();
  }

  onNextMonth(): void {
    if (this.viewMonth === 12) { this.viewMonth = 1; this.viewYear++; } else { this.viewMonth++; }
    this.loadCalendar();
  }

  onDaySelected(iso: string): void {
    this.selectedDate = iso;
    this.loadVisits();
  }

  // ── Status filter helpers ──────────────────────────────────────────────────

  get filteredVisits(): VisitScheduleGetDto[] {
    if (this.statusFilter === 'all') return this.visits;
    return this.visits.filter(v => v.status === this.statusFilter);
  }

  get pendingCount():   number { return this.visits.filter(v => v.status === 'Pending').length; }
  get completedCount(): number { return this.visits.filter(v => v.status === 'Completed').length; }

  // ── Holiday awareness ──────────────────────────────────────────────────────

  /**
   * Holiday name for the day on screen, or null on a normal working day.
   * The calendar response carries holidays alongside visit counts, so staff
   * see the same holiday markers the admin does.
   */
  get selectedDayHolidayName(): string | null {
    if (!this.selectedDate) return null;
    return this.calendarData.find(d => d.date === this.selectedDate && d.isHoliday)
                            ?.holidayName ?? null;
  }

  // ── Completion ─────────────────────────────────────────────────────────────

  openCompleteModal(visit: VisitScheduleGetDto): void { this.completingVisit = visit; }

  onCompleteConfirmed(data: VisitCompletionData): void {
    if (!this.completingVisit) return;
    this.savingComplete = true;

    this._visitSvc.update({
      id:                    this.completingVisit.id,
      status:                1,
      completionRemark:      data.remark      || undefined,
      completionLocation:    data.location    || undefined,
      completionPhotoBase64: data.photoBase64 || undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.savingComplete  = false;
        this.completingVisit = null;
        this.loadVisits();
        this.loadCalendar();   // pending/done counts change
      },
      error: () => {
        // Message shown centrally by ErrorInterceptor.
        this.savingComplete = false;
      },
    });
  }

  onCompleteCancelled(): void { this.completingVisit = null; this.savingComplete = false; }

  // ── View details ───────────────────────────────────────────────────────────

  openViewDetails(visit: VisitScheduleGetDto): void { this.viewingVisit = visit; }
  closeViewDetails(): void { this.viewingVisit = null; }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}
