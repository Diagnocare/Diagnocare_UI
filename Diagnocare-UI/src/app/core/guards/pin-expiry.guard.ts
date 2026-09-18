import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { PinService }   from 'src/app/services/pinServices/pin.service';
import { TokenService } from '../interceptors/token.service';

/**
 * PinExpiryGuard
 * ──────────────
 * Blocks navigation to any authenticated route when the user's session PIN has
 * expired, redirecting them to the forced /change-pin page instead.
 *
 * Rules:
 *   • If the user has no PIN set            → always allow (PIN is optional).
 *   • If the PIN exists but has no timestamp → allow (legacy PIN, no expiry applied).
 *   • If the PIN is expired                 → redirect to /change-pin?reason=expired.
 *   • If navigating to /change-pin already  → always allow (prevent redirect loop).
 *   • If navigating to /settings            → always allow (user may go there to change PIN).
 */
export const pinExpiryGuard: CanActivateFn = (_route, state) => {
  const pinSvc   = inject(PinService);
  const tokenSvc = inject(TokenService);
  const router   = inject(Router);

  const url = state.url;

  // Always let these pages through so the user can act on the expiry.
  if (url.startsWith('/change-pin') || url.startsWith('/settings')) {
    return true;
  }

  const userId = tokenSvc.getUserId();
  if (!userId) return true; // auth guard will handle the unauthenticated case

  if (!pinSvc.hasPin(userId)) return true; // PIN is optional

  if (pinSvc.isPinExpired(userId)) {
    return router.createUrlTree(['/change-pin'], {
      queryParams: { reason: 'expired' },
    });
  }

  return true;
};
