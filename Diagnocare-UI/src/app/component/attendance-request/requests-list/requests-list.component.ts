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
  AttendanceRequestCounts,
  AttendanceRequestDTO,
  AttendanceRequestFilter,
  RequestBucket,
  RequestStatus,
  REQUEST_BUCKETS,
  USER_STATUS_FILTERS,
} from 'src/app/models/attendanceRequest/attendance-request.model';

/** Shared empty result for collapsed history — see historyRows(). */
const NO_HISTORY: AttendanceRequestDTO[] = [];

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
   * The admin's three views. A queue is a worklist, not a database browser: the
   * question on arrival is "what needs me?", and after that "what did I decide about
   * X?" — so those are the filters. Listing all six lifecycle states instead meant
   * three of them overlapped (Awaiting decision IS Pending + Withdrawal requested) and
   * two were outcomes no admin acts on. The exact state is still on every row's badge.
   */
  readonly buckets = REQUEST_BUCKETS;

  /** Status chips for an employee's own list — short and personal, so all states stay. */
  readonly userStatusOptions = USER_STATUS_FILTERS;

  /** Tab badges. Null until loaded, so a tab never briefly claims zero work. */
  counts: AttendanceRequestCounts | null = null;

  /**
   * True when the signed-in user REVIEWS other people's requests, i.e. Super
   * Admin. Deliberately not the isAdmin() helper: a plain Admin now raises
   * attendance corrections for themselves like any other staff member, and the
   * Super Admin approves them — so an Admin must get the self-service view here,
   * not the review queue. Approving your own correction is what this prevents.
   */
  isReviewer = false;
  rows: AttendanceRequestDTO[] = [];
  total = 0;
  isLoading = false;

  /**
   * Rows whose earlier attempts are showing, keyed by requestId. Collapsed by
   * default — the history is there for when it's asked for, not to reassert
   * itself on every load. Cleared on reload so it can't point at stale ids.
   */
  private expanded = new Set<number>();

  // Admin default: everything awaiting a decision (actionable). User default: All.
  filter: AttendanceRequestFilter = {
    bucket: 'needsaction', status: 0,
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
    this.load();
    if (this.isReviewer) this.loadCounts();
  }

  load(): void {
    this.isLoading = true;
    this.expanded.clear();
    if (this.isReviewer) {
      const payload: AttendanceRequestFilter = {
        ...this.filter,
        status: undefined,                       // the queue filters by bucket, not state
        search: this.filter.search?.trim() || undefined,
        fromDate: this.filter.fromDate || undefined,
        toDate: this.filter.toDate || undefined,
      };
      this.service.getAllRequests(payload).subscribe({
        next: (res) => { this.rows = res.items; this.total = res.totalCount; this.isLoading = false; },
        error: (msg) => { this.toastr.error(msg); this.isLoading = false; },
      });
    } else {
      this.service.getMyRequests(this.filter.status || undefined).subscribe({
        next: (rows) => { this.rows = rows; this.total = rows.length; this.isLoading = false; },
        error: (msg) => { this.toastr.error(msg); this.isLoading = false; },
      });
    }
  }

  /**
   * Badge totals for the tabs. Failure is swallowed on purpose: a missing count is a
   * cosmetic loss, and a toast about it on top of the list's own error would be noise.
   */
  private loadCounts(): void {
    this.service.getRequestCounts().subscribe({
      next: (c) => (this.counts = c),
      error: () => (this.counts = null),
    });
  }

  applyFilters(): void { this.filter.page = 1; this.load(); }

  /**
   * Clear the date range and search. The admin's tab survives on purpose — it is the
   * view they chose, not a filter they set, and silently throwing them back to the
   * queue after a search would lose their place.
   */
  resetFilters(): void {
    this.filter = {
      ...this.filter,
      status: 0,                       // employee chip bar back to All; unused by the queue
      search: '', fromDate: '', toDate: '', page: 1,
    };
    this.load();
  }

  /** Employee chip bar. */
  setStatus(value: number): void { this.filter.status = value; this.applyFilters(); }

  /**
   * Admin tab switch. Counts are refreshed alongside, because arriving here after
   * approving something is exactly when a stale badge would mislead.
   */
  setBucket(value: RequestBucket): void {
    if (this.filter.bucket === value) return;
    this.filter.bucket = value;
    this.applyFilters();
    this.loadCounts();
  }

  /** Badge number for a tab, or null while counts are still loading. */
  bucketCount(key: keyof AttendanceRequestCounts): number | null {
    return this.counts ? this.counts[key] : null;
  }

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
      next: () => { this.load(); },
      error: (msg) => this.toastr.error(msg),
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.filter.pageSize));
  }

  /**
   * True once the admin has narrowed the list with the date range or search box.
   * Switching tabs is not "filtering" here — an empty Decided tab means nothing has
   * been decided yet, and offering to clear filters would be answering the wrong
   * question. Only the controls the admin typed into count.
   */
  get hasActiveFilters(): boolean {
    if (this.isReviewer) {
      return !!this.filter.search?.trim() || !!this.filter.fromDate || !!this.filter.toDate;
    }
    return this.filter.status !== 0;
  }

  /** Empty-state heading for the current tab — each bucket is empty for its own reason. */
  get emptyBucketMessage(): string {
    switch (this.filter.bucket) {
      case 'decided': return 'Nothing decided yet';
      case 'all':     return 'No requests yet';
      default:        return 'Nothing awaiting a decision';
    }
  }

  /** Highlights rows the reviewer still needs to act on, so the queue scans at a glance. */
  isAwaitingRow(r: AttendanceRequestDTO): boolean {
    return this.isReviewer
      && (r.requestStatus === RequestStatus.Pending || r.requestStatus === RequestStatus.WithdrawalRequested);
  }

  // ── Same-day history ───────────────────────────────────────────────────────
  // "My requests" returns one row per date. Where that date was asked about more
  // than once, the older attempts come nested on the row rather than as separate
  // rows, and open here on demand.

  /** How many superseded requests sit behind this row. 0 when the day was asked about once. */
  earlierCount(r: AttendanceRequestDTO): number {
    return r.earlierAttempts?.length ?? 0;
  }

  isExpanded(r: AttendanceRequestDTO): boolean {
    return this.expanded.has(r.requestId);
  }

  /** Opens or closes the history under one row. Stops the click reaching the row itself. */
  toggleHistory(r: AttendanceRequestDTO, ev: Event): void {
    ev.stopPropagation();
    if (!this.expanded.delete(r.requestId)) this.expanded.add(r.requestId);
  }

  /**
   * The history rows to render under `r` right now. Returns the same frozen empty
   * array when collapsed rather than a fresh `[]` in the template, so ngFor's
   * differ sees an unchanged reference instead of re-checking on every cycle.
   */
  historyRows(r: AttendanceRequestDTO): AttendanceRequestDTO[] {
    return this.isExpanded(r) ? (r.earlierAttempts ?? NO_HISTORY) : NO_HISTORY;
  }

  /** Toggles newest/oldest first. Reviewer-only — a personal list is short enough to read whole. */
  toggleDateSort(): void {
    if (!this.isReviewer) return;
    this.filter.sortDir = this.filter.sortDir === 'asc' ? 'desc' : 'asc';
    this.applyFilters();
  }
}
