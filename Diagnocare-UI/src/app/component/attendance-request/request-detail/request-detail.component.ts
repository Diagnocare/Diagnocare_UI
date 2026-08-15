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
 * - Owner sees "Request withdrawal" once Approved — an approved correction can no
 *   longer be edited, so asking for it to be undone is their only remaining move.
 *   The ask goes back to the admin queue; attendance does not change until granted.
 * - Admin sees Approve / Reject with a status-override selector while Pending, and
 *   Grant / Refuse withdrawal while WithdrawalRequested.
 *
 * Every action's availability comes from a server-computed flag on the DTO. This
 * component must not re-derive the state machine — the server owns it, and a
 * disagreement between the two shows up as a button that 409s.
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

  // Withdrawal state
  /** Owner's reason for asking that an approved correction be undone. Required. */
  withdrawReason = '';
  /** Admin's remark when granting or refusing. Required only when refusing. */
  withdrawDecisionRemarks = '';

  // 'cancel' is gone: withdrawing a Pending request now covers it, under one word the
  // employee actually uses. The cancel endpoint still exists server-side.
  confirmMode:
    | 'approve' | 'reject'
    | 'withdraw' | 'withdrawApprove' | 'withdrawReject'
    | null = null;

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

  /** Admin has a withdrawal to decide on this request. */
  get isWithdrawalPending(): boolean { return !!this.request?.isWithdrawalPending; }

  // ── Owner actions ─────────────────────────────────────────────
  editRequest(): void {
    if (this.request) this.router.navigate(['/attendance-requests', this.request.requestId, 'edit']);
  }
  /** True when confirming will start a review rather than take effect immediately. */
  get withdrawalNeedsApproval(): boolean { return !!this.request?.withdrawalNeedsApproval; }

  /**
   * Owner takes the request back.
   *
   * Pending  → done on confirm; nobody has reviewed it, so no reason is demanded.
   * Approved → starts a review; reason required, and the success message says plainly
   *            that nothing has changed yet. Telling someone their attendance is fixed
   *            while it is still pending is a lie they'd discover at payroll.
   */
  doWithdraw(): void {
    if (!this.request) return;

    const needsApproval = this.withdrawalNeedsApproval;
    const reason = this.withdrawReason?.trim();

    if (needsApproval && !reason) {
      this.toastr.warning('Please say why this should be undone.');
      return;
    }

    this.isSaving = true;
    this.service.requestWithdrawal(this.request.requestId, { reason: reason || undefined }).subscribe({
      next: (r) => {
        this.request = r;
        this.isSaving = false;
        this.confirmMode = null;
        this.withdrawReason = '';
        this.toastr.success(
          needsApproval
            ? 'Sent to your administrator. Your attendance stays as it is until they review it.'
            : 'Request withdrawn. You can file a new one for that day whenever you like.');
      },
      error: (msg) => { this.toastr.error(msg); this.isSaving = false; this.confirmMode = null; },
    });
  }

  // ── Admin withdrawal decisions ────────────────────────────────
  doApproveWithdrawal(): void {
    if (!this.request) return;
    this.isSaving = true;
    this.service.approveWithdrawal(this.request.requestId, {
      remarks: this.withdrawDecisionRemarks?.trim() || undefined,
    }).subscribe({
      next: (r) => {
        this.request = r;
        this.isSaving = false;
        this.confirmMode = null;
        this.withdrawDecisionRemarks = '';
        this.toastr.success('Withdrawal granted — attendance reverted.');
      },
      error: (msg) => { this.toastr.error(msg); this.isSaving = false; this.confirmMode = null; },
    });
  }

  doRejectWithdrawal(): void {
    if (!this.request) return;
    if (!this.withdrawDecisionRemarks?.trim()) {
      this.toastr.warning('Remarks are required to refuse a withdrawal.');
      return;
    }
    this.isSaving = true;
    this.service.rejectWithdrawal(this.request.requestId, {
      remarks: this.withdrawDecisionRemarks.trim(),
    }).subscribe({
      next: (r) => {
        this.request = r;
        this.isSaving = false;
        this.confirmMode = null;
        this.withdrawDecisionRemarks = '';
        this.toastr.success('Withdrawal refused — the approved attendance stands.');
      },
      error: (msg) => { this.toastr.error(msg); this.isSaving = false; this.confirmMode = null; },
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
