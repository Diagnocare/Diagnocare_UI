import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { PathologyService } from '../pathologyServices/pathology.service';

/**
 * Singleton service that checks the pathology licence expiry once per session.
 *
 * Usage:
 *   – Call load() once (the licenceGuard does this automatically on every
 *     navigation, but the result is cached after the first API call).
 *   – Read `isExpired`, `daysLeft`, `expiryDate` for synchronous checks.
 *   – Subscribe to `isExpired$` / `daysLeft$` for reactive templates.
 */
@Injectable({ providedIn: 'root' })
export class LicenceService {

  private _expired$    = new BehaviorSubject<boolean>(false);
  private _daysLeft$   = new BehaviorSubject<number | null>(null);
  private _expiryDate$ = new BehaviorSubject<Date | null>(null);

  /** True once the API has been called (prevents duplicate requests). */
  private loaded = false;

  readonly isExpired$  = this._expired$.asObservable();
  readonly daysLeft$   = this._daysLeft$.asObservable();
  readonly expiryDate$ = this._expiryDate$.asObservable();

  constructor(private pathologyService: PathologyService) {}

  /**
   * Loads the licence expiry from the backend exactly once per session.
   * Subsequent calls return immediately with a cached result.
   */
  load(): Observable<void> {
    if (this.loaded) {
      return of(undefined);
    }

    return this.pathologyService.getPathologyExpiryDate().pipe(
      tap((response: any) => {
        if (response?.pathologyExpiryDate) {
          const expiry = new Date(response.pathologyExpiryDate);
          const today  = new Date();
          today.setHours(0, 0, 0, 0);
          expiry.setHours(0, 0, 0, 0);

          const diffMs   = expiry.getTime() - today.getTime();
          const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

          this._expiryDate$.next(expiry);
          this._daysLeft$.next(daysLeft);
          this._expired$.next(daysLeft <= 0);
        }
        this.loaded = true;
      }),
      map(() => undefined),
      catchError(() => {
        // Fail open: a network error must not lock users out
        this.loaded = true;
        return of(undefined);
      })
    );
  }

  // ── Synchronous accessors (valid after load() has completed) ──────────────

  get isExpired(): boolean       { return this._expired$.getValue(); }
  get daysLeft():  number | null { return this._daysLeft$.getValue(); }
  get expiryDate(): Date | null  { return this._expiryDate$.getValue(); }

  /** True when the licence expires within the next `days` days (not yet expired). */
  isExpiringSoon(days = 15): boolean {
    const left = this.daysLeft;
    return left !== null && left > 0 && left <= days;
  }
}
