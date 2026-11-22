import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';

import { PinService }      from 'src/app/services/pinServices/pin.service';
import { PinModalService } from 'src/app/shared/pin-modal/pin-modal.service';
import { TokenService }    from '../interceptors/token.service';

/**
 * PinSetupGuard
 * ─────────────
 * Keeps a user who must set a PIN on the PIN setup page (Settings) until they
 * have one. A PIN is required when either:
 *
 *   • the lab has a Screen Lock Timeout above 0 (set by the Super Admin in
 *     Lab Setup and loaded from the database), so the screen lock is on and
 *     would have nothing to ask for without a PIN; or
 *   • the user was already sent to PIN setup (the "Set Up a PIN" prompt from
 *     the idle screen lock).
 *
 * Without this, the setup could be skipped just by clicking another menu item.
 *
 * Registered as canActivate AND canActivateChild on the authenticated layout.
 * A parent's canActivate runs only when the layout is first entered, so on its
 * own it would not see a menu click from one child page to another.
 * canActivateChild runs on every navigation inside the layout, whatever started
 * it: a menu click, a typed URL, browser back/forward or a redirect.
 *
 * Rules:
 *   • PIN not required                      → allow.
 *   • Required, but a PIN now exists        → clear any pending setup, allow.
 *   • Required, going to /settings          → allow (that is where the PIN is set).
 *   • Required, going anywhere else         → redirect to /settings?setupPin=1.
 *
 * The user can still leave by logging out; logout is an action, not a route.
 */
export const pinSetupGuard: CanActivateFn & CanActivateChildFn = (_route, state) => {
  if (!isPinSetupRequired()) return true;
  if (isSettingsUrl(state.url)) return true;
  return inject(Router).createUrlTree(['/settings'], { queryParams: { setupPin: '1' } });
};

/**
 * True when the signed-in user must set a PIN before using the app. Marks the
 * setup as pending when it is required, and clears a pending setup once a PIN
 * exists. Must run in an injection context.
 *
 * Also used by AppComponent right after the lab's settings arrive, so that a
 * user who is already on a page is moved to PIN setup without waiting for
 * their next click.
 */
export function isPinSetupRequired(): boolean {
  const pinModal = inject(PinModalService);
  const tokens   = inject(TokenService);

  const userId = tokens.getUserId();
  if (!userId) return false; // not signed in: authGuard decides

  if (inject(PinService).hasPin(userId)) {
    if (pinModal.isPinSetupPending) pinModal.endPinSetup();
    return false;
  }

  if (tokens.isScreenLockConfigured()) {
    // Pending as well, so the interceptor and the screen lock treat requests
    // from the setup page as part of setting up, not as a reason to prompt again.
    if (!pinModal.isPinSetupPending) pinModal.beginPinSetup();
    return true;
  }

  return pinModal.isPinSetupPending;
}

/** Path is exactly /settings, ignoring query string and fragment. */
export function isSettingsUrl(url: string): boolean {
  return url.split(/[?#]/)[0] === '/settings';
}
