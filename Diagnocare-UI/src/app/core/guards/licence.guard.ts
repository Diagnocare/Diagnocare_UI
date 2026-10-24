import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot } from '@angular/router';
import { LicenceService } from 'src/app/core/services/licence.service';

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
 *
 * PERF-014 — it does not WAIT for that first call. Angular holds a navigation
 * until a guard's observable emits, so returning `licenceSvc.load()` meant the
 * post-login redirect sat on an endpoint whose p90 is 6.25 s with nothing
 * rendered and the destination's lazy chunk not even requested — up to the
 * service's 8 s ceiling. The first navigation now proceeds immediately and the
 * answer is applied when it arrives. That is not a weaker check: the guard
 * already failed open on error and on timeout, so letting it fail open on
 * latency too changes only who waits. Every later navigation is decided
 * synchronously from the cached result, as before.
 */

/** Top-level path segments that are always allowed even after expiry. */
const EXEMPT_PATHS = new Set([
  'pathology',
  'profile',
  'settings',
  'change-password',
  'licence-expired',
]);

/** True when the first segment of `url` is always allowed, whatever the licence state. */
function isExempt(url: string): boolean {
  return EXEMPT_PATHS.has(url.replace(/^\//, '').split('/')[0].split('?')[0]);
}

export const licenceGuard: CanActivateFn = (_route, state: RouterStateSnapshot) => {
  const licenceSvc = inject(LicenceService);
  const router     = inject(Router);

  if (isExempt(state.url)) {
    return true;
  }

  // Answer already in hand (every navigation after the first): decide now.
  if (licenceSvc.isResolved) {
    return licenceSvc.isExpired ? router.createUrlTree(['/licence-expired']) : true;
  }

  // First navigation of the session: render the page, then act on the answer.
  // The URL is re-checked on arrival rather than reused from `state`, because
  // the user may have moved on — possibly onto an exempt page — during the call.
  licenceSvc.load().subscribe(() => {
    if (licenceSvc.isExpired && !isExempt(router.url)) {
      router.navigateByUrl('/licence-expired');
    }
  });

  return true;
};
