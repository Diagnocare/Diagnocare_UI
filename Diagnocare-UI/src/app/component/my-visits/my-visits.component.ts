import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

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
    private toastr:     ToastrService,
  ) {}

  ngOnInit(): void {
    const uid = this._tokenSvc.decodeToken()?.uid;
    if (uid && !isNaN(Number(uid))) this.memberId = +uid;

    this.selectedDate = this.toIso(this.today);
    this.viewYear  = this.today.getFullYear();
    this.viewMonth = this.today.getMonth() + 1;

    this.loadCalendar();
    this.loadVisits();
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

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
        this.toastr.success('Visit marked as completed!', 'Done');
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
