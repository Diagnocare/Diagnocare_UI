import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { SKIP_ERROR_TOAST_HEADER } from 'src/app/core/interceptors/error.interceptor';
import {
  EMPTY_NOTIFICATION_COUNTS,
  NotificationModuleKey,
  UserNotification,
  UserNotificationCounts,
} from 'src/app/models/notification/user-notification.model';

/**
 * The logged-in user's own in-app notifications: visit assigned, attendance marked,
 * salary paid, attendance request decided. Backs the header bell and the User Panel
 * badges. Every endpoint is scoped to the caller on the API — no user id is ever sent.
 *
 * Same shape as DiscountApprovalService: a shared BehaviorSubject for the counts,
 * refreshed by the header's single 60-second poll and immediately after any action
 * that changes them. Every call here is a background call — no error toast, and no
 * /access-denied redirect — because a badge is never worth interrupting someone.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly apiUrl = getDiagnocareApiUrl() + controllerEndpoints.notification;
  private readonly quiet = { headers: new HttpHeaders({ [SKIP_ERROR_TOAST_HEADER]: '1' }) };

  private readonly countsSubject = new BehaviorSubject<UserNotificationCounts>(EMPTY_NOTIFICATION_COUNTS);
  readonly counts$ = this.countsSubject.asObservable();

  constructor(private http: HttpClient) {}

  /** Refreshes the badge counts. Silent on failure — keeps the last known value. */
  refreshUnread(): void {
    this.http.get<UserNotificationCounts>(`${this.apiUrl}${apiEndpoints.notificationUnreadCount}`, this.quiet).pipe(
      map(r => normaliseCounts(r)),
      catchError(() => of(this.countsSubject.value)),
    ).subscribe(c => this.countsSubject.next(c));
  }

  /** Newest first. Returns [] on failure. */
  list(take = 20, before?: number): Observable<UserNotification[]> {
    const q = before ? `?take=${take}&before=${before}` : `?take=${take}`;
    return this.http.get<UserNotification[]>(`${this.apiUrl}${q}`, this.quiet).pipe(
      catchError(() => of([] as UserNotification[])),
    );
  }

  markRead(id: number): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}${id}/${apiEndpoints.notificationRead}`, {}, this.quiet).pipe(
      catchError(() => of(void 0)),
      tap(() => this.refreshUnread()),
    );
  }

  markAllRead(): Observable<void> {
    return this.http.post<unknown>(`${this.apiUrl}${apiEndpoints.notificationReadAll}`, {}, this.quiet).pipe(
      map(() => void 0),
      catchError(() => of(void 0)),
      tap(() => this.refreshUnread()),
    );
  }

  /**
   * Clears one module's badge. Called by My Visits / My Salary / My Attendance on open —
   * seeing the page is seeing the news. Skips the round trip when there is nothing unread.
   */
  markModuleRead(...modules: NotificationModuleKey[]): void {
    const current = this.countsSubject.value;
    const todo = modules.filter(m => (current.byModule[m] ?? 0) > 0);
    if (todo.length === 0) {
      // Counts may simply be stale (first page load before the first poll) — check once.
      this.refreshUnreadThen(() => this.markModuleReadNow(modules));
      return;
    }
    this.markModuleReadNow(todo);
  }

  private markModuleReadNow(modules: NotificationModuleKey[]): void {
    const current = this.countsSubject.value;
    const todo = modules.filter(m => (current.byModule[m] ?? 0) > 0);
    if (todo.length === 0) return;

    let remaining = todo.length;
    for (const m of todo) {
      this.http.post(`${this.apiUrl}${apiEndpoints.notificationReadModule}/${m}`, {}, this.quiet).pipe(
        catchError(() => of(null)),
      ).subscribe(() => {
        if (--remaining === 0) this.refreshUnread();
      });
    }
  }

  private refreshUnreadThen(next: () => void): void {
    this.http.get<UserNotificationCounts>(`${this.apiUrl}${apiEndpoints.notificationUnreadCount}`, this.quiet).pipe(
      map(r => normaliseCounts(r)),
      catchError(() => of(this.countsSubject.value)),
    ).subscribe(c => { this.countsSubject.next(c); next(); });
  }
}

/** Fills any module the API left out, so templates can index byModule without guards. */
function normaliseCounts(r: Partial<UserNotificationCounts> | null | undefined): UserNotificationCounts {
  const byModule = { ...EMPTY_NOTIFICATION_COUNTS.byModule, ...(r?.byModule ?? {}) };
  const unread = typeof r?.unread === 'number'
    ? r.unread
    : Object.values(byModule).reduce((a, b) => a + (b || 0), 0);
  return { unread, byModule };
}
