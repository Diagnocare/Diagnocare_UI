import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { AttendanceService } from 'src/app/services/attendanceServices/attendance.service';
import { LeaveService } from 'src/app/services/leaveServices/leave.service';
import { LeaveBalanceDTO } from 'src/app/models/leave/leave-balance.dto';
import { AttendanceStatus, mapBackendStatus } from 'src/app/models/attendance/attendance-record.dto';
import {
  AttendanceRequestDTO,
  AttendanceStatusCode,
  REQUESTABLE_STATUSES,
} from 'src/app/models/attendanceRequest/attendance-request.model';

/**
 * Create a new attendance request, or edit an existing Pending one.
 * Reused for both flows — presence of :id in the route switches to edit mode.
 */
@Component({
  selector: 'app-request-form',
  templateUrl: './request-form.component.html',
  styleUrls: ['./request-form.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LoadingSpinnerComponent, DatePickerComponent],
})
export class RequestFormComponent implements OnInit, OnDestroy {

  /**
   * 'leave' applies for a day of leave (this week or next only); 'correction' marks a
   * day Present or Half Day (today or earlier only). Staff can't pick anything else.
   */
  mode: 'correction' | 'leave' = 'correction';

  get statuses() {
    return REQUESTABLE_STATUSES.filter(s =>
      this.mode === 'leave'
        ? s.value === AttendanceStatusCode.Absent
        : s.value !== AttendanceStatusCode.Absent);
  }

  /** Earliest date selectable: Monday of this week for leave, no limit for corrections. */
  get minDate(): string {
    if (this.mode !== 'leave') return '';
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return this.localIso(d);
  }

  /** Latest date selectable for the current mode. */
  get pickerMax(): string {
    return this.mode === 'leave' ? this.maxDate : this.today;
  }

  private localIso(d: Date): string {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  setMode(mode: 'correction' | 'leave'): void {
    if (this.isEdit || mode === this.mode) return;
    this.mode = mode;
    this.form.patchValue({
      attendanceDate: '',
      requestedStatus: mode === 'leave' ? AttendanceStatusCode.Absent : '',
    });
  }
  // LOCAL today in yyyy-MM-dd (NOT toISOString, which is UTC and can resolve to
  // yesterday late at night — that would disable the real today in the picker).
  readonly today = (() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  })();

  /** Latest date that can be requested: Sunday of next week (this week + next week only). */
  readonly maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (7 - ((d.getDay() + 6) % 7)) + 6);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  })();

  form!: FormGroup;
  isEdit = false;
  requestId: number | null = null;
  isLoading = false;
  isSaving = false;
  loadedRequest: AttendanceRequestDTO | null = null;

  /**
   * What's currently recorded for the selected date, resolved either from the
   * loaded request (edit mode — the server already computed it) or fetched
   * live from the attendance grid as the date is picked (create mode — before
   * this session, nothing knew what that day already held).
   */
  currentStatusLabel: string | null = null;
  /** Same value, in the AttendanceStatusCode numbering `requestedStatus` uses, so the two are directly comparable. Null = no record for that date. */
  currentStatusCode: number | null = null;
  currentStatusLoading = false;

  /**
   * A request for the selected date that is already awaiting a decision.
   *
   * A second request for the same day is rejected by the server, so the form says so
   * as soon as the date is picked and points at the existing request, rather than
   * letting the employee fill the whole thing in and then meet an error.
   * Create mode only — in edit mode the request being edited *is* the open one.
   */
  existingRequestId: number | null = null;
  /** 'Pending' or 'Withdrawal Requested'. Empty when there is none. */
  existingRequestLabel = '';
  /** The status that request asked for, e.g. 'Half Day'. Empty when there is none. */
  existingRequestedLabel = '';

  get hasExistingRequest(): boolean {
    return !this.isEdit && this.existingRequestId !== null;
  }

  /**
   * The caller's paid-leave position for the leave year of the date being requested,
   * so they can see what they have before they commit to taking it. Null while loading,
   * or when the lookup failed - the form still works without it.
   */
  leaveBalance: LeaveBalanceDTO | null = null;
  leaveBalanceLoading = false;

  /** Which year leaveBalance covers, so a date in another year triggers a refetch. */
  private loadedBalanceYear: number | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private service: AttendanceService,
    private leaveService: LeaveService,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      attendanceDate: ['', Validators.required],
      requestedStatus: ['', Validators.required],
      reason: ['', Validators.maxLength(500)],
    });

    // The current leave year to begin with. Picking a date in another year refetches,
    // because entitlement and carry-forward are per leave year.
    this.loadLeaveBalance(new Date().getFullYear());

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.isEdit = true;
      this.requestId = +idParam;
      this.loadForEdit(this.requestId);
    } else {
      // Prefill the date when opened from a My Attendance cell (?date=yyyy-MM-dd).
      if (this.route.snapshot.queryParamMap.get('type') === 'leave') {
        this.mode = 'leave';
        this.form.patchValue({ requestedStatus: AttendanceStatusCode.Absent });
      }
      const dateParam = this.route.snapshot.queryParamMap.get('date');
      if (dateParam && dateParam <= this.pickerMax && dateParam >= this.minDate) {
        this.form.patchValue({ attendanceDate: dateParam });
      }

      // Create mode only — edit mode's date is fixed and its current status
      // already arrives on the loaded request. Refetch every time the date
      // changes so switching dates doesn't leave a stale status on screen.
      this.form.get('attendanceDate')?.valueChanges
        .pipe(takeUntil(this.destroy$))
        .subscribe((dateStr: string) => {
          this.loadCurrentStatus(dateStr);
          this.loadBalanceForDate(dateStr);
        });

      if (this.form.get('attendanceDate')?.value) {
        this.loadCurrentStatus(this.form.get('attendanceDate')?.value);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Looks up what's already recorded for `dateStr` via the weekly attendance
   * grid (there's no single-day lookup endpoint), so the employee can see
   * what they're actually changing before they submit — without this, the
   * form had no idea a day was already marked at all.
   */
  private loadCurrentStatus(dateStr: string): void {
    this.currentStatusLabel = null;
    this.currentStatusCode = null;
    this.clearExistingRequest();
    if (!dateStr) return;

    this.currentStatusLoading = true;
    this.service.getMyWeeklyAttendance(this.mondayOf(dateStr))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const day = res.rows?.[0]?.days?.[dateStr] ?? null;
          const gridStatus = mapBackendStatus(day?.status);
          this.currentStatusCode = this.toRequestStatusCode(gridStatus);
          this.currentStatusLabel = this.currentStatusCode === null ? null : this.gridStatusLabel(gridStatus);

          // The same response carries any request still awaiting a decision for
          // this date, so the duplicate check costs no extra call.
          const open = res.rows?.[0]?.openRequests?.[dateStr] ?? null;
          this.existingRequestId      = open?.requestId ?? null;
          this.existingRequestLabel   = open?.requestStatusLabel ?? '';
          this.existingRequestedLabel = open?.requestedStatusLabel ?? '';

          this.currentStatusLoading = false;
        },
        // Non-fatal — the form still works without the "currently recorded" hint.
        error: () => { this.currentStatusLoading = false; },
      });
  }

  /**
   * Refetches the balance when the picked date falls in a different leave year.
   * Leave years run January to December, so only the year matters here.
   */
  private loadBalanceForDate(dateStr: string): void {
    if (!dateStr) return;
    const year = Number(dateStr.slice(0, 4));
    if (!year || year === this.loadedBalanceYear) return;
    this.loadLeaveBalance(year);
  }

  private loadLeaveBalance(year: number): void {
    this.leaveBalanceLoading = true;
    this.leaveService.getMyBalance(year)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (b) => {
          this.leaveBalance = b;
          this.loadedBalanceYear = year;
          this.leaveBalanceLoading = false;
        },
        // Non-fatal: the panel is guidance, not a gate. Submitting still works, and
        // payroll settles the paid/unpaid split regardless of what was shown here.
        error: () => {
          this.leaveBalance = null;
          this.leaveBalanceLoading = false;
        },
      });
  }

  /** Paid leave a status consumes for one day: Absent a full day, Half Day half of one. */
  private leaveDaysFor(statusCode: number | null): number {
    switch (statusCode) {
      case AttendanceStatusCode.Absent:  return 1;
      case AttendanceStatusCode.HalfDay: return 0.5;
      default:                           return 0;
    }
  }

  /**
   * Paid leave this request would consume ON TOP of what the day already costs.
   * Turning a recorded Absent into a Half Day gives half a day back, hence the
   * subtraction and the possible negative result.
   */
  get leaveDaysRequested(): number {
    const requested = this.form?.get('requestedStatus')?.value;
    if (requested === '' || requested == null) return 0;
    return this.leaveDaysFor(Number(requested)) - this.leaveDaysFor(this.currentStatusCode);
  }

  /** True when this request would take more paid leave than the employee has left. */
  get exceedsAvailableLeave(): boolean {
    return this.unpaidDaysIfSubmitted > 0;
  }

  /**
   * How much of this request would go unpaid, i.e. attract a salary deduction.
   * 0 when the balance covers it, or when no balance could be loaded.
   */
  get unpaidDaysIfSubmitted(): number {
    if (!this.leaveBalance?.isConfigured) return 0;
    const shortfall = this.leaveDaysRequested - this.leaveBalance.availableLeave;
    return shortfall > 0 ? Math.round(shortfall * 100) / 100 : 0;
  }

  private clearExistingRequest(): void {
    this.existingRequestId = null;
    this.existingRequestLabel = '';
    this.existingRequestedLabel = '';
  }

  /** Open the request that already covers the selected date. */
  openExistingRequest(): void {
    if (this.existingRequestId) {
      this.router.navigate(['/attendance-requests', this.existingRequestId]);
    }
  }

  /** Monday (yyyy-MM-dd) of the week containing the given date — GetMyWeekly wants a Monday start. */
  private mondayOf(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  /**
   * Maps the attendance grid's status (Present/Absent/HalfDay/WeekOff/Holiday/None)
   * onto the AttendanceStatusCode numbering the request's `requestedStatus` uses, so
   * the two can be compared directly. Holiday is calendar-driven and never a stored
   * status, so it has no code. Null = nothing recorded yet.
   */
  private toRequestStatusCode(status: AttendanceStatus): number | null {
    switch (status) {
      case AttendanceStatus.Present: return AttendanceStatusCode.Present;
      case AttendanceStatus.Absent:  return AttendanceStatusCode.Absent;
      case AttendanceStatus.HalfDay: return AttendanceStatusCode.HalfDay;
      case AttendanceStatus.WeekOff: return AttendanceStatusCode.WeekOff;
      default:                       return null;
    }
  }

  private gridStatusLabel(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present: return 'Present';
      case AttendanceStatus.Absent:  return 'Leave';
      case AttendanceStatus.HalfDay: return 'Half Day';
      case AttendanceStatus.WeekOff: return 'Week Off';
      case AttendanceStatus.Holiday: return 'Holiday';
      default:                       return 'Not marked';
    }
  }

  /**
   * True once there's an actual recorded status for the date AND the employee
   * has picked something different from it — the case the approval note is
   * for. A brand-new, never-marked day has nothing to be "subject to"
   * changing yet, so the note stays hidden until there's a real delta.
   */
  get isChangingRecordedStatus(): boolean {
    const requested = this.form?.get('requestedStatus')?.value;
    return this.currentStatusCode !== null
      && requested !== '' && requested != null
      && Number(requested) !== this.currentStatusCode;
  }

  private loadForEdit(id: number): void {
    this.isLoading = true;
    this.service.getMyRequest(id).subscribe({
      next: (r) => {
        this.loadedRequest = r;
        if (!r.canEdit) {
          this.toastr.warning('This request can no longer be edited.');
          this.router.navigate(['/attendance-requests', id]);
          return;
        }
        this.mode = r.requestedStatus === AttendanceStatusCode.Absent ? 'leave' : 'correction';
        this.form.patchValue({
          attendanceDate: r.attendanceDate?.slice(0, 10),
          requestedStatus: r.requestedStatus,
          reason: r.reason || '',
        });
        this.currentStatusLabel = r.currentStatusLabel;
        this.currentStatusCode  = r.currentStatus;
        // The date is fixed on edit, so this is the one chance to line the balance up
        // with the request's own leave year.
        this.loadBalanceForDate(r.attendanceDate?.slice(0, 10) ?? '');
        // Date is immutable on edit.
        this.form.get('attendanceDate')?.disable();
        this.isLoading = false;
      },
      error: (msg) => { this.toastr.error(msg); this.isLoading = false; this.router.navigate(['/attendance-requests']); },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // The server would reject this anyway; refusing here keeps the form on the
    // reason the employee can act on rather than an error toast.
    if (this.hasExistingRequest) return;
    this.isSaving = true;
    const v = this.form.getRawValue();

    if (this.isEdit && this.requestId) {
      this.service.updateRequest(this.requestId, {
        requestedStatus: String(v.requestedStatus),
        reason: v.reason?.trim() || undefined,
      }).subscribe({
        next: () => { this.done(); },
        error: (msg) => { this.toastr.error(msg); this.isSaving = false; },
      });
    } else {
      this.service.createRequest({
        attendanceDate: v.attendanceDate,
        requestedStatus: String(v.requestedStatus),
        reason: v.reason?.trim() || undefined,
      }).subscribe({
        next: () => { this.done(); },
        error: (msg) => { this.toastr.error(msg); this.isSaving = false; },
      });
    }
  }

  private done(): void {
    this.isSaving = false;
    this.router.navigate(['/attendance-requests']);
  }

  cancel(): void {
    this.router.navigate(['/attendance-requests']);
  }

  get f() { return this.form.controls; }
}
