import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { RequestStatusBadgeComponent } from '../shared/request-status-badge.component';
import { AttendanceService } from 'src/app/services/attendanceServices/attendance.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import {
  AttendanceRequestDTO,
  RequestStatus,
  ALL_ATTENDANCE_STATUSES,
  attendanceStatusLabel,
} from 'src/app/models/attendanceRequest/attendance-request.model';

/**
 * Single shared detail view for BOTH User and Admin.
 * - Everyone sees the read-only request story (requested/applied/remarks/timeline).
 * - Owner (User) sees Edit / Cancel while Pending (driven by server flags).
 * - Admin sees the Approve / Reject panel with a status-override selector while Pending.
 */
@Component({
  selector: 'app-request-detail',
  templateUrl: './request-detail.component.html',
  styleUrls: ['./request-detail.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, RequestStatusBadgeComponent],
})
export class RequestDetailComponent implements OnInit {

  readonly RequestStatus = RequestStatus;
  readonly allStatuses = ALL_ATTENDANCE_STATUSES;
  readonly statusLabel = attendanceStatusLabel;

  isAdmin = false;
  request: AttendanceRequestDTO | null = null;
  isLoading = false;
  isSaving = false;

  // Admin action state
  appliedStatus = 0;
  approveRemarks = '';
  rejectRemarks = '';
  confirmMode: 'approve' | 'reject' | 'cancel' | null = null;

  constructor(
    private service: AttendanceService,
    private token: TokenService,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.token.isAdmin();
    const id = +(this.route.snapshot.paramMap.get('id') || 0);
    if (!id) { this.router.navigate(['/attendance-requests']); return; }
    this.load(id);
  }

  private load(id: number): void {
    this.isLoading = true;
    const call = this.isAdmin ? this.service.getRequest(id) : this.service.getMyRequest(id);
    call.subscribe({
      next: (r) => {
        this.request = r;
        this.appliedStatus = r.requestedStatus;   // pre-fill override selector
        this.isLoading = false;
      },
      error: (msg) => { this.toastr.error(msg); this.isLoading = false; this.router.navigate(['/attendance-requests']); },
    });
  }

  get isPending(): boolean { return this.request?.requestStatus === RequestStatus.Pending; }
  get statusChanged(): boolean { return !!this.request && this.appliedStatus !== this.request.requestedStatus; }

  // ── Owner actions ─────────────────────────────────────────────
  editRequest(): void {
    if (this.request) this.router.navigate(['/attendance-requests', this.request.requestId, 'edit']);
  }
  doCancel(): void {
    if (!this.request) return;
    this.service.cancelRequest(this.request.requestId).subscribe({
      next: (r) => { this.request = r; this.confirmMode = null; this.toastr.success('Request cancelled.'); },
      error: (msg) => { this.toastr.error(msg); this.confirmMode = null; },
    });
  }

  // ── Admin actions ─────────────────────────────────────────────
  doApprove(): void {
    if (!this.request) return;
    this.isSaving = true;
    this.service.approveRequest(this.request.requestId, {
      approvedStatus: String(this.appliedStatus),
      remarks: this.approveRemarks?.trim() || undefined,
    }).subscribe({
      next: (r) => { this.request = r; this.isSaving = false; this.confirmMode = null; this.toastr.success('Approved — attendance updated.'); },
      error: (msg) => { this.toastr.error(msg); this.isSaving = false; this.confirmMode = null; },
    });
  }
  doReject(): void {
    if (!this.request) return;
    if (!this.rejectRemarks?.trim()) { this.toastr.warning('Remarks are required to reject.'); return; }
    this.isSaving = true;
    this.service.rejectRequest(this.request.requestId, { remarks: this.rejectRemarks.trim() }).subscribe({
      next: (r) => { this.request = r; this.isSaving = false; this.confirmMode = null; this.toastr.success('Rejected — attendance unchanged.'); },
      error: (msg) => { this.toastr.error(msg); this.isSaving = false; this.confirmMode = null; },
    });
  }

  closeConfirm(): void { this.confirmMode = null; }
  back(): void { this.router.navigate(['/attendance-requests']); }
}
