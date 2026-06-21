import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { LicenceService } from 'src/app/services/licenceServices/licence.service';

/**
 * Route guard that redirects to /licence-expired when the pathology
 * licence has expired.
 *
 * Exempt paths (always accessible regardless of licence state):
 *   pathology        – home / lab details page (so they can see expiry info)
 *   profile          – account profile
 *   settings         – app settings
 *   change-password  – account security
 *   licence-expired  – the expired page itself
 *
 * The guard calls LicenceService.load() on every navigation, but the service
 * caches the API result after the first call, so no duplicate requests are made.
 *
 * Fail-open: if the API errors out the guard lets the navigation proceed.
 */

/** Top-level path segments that are always allowed even after expiry. */
const EXEMPT_PATHS = new Set([
  'pathology',
  'profile',
  'settings',
  'change-password',
  'licence-expired',
]);

export const licenceGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  const licenceSvc = inject(LicenceService);
  const router     = inject(Router);

  // Extract the first segment of the target URL, ignoring query params
  const firstSegment = state.url.replace(/^\//, '').split('/')[0].split('?')[0];
  if (EXEMPT_PATHS.has(firstSegment)) {
    return true;
  }

  return licenceSvc.load().pipe(
    map(() => {
      if (licenceSvc.isExpired) {
        return router.createUrlTree(['/licence-expired']);
      }
      return true;
    }),
    catchError(() => of(true)) // fail open on service error
  );
};
