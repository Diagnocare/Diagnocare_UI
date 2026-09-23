import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { DiscountApprovalItem } from 'src/app/models/discountApproval/discount-approval.model';
import { SKIP_ERROR_TOAST_HEADER } from 'src/app/core/interceptors/error.interceptor';

/**
 * Super Admin queue for discounts above the lab's max discount.
 * Every endpoint is SuperAdminOnly on the API — call only when TokenService.isSuperAdmin().
 */
@Injectable({ providedIn: 'root' })
export class DiscountApprovalService {
  private readonly apiUrl = getDiagnocareApiUrl() + controllerEndpoints.discountApproval;

  /** Pending count for the nav badge. Shared so the page and the header stay in step. */
  private readonly pendingCountSubject = new BehaviorSubject<number>(0);
  readonly pendingCount$ = this.pendingCountSubject.asObservable();

  constructor(private http: HttpClient) {}

  getPending(): Observable<DiscountApprovalItem[]> {
    return this.http.get<DiscountApprovalItem[]>(`${this.apiUrl}Pending`).pipe(
      tap(list => this.pendingCountSubject.next(list.filter(i => i.bookingStatus !== 'Cancelled').length)),
    );
  }

  getHistory(take = 50): Observable<DiscountApprovalItem[]> {
    return this.http.get<DiscountApprovalItem[]>(`${this.apiUrl}History?take=${take}`);
  }

  /** Refreshes the badge. Silent on failure — a badge is never worth an error toast. */
  refreshPendingCount(): void {
    // Background poll: no toast, and no /access-denied redirect on a 403.
    const headers = new HttpHeaders({ [SKIP_ERROR_TOAST_HEADER]: '1' });
    this.http.get<{ pending: number }>(`${this.apiUrl}PendingCount`, { headers }).pipe(
      map(r => r?.pending ?? 0),
      catchError(() => of(this.pendingCountSubject.value)),
    ).subscribe(n => this.pendingCountSubject.next(n));
  }

  /**
   * Approves a request. `grantedDiscount` settles it below what was asked — a 60%
   * request against a 30% limit can be approved at 45%; omit it to grant the request
   * in full. The API requires a remark whenever the granted rate is lower.
   */
  approve(receiptId: number, remark?: string, grantedDiscount?: number | null): Observable<DiscountApprovalItem> {
    return this.http.post<DiscountApprovalItem>(`${this.apiUrl}${receiptId}/Approve`, {
      remark: remark || null,
      grantedDiscount: grantedDiscount ?? null,
    }).pipe(tap(() => this.refreshPendingCount()));
  }

  reject(receiptId: number, remark: string): Observable<DiscountApprovalItem> {
    return this.http.post<DiscountApprovalItem>(`${this.apiUrl}${receiptId}/Reject`, { remark })
      .pipe(tap(() => this.refreshPendingCount()));
  }
}
