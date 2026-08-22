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

  readonly statuses = REQUESTABLE_STATUSES;
  // LOCAL today in yyyy-MM-dd (NOT toISOString, which is UTC and can resolve to
  // yesterday late at night — that would disable the real today in the picker).
  readonly today = (() => {
    const d = new Date();
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

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private service: AttendanceService,
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

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.isEdit = true;
      this.requestId = +idParam;
      this.loadForEdit(this.requestId);
    } else {
      // Prefill the date when opened from a My Attendance cell (?date=yyyy-MM-dd).
      const dateParam = this.route.snapshot.queryParamMap.get('date');
      if (dateParam && dateParam <= this.today) {
        this.form.patchValue({ attendanceDate: dateParam });
      }

      // Create mode only — edit mode's date is fixed and its current status
      // already arrives on the loaded request. Refetch every time the date
      // changes so switching dates doesn't leave a stale status on screen.
      this.form.get('attendanceDate')?.valueChanges
        .pipe(takeUntil(this.destroy$))
        .subscribe((dateStr: string) => this.loadCurrentStatus(dateStr));

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
          this.currentStatusLoading = false;
        },
        // Non-fatal — the form still works without the "currently recorded" hint.
        error: () => { this.currentStatusLoading = false; },
      });
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
   * Maps the attendance grid's status (Present/Absent/FirstHalf/SecondHalf/Holiday/None)
   * onto the AttendanceStatusCode numbering the request's `requestedStatus` uses, so the
   * two can be compared directly. FirstHalf and SecondHalf both collapse to HalfDay —
   * the request form only offers one half-day option. Null = nothing recorded yet.
   */
  private toRequestStatusCode(status: AttendanceStatus): number | null {
    switch (status) {
      case AttendanceStatus.Present:    return AttendanceStatusCode.Present;
      case AttendanceStatus.Absent:     return AttendanceStatusCode.Absent;
      case AttendanceStatus.FirstHalf:
      case AttendanceStatus.SecondHalf: return AttendanceStatusCode.HalfDay;
      case AttendanceStatus.Holiday:    return AttendanceStatusCode.Holiday;
      default:                          return null;
    }
  }

  private gridStatusLabel(status: AttendanceStatus): string {
    switch (status) {
      case AttendanceStatus.Present:    return 'Present';
      case AttendanceStatus.Absent:     return 'Absent';
      case AttendanceStatus.FirstHalf:  return 'First Half Present';
      case AttendanceStatus.SecondHalf: return 'Second Half Present';
      case AttendanceStatus.Holiday:    return 'Holiday';
      default:                          return 'Not marked';
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
        this.form.patchValue({
          attendanceDate: r.attendanceDate?.slice(0, 10),
          requestedStatus: r.requestedStatus,
          reason: r.reason || '',
        });
        this.currentStatusLabel = r.currentStatusLabel;
        this.currentStatusCode  = r.currentStatus;
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
