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
  readonly statusOptions = [
    { value: 0, label: 'All' },
    { value: RequestStatus.Pending, label: 'Pending' },
    { value: RequestStatus.Approved, label: 'Approved' },
    { value: RequestStatus.Rejected, label: 'Rejected' },
    { value: RequestStatus.Cancelled, label: 'Cancelled' },
  ];

  isAdmin = false;
  rows: AttendanceRequestDTO[] = [];
  total = 0;
  isLoading = false;

  // Admin default: Pending first (actionable). User default: All.
  filter: AttendanceRequestFilter = {
    status: RequestStatus.Pending,
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
    this.isAdmin = this.token.isAdmin();
    if (!this.isAdmin) this.filter.status = 0;   // users default to All of their own
    this.load();
  }

  load(): void {
    this.isLoading = true;
    if (this.isAdmin) {
      const payload: AttendanceRequestFilter = {
        ...this.filter,
        status: this.filter.status || undefined,
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

  applyFilters(): void { this.filter.page = 1; this.load(); }

  resetFilters(): void {
    this.filter = { status: this.isAdmin ? RequestStatus.Pending : 0, search: '', fromDate: '', toDate: '',
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

  cancel(r: AttendanceRequestDTO, ev: Event): void {
    ev.stopPropagation();
    this.service.cancelRequest(r.requestId).subscribe({
      next: () => { this.toastr.success('Request cancelled.'); this.load(); },
      error: (msg) => this.toastr.error(msg),
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.filter.pageSize));
  }
}
