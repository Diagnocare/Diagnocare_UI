import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { controllerEndpoints, apiEndpoints } from 'src/app/constant/constants';
import { LeaveBalanceDTO, LeaveYearEndResultDTO } from 'src/app/models/leave/leave-balance.dto';

/**
 * Paid leave balances and the year-end carry-forward (api/Leave).
 *
 * Balances are derived server-side from attendance and the employee's monthly
 * allocation on every read, so there is nothing to cache here — a leave approved
 * a moment ago is already reflected in the next call.
 */
@Injectable({ providedIn: 'root' })
export class LeaveService {

  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.leave;
  }

  /**
   * GET api/Leave/MyBalance?year=YYYY
   * The caller's own accumulated paid-leave position. Any authenticated staff member.
   * Omit the year for the current one.
   */
  getMyBalance(year?: number): Observable<LeaveBalanceDTO> {
    const q = year ? `?year=${year}` : '';
    return this.http.get<LeaveBalanceDTO>(
      `${this.baseUrl}${apiEndpoints.myLeaveBalance}${q}`);
  }

  /**
   * GET api/Leave/Balance/{userId}?year=YYYY
   * One employee's position. Super Admin only.
   */
  getBalance(userId: number, year?: number): Observable<LeaveBalanceDTO> {
    const q = year ? `?year=${year}` : '';
    return this.http.get<LeaveBalanceDTO>(
      `${this.baseUrl}${apiEndpoints.leaveBalance}/${userId}${q}`);
  }

  /**
   * GET api/Leave/YearEndPreview?year=YYYY
   * What the carry-forward out of that year would produce, without writing anything.
   * The current year is accepted and comes back as a projection.
   */
  previewYearEnd(year?: number): Observable<LeaveYearEndResultDTO> {
    const q = year ? `?year=${year}` : '';
    return this.http.get<LeaveYearEndResultDTO>(
      `${this.baseUrl}${apiEndpoints.leaveYearEndPreview}${q}`);
  }

  /**
   * POST api/Leave/RunYearEnd?year=YYYY
   * Commits the carry-forward for the transition out of that year. Super Admin only;
   * the year must already have ended.
   *
   * Safe to call more than once: an employee who already has a carry-forward row is
   * reported as skipped and their balance is left untouched, so the days are never
   * credited twice. The scheduled job runs the same process, so this is a manual
   * trigger rather than the only path.
   */
  runYearEnd(year?: number): Observable<LeaveYearEndResultDTO> {
    const q = year ? `?year=${year}` : '';
    return this.http.post<LeaveYearEndResultDTO>(
      `${this.baseUrl}${apiEndpoints.runLeaveYearEnd}${q}`, null);
  }
}
