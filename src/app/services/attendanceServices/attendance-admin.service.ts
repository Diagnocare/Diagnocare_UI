import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { AttendanceQr } from 'src/app/models/attendanceVerification/attendance-verification.model';
import {
  AttendanceCorrection,
  AttendanceDayView,
  AttendanceDevice,
  AttendanceEventPage,
  AttendanceLocation,
  AttendanceLocationSave,
  EmployeeLocationAssign,
  EmployeeShift,
  EmployeeShiftAssign,
  EnrolAttendanceDevice,
  EnrolAttendanceDeviceResult,
  OperationResult,
  Shift,
  ShiftSave,
} from 'src/app/models/attendanceVerification/attendance-admin.model';

/**
 * Attendance administration: locations, shifts, assignments, devices, the daily view,
 * corrections and the audit trail.
 *
 * Separate from `AttendanceCheckInService`, which the employee screen and kiosk use. That
 * one sends a device token and opts out of the global error toast because a refused
 * check-in is a normal outcome rendered in place. This one is the opposite on both counts:
 * it authenticates with the ordinary Bearer session, and a failure here *is* an error worth
 * a toast, so the global `ErrorInterceptor` is left to do its job.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceAdminService {

  private readonly setupUrl: string;
  private readonly auditUrl: string;

  constructor(private http: HttpClient) {
    this.setupUrl = getDiagnocareApiUrl() + controllerEndpoints.attendanceSetup;
    this.auditUrl = getDiagnocareApiUrl() + controllerEndpoints.attendanceAudit;
  }

  // ── Locations ──────────────────────────────────────────────────────────────

  getLocations(includeInactive = false): Observable<AttendanceLocation[]> {
    return this.http.get<AttendanceLocation[]>(
      `${this.setupUrl}${apiEndpoints.attendanceLocations}?includeInactive=${includeInactive}`);
  }

  saveLocation(dto: AttendanceLocationSave): Observable<OperationResult> {
    return this.http.post<OperationResult>(this.setupUrl + apiEndpoints.attendanceLocations, dto);
  }

  assignEmployeeLocations(dto: EmployeeLocationAssign): Observable<OperationResult> {
    return this.http.post<OperationResult>(
      this.setupUrl + apiEndpoints.attendanceAssignEmployeeLocation, dto);
  }

  /**
   * The live code for a location, so an administrator can confirm a kiosk is configured
   * without standing in front of it. Reuses the rotation the kiosk would get, so
   * previewing never invalidates a code staff are already scanning.
   */
  previewLocationQr(locationId: number): Observable<AttendanceQr> {
    return this.http.get<AttendanceQr>(
      `${this.setupUrl}${apiEndpoints.attendanceLocations}/${locationId}/${apiEndpoints.attendanceQrPreview}`);
  }

  // ── Shifts ─────────────────────────────────────────────────────────────────

  getShifts(includeInactive = false): Observable<Shift[]> {
    return this.http.get<Shift[]>(
      `${this.setupUrl}${apiEndpoints.attendanceShifts}?includeInactive=${includeInactive}`);
  }

  saveShift(dto: ShiftSave): Observable<OperationResult> {
    return this.http.post<OperationResult>(this.setupUrl + apiEndpoints.attendanceShifts, dto);
  }

  getShiftAssignments(userId?: number): Observable<EmployeeShift[]> {
    const url = `${this.setupUrl}${apiEndpoints.attendanceShiftAssignments}`;
    return this.http.get<EmployeeShift[]>(userId ? `${url}?userId=${userId}` : url);
  }

  assignShift(dto: EmployeeShiftAssign): Observable<OperationResult> {
    return this.http.post<OperationResult>(this.setupUrl + apiEndpoints.attendanceAssignShift, dto);
  }

  // ── Devices ────────────────────────────────────────────────────────────────

  getDevices(userId?: number, includeRevoked = false): Observable<AttendanceDevice[]> {
    let params = new HttpParams().set('includeRevoked', includeRevoked);
    if (userId) params = params.set('userId', userId);

    return this.http.get<AttendanceDevice[]>(this.setupUrl + apiEndpoints.attendanceDevices, { params });
  }

  /**
   * Enrols a phone or kiosk. The response carries the token **once** — it is never
   * retrievable again, only its hash is stored.
   */
  enrolDevice(dto: EnrolAttendanceDevice): Observable<EnrolAttendanceDeviceResult> {
    return this.http.post<EnrolAttendanceDeviceResult>(
      this.setupUrl + apiEndpoints.attendanceDevices, dto);
  }

  revokeDevice(deviceId: number, reason: string | null): Observable<OperationResult> {
    return this.http.post<OperationResult>(
      `${this.setupUrl}${apiEndpoints.attendanceDevices}/${deviceId}/${apiEndpoints.attendanceRevokeDevice}`,
      { reason });
  }

  // ── The daily view ─────────────────────────────────────────────────────────

  /**
   * One day across the laboratory. Every employee appears, including those with no record
   * — the question this screen is opened with is usually who is missing.
   */
  getDailyView(
    date: string,
    filters: { locationId?: number | null; shiftId?: number | null; status?: number | null; search?: string | null } = {},
  ): Observable<AttendanceDayView> {
    let params = new HttpParams().set('date', date);

    if (filters.locationId) params = params.set('locationId', filters.locationId);
    if (filters.shiftId) params = params.set('shiftId', filters.shiftId);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.search) params = params.set('search', filters.search);

    return this.http.get<AttendanceDayView>(this.auditUrl + apiEndpoints.attendanceDaily, { params });
  }

  // ── Correction and audit ───────────────────────────────────────────────────

  applyCorrection(attendanceId: number, dto: AttendanceCorrection): Observable<OperationResult> {
    return this.http.post<OperationResult>(
      `${this.auditUrl}${attendanceId}/${apiEndpoints.attendanceCorrection}`, dto);
  }

  getAuditTrail(filters: {
    userId?: number | null;
    attendanceId?: number | null;
    from?: string | null;
    to?: string | null;
    eventType?: number | null;
    page?: number;
    pageSize?: number;
  }): Observable<AttendanceEventPage> {
    let params = new HttpParams()
      .set('page', filters.page ?? 1)
      .set('pageSize', filters.pageSize ?? 50);

    if (filters.userId) params = params.set('userId', filters.userId);
    if (filters.attendanceId) params = params.set('attendanceId', filters.attendanceId);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.eventType) params = params.set('eventType', filters.eventType);

    return this.http.get<AttendanceEventPage>(this.auditUrl + apiEndpoints.attendanceEvents, { params });
  }
}
