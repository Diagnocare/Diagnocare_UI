import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { race, timer } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { TokenService } from '../interceptors/token.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const tokenSvc = inject(TokenService);
  const router   = inject(Router);

  // Token present (valid OR expired) — let through unconditionally.
  //
  // We intentionally do NOT attempt a silent refresh here even when the token
  // is expired.  LoginService.refreshToken() uses Angular's HttpBackend
  // (raw HTTP, zero interceptors), so calling it from the guard would bypass
  // the auth interceptor's PIN gate entirely — the token would be silently
  // refreshed without ever showing the PIN modal, defeating the whole
  // session-expiry security model.
  //
  // The correct flow for an expired token is:
  //   1. Guard returns true  → route activates, page renders.
  //   2. Page makes its first API call  → auth interceptor detects expiry.
  //   3. Interceptor calls pinGatedRefresh()  → PIN modal shown.
  //   4. User enters PIN  → interceptor refreshes token and retries the call.
  //
  // Force-change-password restricted tokens are also covered: a token exists,
  // so this branch returns true and the change-password page can load normally.
  if (tokenSvc.hasToken()) {
    return true;
  }

  // ── No token ──────────────────────────────────────────────────────────────
  //
  // Same-browser new tab: other tabs already have a session.  Rather than
  // immediately redirecting to /login (which changes the URL and causes a
  // visible flash), ask a sibling tab for the token via BroadcastChannel and
  // race that against a 300 ms timeout.
  //
  //  • Sibling responds in time  → token stored in sessionStorage by
  //    TokenService.handleBroadcast, guard returns true, URL stays as-is.
  //  • No sibling / timeout      → fall through to the /login redirect.
  //
  // NOTE: we deliberately do NOT call clearAuth() here.  Doing so would
  // broadcast a 'logout' message and wipe localStorage.cleanupToken,
  // which would sign out every other open tab.  Tab 2 simply has no
  // sessionStorage token — there is nothing to clear.
  if (tokenSvc.hasOtherActiveTabs()) {
    tokenSvc.requestTokenFromSiblingTab();
    return race(
      tokenSvc.tokenReceived$.pipe(
        take(1),
        map(() => true as const),
      ),
      timer(300).pipe(
        map(() => router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })),
      ),
    );
  }

  // Genuinely no session anywhere — send to login
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
