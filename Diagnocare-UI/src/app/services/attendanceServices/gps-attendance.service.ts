import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { controllerEndpoints } from 'src/app/constant/constants';
import { SKIP_ERROR_TOAST_HEADER } from 'src/app/core/interceptors/error.interceptor';

// ── Models ─────────────────────────────────────────────────────────────────

export interface GpsLocationOption {
  locationId: number; name: string; latitude: number; longitude: number;
  radiusMetres: number; isPrimary: boolean;
  /** 1 = Office, 2 = Field */
  locationType: number;
  /** When false the screen must not ask for a QR code. */
  requireQr: boolean;
}

export interface GpsToday {
  fullName: string; date: string; dayName: string;
  shiftName?: string; shiftStart?: string; shiftEnd?: string;
  hasCheckedIn: boolean; hasCheckedOut: boolean;
  checkInAt?: string; checkOutAt?: string;
  lateMinutes: number; workedMinutes?: number;
  displayStatusLabel: string;
  canCheckIn: boolean; canCheckOut: boolean; blockedReason?: string;
  locations: GpsLocationOption[];
}

export interface GpsCheckRequest {
  locationId: number; latitude: number; longitude: number; accuracyMetres: number;
  qrToken?: string | null; positionTimestampMs?: number;
}

export interface GpsCheckResult {
  success: boolean; failureReason: number; message: string;
  checkInAt?: string; checkOutAt?: string; distanceMetres?: number;
  lateMinutes: number; workedMinutes?: number;
}

export interface GpsExceptionCreate {
  exceptionType: number; action: number; locationId: number; reason: string;
  latitude?: number | null; longitude?: number | null; accuracyMetres?: number | null;
}

export interface GpsExceptionResult { success: boolean; message: string; exceptionId?: number; }

export interface GpsException {
  exceptionId: number; userId: number; fullName: string; attendanceDate: string;
  exceptionType: number; exceptionTypeLabel: string; action: number; actionLabel: string;
  requestedAt: string; locationName?: string;
  claimedLatitude?: number; claimedLongitude?: number; claimedAccuracyMetres?: number;
  claimedDistanceMetres?: number; reason: string; status: number; statusLabel: string;
  reviewedByName?: string; reviewedAt?: string; reviewNote?: string; isOverdue: boolean;
}

export interface GpsDashboard {
  date: string; isHoliday: boolean; holidayName?: string;
  totalEmployees: number; present: number; absent: number; late: number; halfDay: number;
  onLeave: number; notMarked: number; currentlyWorking: number; missingCheckOut: number;
  pendingExceptions: number; flaggedLocations: number;
  office: { present: number; late: number; currentlyWorking: number };
  field: { present: number; late: number; currentlyWorking: number };
  byLocation: { locationId: number; name: string; locationType: number; checkedIn: number; currentlyWorking: number }[];
}

export interface GpsDailyRow {
  date: string; fullName: string; status: string; location?: string; locationType?: string;
  checkIn?: string; checkOut?: string; lateMinutes: number; workedMinutes?: number;
  method: string; flagged: boolean;
}

export interface GpsMonthlyRow {
  userId: number; fullName: string; workingDays: number; presentDays: number; halfDays: number;
  absentDays: number; lateDays: number; missingCheckOutDays: number; totalWorkedMinutes: number; flaggedDays: number;
}

export interface GpsMonthlyReport { year: number; month: number; monthLabel: string; holidayCount: number; rows: GpsMonthlyRow[]; }

export interface GpsLocation {
  locationId: number; name: string; address?: string; latitude: number; longitude: number;
  radiusMetres: number; usingDefaultRadius?: boolean; isActive: boolean;
  locationType: number; requireQr: boolean; assignedEmployeeCount?: number;
}

export interface GpsDevice {
  deviceId: number; userId: number; fullName: string; isKiosk: boolean; locationName?: string;
  label?: string; expiresAt: string; isActive: boolean; lastUsedAt?: string;
}

export interface KioskQr { locationId: number; locationName: string; qrDataUri: string; expiresInSeconds: number; manualCode: string; }

export const KIOSK_TOKEN_KEY = 'attendance.kioskDeviceToken';
const DEVICE_HEADER = 'X-Attendance-Device';

@Injectable({ providedIn: 'root' })
export class GpsAttendanceService {
  private readonly checkIn = getDiagnocareApiUrl() + controllerEndpoints.attendanceCheckIn;
  private readonly admin = getDiagnocareApiUrl() + controllerEndpoints.attendanceAdmin;
  private readonly setup = getDiagnocareApiUrl() + controllerEndpoints.attendanceSetup;

  constructor(private http: HttpClient) {}

  // ── Employee ────────────────────────────────────────────────────────────
  getToday(): Observable<GpsToday> { return this.http.get<GpsToday>(`${this.checkIn}/today`); }

  doCheckIn(body: GpsCheckRequest): Observable<GpsCheckResult> {
    return this.http.post<GpsCheckResult>(`${this.checkIn}/check-in`, body);
  }

  doCheckOut(body: GpsCheckRequest): Observable<GpsCheckResult> {
    return this.http.post<GpsCheckResult>(`${this.checkIn}/check-out`, body);
  }

  createException(body: GpsExceptionCreate): Observable<GpsExceptionResult> {
    return this.http.post<GpsExceptionResult>(`${this.checkIn}/exceptions`, body);
  }

  myExceptions(): Observable<GpsException[]> { return this.http.get<GpsException[]>(`${this.checkIn}/exceptions/mine`); }

  cancelException(id: number): Observable<GpsExceptionResult> {
    return this.http.post<GpsExceptionResult>(`${this.checkIn}/exceptions/${id}/cancel`, {});
  }

  // ── Kiosk (device credential, no login) ─────────────────────────────────
  getKioskQr(deviceToken: string): Observable<KioskQr> {
    const headers = new HttpHeaders({ [DEVICE_HEADER]: deviceToken, [SKIP_ERROR_TOAST_HEADER]: '1' });
    return this.http.get<KioskQr>(`${this.checkIn}/qr`, { headers });
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  dashboard(date?: string): Observable<GpsDashboard> {
    return this.http.get<GpsDashboard>(`${this.admin}/dashboard`, { params: this.p({ date }) });
  }

  daily(date?: string, locationId?: number): Observable<GpsDailyRow[]> {
    return this.http.get<GpsDailyRow[]>(`${this.admin}/reports/daily`, { params: this.p({ date, locationId }) });
  }

  monthly(year: number, month: number): Observable<GpsMonthlyReport> {
    return this.http.get<GpsMonthlyReport>(`${this.admin}/reports/monthly`, { params: this.p({ year, month }) });
  }

  exportDaily(date: string, format: 'xlsx' | 'pdf'): Observable<Blob> {
    return this.http.get(`${this.admin}/reports/daily/export`, { params: this.p({ date, format }), responseType: 'blob' });
  }

  exportMonthly(year: number, month: number, format: 'xlsx' | 'pdf'): Observable<Blob> {
    return this.http.get(`${this.admin}/reports/monthly/export`, { params: this.p({ year, month, format }), responseType: 'blob' });
  }

  exceptions(status?: number): Observable<{ items: GpsException[]; totalCount: number }> {
    return this.http.get<{ items: GpsException[]; totalCount: number }>(
      `${this.admin}/exceptions`, { params: this.p({ status, pageSize: 100 }) });
  }

  approve(id: number, note?: string): Observable<GpsExceptionResult> {
    return this.http.post<GpsExceptionResult>(`${this.admin}/exceptions/${id}/approve`, { note });
  }

  reject(id: number, note: string): Observable<GpsExceptionResult> {
    return this.http.post<GpsExceptionResult>(`${this.admin}/exceptions/${id}/reject`, { note });
  }

  // ── Admin setup ─────────────────────────────────────────────────────────
  locations(): Observable<GpsLocation[]> {
    return this.http.get<GpsLocation[]>(`${this.setup}/locations`, { params: this.p({ includeInactive: true }) });
  }

  saveLocation(body: Partial<GpsLocation>): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.setup}/locations`, body);
  }

  devices(): Observable<GpsDevice[]> { return this.http.get<GpsDevice[]>(`${this.setup}/devices`); }

  enrolDevice(body: { userId: number; isKiosk: boolean; locationId?: number; label?: string }):
    Observable<{ deviceId: number; token: string; expiresAt: string; message: string }> {
    return this.http.post<{ deviceId: number; token: string; expiresAt: string; message: string }>(`${this.setup}/devices`, body);
  }

  revokeDevice(id: number, reason: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.setup}/devices/${id}/revoke`, { reason });
  }

  // ── Browser geolocation ─────────────────────────────────────────────────
  /**
   * One explicit, high-accuracy reading. Called only from a button press — nothing in the
   * app watches the position in the background. `maximumAge: 0` forbids a cached fix.
   */
  getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) { reject({ code: 0, message: 'Geolocation is not supported by this browser.' }); return; }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }

  private p(values: Record<string, string | number | boolean | undefined | null>): HttpParams {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(values)) {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    }
    return params;
  }
}
