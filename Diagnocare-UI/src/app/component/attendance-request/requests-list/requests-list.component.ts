import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { RequestStatusBadgeComponent } from '../shared/request-status-badge.component';
import { AttendanceService } from 'src/app/services/attendanceServices/attendance.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import {
  AttendanceRequestDTO,
  AttendanceRequestFilter,
  RequestStatus,
} from 'src/app/models/attendanceRequest/attendance-request.model';

/**
 * Single shared list of attendance correction requests for BOTH User and Admin.
 * - User  → their own requests, with "New / Edit / Cancel" affordances.
 * - Admin → all requests, with filter/search/paging and an Employee column.
 * The table layout is identical; role only toggles columns and actions.
 */
@Component({
  selector: 'app-requests-list',
  templateUrl: './requests-list.component.html',
  styleUrls: ['./requests-list.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, DatePickerComponent, RequestStatusBadgeComponent],
})
export class RequestsListComponent implements OnInit {

  readonly RequestStatus = RequestStatus;

  /**
   * Sentinel for the admin's default view. Not a real RequestStatus — it maps to the
   * `awaitingDecision` flag, which the server expands to Pending + WithdrawalRequested.
   * Negative so it can never collide with a status value.
   */
  static readonly AWAITING_DECISION = -1;
  readonly AWAITING_DECISION = RequestsListComponent.AWAITING_DECISION;

  readonly statusOptions = [
    { value: 0, label: 'All' },
    // Admin's working queue: both things that need a decision, in one list.
    { value: RequestsListComponent.AWAITING_DECISION, label: 'Awaiting decision' },
    { value: RequestStatus.Pending, label: 'Pending' },
    { value: RequestStatus.Approved, label: 'Approved' },
    { value: RequestStatus.WithdrawalRequested, label: 'Withdrawal requested' },
    { value: RequestStatus.Rejected, label: 'Rejected' },
    // Labels match REQUEST_STATUS_CONFIG — Cancelled is what withdrawing an unreviewed
    // request produces; Withdrawn is an approved one whose attendance was rolled back.
    { value: RequestStatus.Cancelled, label: 'Withdrawn' },
    { value: RequestStatus.Withdrawn, label: 'Reverted' },
  ];

  /**
   * Chips shown to employees. "Awaiting decision" is an admin queue view and would be
   * meaningless in a personal list, so it is filtered out rather than duplicated as a
   * second array that could drift from statusOptions.
   */
  get userStatusOptions() {
    return this.statusOptions.filter(o => o.value !== this.AWAITING_DECISION);
  }

  isAdmin = false;
  rows: AttendanceRequestDTO[] = [];
  total = 0;
  isLoading = false;

  // Admin default: everything awaiting a decision (actionable). User default: All.
  filter: AttendanceRequestFilter = {
    status: RequestsListComponent.AWAITING_DECISION,
    search: '', fromDate: '', toDate: '',
    page: 1, pageSize: 20, sortBy: 'created', sortDir: 'desc',
  };

  constructor(
    private service: AttendanceService,
    private token: TokenService,
    private router: Router,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.isReviewer = this.token.isSuperAdmin();
    if (!this.isReviewer) this.filter.status = 0;   // users default to All of their own
    this.load();
  }

  load(): void {
    this.isLoading = true;
    if (this.isAdmin) {
      // The AWAITING_DECISION sentinel is not a status — translate it into the flag the
      // server understands, and drop `status` so it can't be sent as a negative number.
      const awaiting = this.filter.status === this.AWAITING_DECISION;

      const payload: AttendanceRequestFilter = {
        ...this.filter,
        status: awaiting ? undefined : (this.filter.status || undefined),
        awaitingDecision: awaiting ? true : undefined,
        search: this.filter.search?.trim() || undefined,
        fromDate: this.filter.fromDate || undefined,
        toDate: this.filter.toDate || undefined,
      };
      this.service.getAllRequests(payload).subscribe({
        next: (res) => { this.rows = res.items; this.total = res.totalCount; this.isLoading = false; },
        error: (msg) => { this.toastr.error(msg); this.isLoading = false; },
      });
    } else {
      // Users have no "awaiting decision" view — their own list is short enough to read
      // whole. Guard against the sentinel leaking through if the option is ever shown.
      const status = this.filter.status === this.AWAITING_DECISION ? undefined : (this.filter.status || undefined);
      this.service.getMyRequests(status).subscribe({
        next: (rows) => { this.rows = rows; this.total = rows.length; this.isLoading = false; },
        error: (msg) => { this.toastr.error(msg); this.isLoading = false; },
      });
    }
  }

  applyFilters(): void { this.filter.page = 1; this.load(); }

  resetFilters(): void {
    this.filter = { status: this.isAdmin ? this.AWAITING_DECISION : 0, search: '', fromDate: '', toDate: '',
                    page: 1, pageSize: 20, sortBy: 'created', sortDir: 'desc' };
    this.load();
  }

  setStatus(value: number): void { this.filter.status = value; this.applyFilters(); }

  changePage(delta: number): void {
    const next = this.filter.page + delta;
    if (next < 1 || next > this.totalPages) return;
    this.filter.page = next;
    this.load();
  }

  newRequest(): void { this.router.navigate(['/attendance-requests/new']); }

  open(r: AttendanceRequestDTO): void {
    this.router.navigate(['/attendance-requests', r.requestId]);
  }

  edit(r: AttendanceRequestDTO, ev: Event): void {
    ev.stopPropagation();
    this.router.navigate(['/attendance-requests', r.requestId, 'edit']);
  }

  /**
   * Take a request back.
   *
   * An unreviewed (Pending) request needs no reason, so it goes straight through from
   * the list. An Approved one requires an explanation, and a cramped table row is the
   * wrong place to ask for it — that case hands off to the detail view, which owns the
   * confirmation and the textarea.
   */
  withdraw(r: AttendanceRequestDTO, ev: Event): void {
    ev.stopPropagation();

    if (r.withdrawalNeedsApproval) {
      this.router.navigate(['/attendance-requests', r.requestId]);
      return;
    }

    this.service.requestWithdrawal(r.requestId, {}).subscribe({
      next: () => { this.toastr.success('Request withdrawn.'); this.load(); },
      error: (msg) => this.toastr.error(msg),
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.filter.pageSize));
  }
}
