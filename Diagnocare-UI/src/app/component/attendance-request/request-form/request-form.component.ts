import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { AttendanceService } from 'src/app/services/attendanceServices/attendance.service';
import {
  AttendanceRequestDTO,
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
export class RequestFormComponent implements OnInit {

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
    }
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
        next: () => { this.toastr.success('Request updated.'); this.done(); },
        error: (msg) => { this.toastr.error(msg); this.isSaving = false; },
      });
    } else {
      this.service.createRequest({
        attendanceDate: v.attendanceDate,
        requestedStatus: String(v.requestedStatus),
        reason: v.reason?.trim() || undefined,
      }).subscribe({
        next: () => { this.toastr.success('Request submitted.'); this.done(); },
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
