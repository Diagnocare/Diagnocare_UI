import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { SKIP_ERROR_TOAST_HEADER } from 'src/app/core/interceptors/error.interceptor';
import { AttendanceDeviceService } from 'src/app/core/services/attendance-device.service';
import {
  AttendanceCheckRequest,
  AttendanceCheckResult,
  AttendanceHistoryItem,
  AttendanceQr,
  AttendanceToday,
} from 'src/app/models/attendanceVerification/attendance-verification.model';

/**
 * Device-verified attendance: the employee's screen and the kiosk display.
 *
 * Separate from `AttendanceService`, which serves the existing admin-marked grid and the
 * correction-request workflow. They talk to different controllers, authenticate
 * differently, and one of them has to work on a handset that has never logged in — so
 * putting both behind one service would mean every method carrying an explanation of
 * which half it belonged to.
 *
 * <b>Authentication.</b> Every call attaches the enrolled device token when there is one.
 * The API accepts either that or an ordinary Bearer login, so the same screen works on an
 * enrolled phone and on a workstation where somebody is already signed in. `AuthInterceptor`
 * attaches the Bearer header independently; when no session exists it attaches nothing and,
 * importantly, does not fire the PIN-gated refresh — it guards that on `hasToken()`.
 *
 * <b>Toasts.</b> These calls opt out of the global error toast. A refused check-in is not
 * an error — it comes back 200 with `success: false` and a typed reason the screen renders
 * in place, next to the button the employee just pressed. For the genuine failures, a
 * toast sliding in over a full-screen kiosk or a one-button phone page is worse than the
 * inline message the component already shows.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceCheckInService {

  private readonly baseUrl: string;

  constructor(
    private http: HttpClient,
    private device: AttendanceDeviceService,
  ) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.attendanceCheckIn;
  }

  /** Everything the employee's screen needs, in one round trip. */
  getToday(): Observable<AttendanceToday> {
    return this.http.get<AttendanceToday>(
      this.baseUrl + apiEndpoints.attendanceToday,
      { headers: this.headers() },
    );
  }

  checkIn(request: AttendanceCheckRequest): Observable<AttendanceCheckResult> {
    return this.http.post<AttendanceCheckResult>(
      this.baseUrl + apiEndpoints.attendanceCheckIn,
      this.withDeviceIdentifier(request),
      { headers: this.headers() },
    );
  }

  checkOut(request: AttendanceCheckRequest): Observable<AttendanceCheckResult> {
    return this.http.post<AttendanceCheckResult>(
      this.baseUrl + apiEndpoints.attendanceCheckOut,
      this.withDeviceIdentifier(request),
      { headers: this.headers() },
    );
  }

  /**
   * The caller's own history. There is no employee-id parameter by design — identity
   * comes from the token, so there is no way to ask for a colleague's record.
   */
  getHistory(fromDate: string, toDate: string): Observable<AttendanceHistoryItem[]> {
    return this.http.get<AttendanceHistoryItem[]>(
      `${this.baseUrl}${apiEndpoints.attendanceHistory}?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`,
      { headers: this.headers() },
    );
  }

  /**
   * The current rotation for the kiosk's own location.
   *
   * Takes no location parameter: the backend reads it from the kiosk token's claim, which
   * is what stops one site's display asking for another's code.
   */
  getKioskQr(): Observable<AttendanceQr> {
    return this.http.get<AttendanceQr>(
      this.baseUrl + apiEndpoints.attendanceKioskQr,
      { headers: this.headers() },
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private headers(): HttpHeaders {
    let headers = new HttpHeaders().set(SKIP_ERROR_TOAST_HEADER, 'true');

    const token = this.device.getToken();
    if (token) {
      headers = headers.set(AttendanceDeviceService.HEADER, token);
    }

    return headers;
  }

  /**
   * Stamps the per-installation identifier onto the request.
   *
   * Done here rather than in each component so no call site can forget it — a check-in
   * with no device identifier is one the audit trail cannot tie to a handset.
   */
  private withDeviceIdentifier(request: AttendanceCheckRequest): AttendanceCheckRequest {
    return { ...request, deviceIdentifier: this.device.getDeviceIdentifier() };
  }
}
