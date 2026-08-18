import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { WeeklyAttendanceResponseDTO } from 'src/app/models/attendance/user-weekly-attendance.dto';
import { AttendanceRecordDTO } from 'src/app/models/attendance/attendance-record.dto';
import { MemberDto } from 'src/app/models/member/member.dto';
import {AttendanceRequestDTO, CreateAttendanceRequestDTO, UpdateAttendanceRequestDTO, ApproveAttendanceRequestDTO, RejectAttendanceRequestDTO, WithdrawAttendanceRequestDTO, DecideWithdrawalDTO, AttendanceRequestFilter, PagedResult} from 'src/app/models/attendanceRequest/attendance-request.model';

@Injectable({ providedIn: 'root' })
export class AttendanceService {

  private readonly baseUrl:  string;
  private readonly userUrl:  string;

  constructor(private http: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.attendance;
    this.userUrl = getDiagnocareApiUrl() + controllerEndpoints.user;
  }

  /**
   * Returns all registered users (reuses existing user list endpoint).
   * Used to seed the grid even when no attendance records exist yet.
   */
  getAllUsers(): Observable<MemberDto[]> {
    return this.http
      .get<MemberDto[]>(this.userUrl + apiEndpoints.getAllList);
  }

  /**
   * GET api/attendance/GetWeekly?startDate=YYYY-MM-DD
   * Returns each user's attendance records for the 7-day window
   * starting on the supplied Monday date.
   */
  getWeeklyAttendance(mondayDate: string): Observable<WeeklyAttendanceResponseDTO> {
    return this.http
      .get<WeeklyAttendanceResponseDTO>(
        `${this.baseUrl}${apiEndpoints.getWeeklyAttendance}?startDate=${mondayDate}`
      );
  }

  getMonthlyAttendance(year: number, month: number): Observable<WeeklyAttendanceResponseDTO> {
    return this.http
      .get<WeeklyAttendanceResponseDTO>(
        `${this.baseUrl}${apiEndpoints.getMonthly}?year=${year}&month=${month}`
      );
  }

  /**
   * GET api/attendance/GetMyWeekly?startDate=YYYY-MM-DD
   * Returns only the currently logged-in user's weekly attendance.
   * Accessible to all authenticated roles (not just Admin).
   */
  getMyWeeklyAttendance(mondayDate: string): Observable<WeeklyAttendanceResponseDTO> {
    return this.http
      .get<WeeklyAttendanceResponseDTO>(
        `${this.baseUrl}${apiEndpoints.getMyWeeklyAttendance}?startDate=${mondayDate}`
      );
  }

  /**
   * GET api/attendance/GetMyMonthly?year=YYYY&month=M
   * Returns only the currently logged-in user's monthly attendance.
   * Accessible to all authenticated roles (not just Admin).
   */
  getMyMonthlyAttendance(year: number, month: number): Observable<WeeklyAttendanceResponseDTO> {
    return this.http
      .get<WeeklyAttendanceResponseDTO>(
        `${this.baseUrl}${apiEndpoints.getMyMonthly}?year=${year}&month=${month}`
      );
  }

  /**
   * Saves attendance records using the correct HTTP verb per record state:
   *   - New records (attendanceId === 0) → POST /Add
   *   - Existing records (attendanceId > 0) → PUT /Update (upsert)
   *
   * Batches both calls in parallel so the UI only waits for one round-trip.
   * Returns a merged observable that completes when both (if applicable) finish.
   */
  saveBulkAttendance(records: AttendanceRecordDTO[]): Observable<any> {
    const newRecords      = records.filter(r => !r.attendanceId || r.attendanceId === 0);
    const existingRecords = records.filter(r =>  r.attendanceId && r.attendanceId  >  0);

    const calls: Observable<any>[] = [];

    if (newRecords.length)
      calls.push(
        this.http
          .post(`${this.baseUrl}${apiEndpoints.add}`, newRecords)

      );

    if (existingRecords.length)
      calls.push(
        this.http
          .put(`${this.baseUrl}${apiEndpoints.update}`, existingRecords)

      );

    // If there's nothing to do, return an immediate completion.
    if (!calls.length) return new Observable(o => { o.next(null); o.complete(); });

    // Run both calls in parallel; emit when both finish.
    return forkJoin(calls);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Attendance Correction Requests (same controller, api/attendance/requests…)
  // Shared by both User and Admin — the calling component branches on role.
  // ══════════════════════════════════════════════════════════════════════════

  private get requestsUrl(): string {
    return `${this.baseUrl}${apiEndpoints.requests}`;   // api/attendance/requests
  }

  // ── Employee (self) ─────────────────────────────────────────────────────────

  getMyRequests(status?: number): Observable<AttendanceRequestDTO[]> {
    const q = status ? `?status=${status}` : '';
    return this.http
      .get<AttendanceRequestDTO[]>(`${this.baseUrl}${apiEndpoints.myRequests}${q}`);
  }

  getMyRequest(id: number): Observable<AttendanceRequestDTO> {
    return this.http
      .get<AttendanceRequestDTO>(`${this.baseUrl}${apiEndpoints.myRequests}/${id}`);
  }

  createRequest(dto: CreateAttendanceRequestDTO): Observable<AttendanceRequestDTO> {
    return this.http
      .post<AttendanceRequestDTO>(this.requestsUrl, dto);
  }

  updateRequest(id: number, dto: UpdateAttendanceRequestDTO): Observable<AttendanceRequestDTO> {
    return this.http
      .put<AttendanceRequestDTO>(`${this.requestsUrl}/${id}`, dto);
  }

  cancelRequest(id: number): Observable<AttendanceRequestDTO> {
    return this.http
      .post<AttendanceRequestDTO>(`${this.requestsUrl}/${id}/${apiEndpoints.cancelRequest}`, {});
  }

  /**
   * Ask for an already-approved request to be undone.
   * Does not change attendance — it returns the request to the admin queue.
   */
  requestWithdrawal(id: number, dto: WithdrawAttendanceRequestDTO): Observable<AttendanceRequestDTO> {
    return this.http
      .post<AttendanceRequestDTO>(`${this.requestsUrl}/${id}/${apiEndpoints.withdrawRequest}`, dto);
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  getAllRequests(filter: AttendanceRequestFilter): Observable<PagedResult<AttendanceRequestDTO>> {
    let params = new HttpParams()
      .set('page', filter.page)
      .set('pageSize', filter.pageSize);

    if (filter.userId)   params = params.set('userId', filter.userId);
    if (filter.status)   params = params.set('status', filter.status);
    if (filter.awaitingDecision) params = params.set('awaitingDecision', true);
    if (filter.fromDate) params = params.set('fromDate', filter.fromDate);
    if (filter.toDate)   params = params.set('toDate', filter.toDate);
    if (filter.search)   params = params.set('search', filter.search);
    if (filter.sortBy)   params = params.set('sortBy', filter.sortBy);
    if (filter.sortDir)  params = params.set('sortDir', filter.sortDir);

    return this.http
      .get<PagedResult<AttendanceRequestDTO>>(this.requestsUrl, { params });
  }

  getRequest(id: number): Observable<AttendanceRequestDTO> {
    return this.http
      .get<AttendanceRequestDTO>(`${this.requestsUrl}/${id}`);
  }

  getPendingRequestCount(): Observable<number> {
    return this.http
      .get<number>(`${this.baseUrl}${apiEndpoints.pendingRequestCount}`);
  }

  approveRequest(id: number, dto: ApproveAttendanceRequestDTO): Observable<AttendanceRequestDTO> {
    return this.http
      .post<AttendanceRequestDTO>(`${this.requestsUrl}/${id}/${apiEndpoints.approveRequest}`, dto);
  }

  rejectRequest(id: number, dto: RejectAttendanceRequestDTO): Observable<AttendanceRequestDTO> {
    return this.http
      .post<AttendanceRequestDTO>(`${this.requestsUrl}/${id}/${apiEndpoints.rejectRequest}`, dto);
  }

  /** Admin grants a withdrawal — reverts the attendance record. */
  approveWithdrawal(id: number, dto: DecideWithdrawalDTO): Observable<AttendanceRequestDTO> {
    return this.http
      .post<AttendanceRequestDTO>(`${this.requestsUrl}/${id}/${apiEndpoints.approveWithdrawal}`, dto);
  }

  /** Admin refuses a withdrawal — request returns to Approved, attendance untouched. */
  rejectWithdrawal(id: number, dto: DecideWithdrawalDTO): Observable<AttendanceRequestDTO> {
    return this.http
      .post<AttendanceRequestDTO>(`${this.requestsUrl}/${id}/${apiEndpoints.rejectWithdrawal}`, dto);
  }

}
