import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of, race, timer } from 'rxjs';
import { catchError, map, take } from 'rxjs/operators';
import { LoginService } from 'src/app/services/loginServices/login.service';
import { TokenService } from '../interceptors/token.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const tokenSvc  = inject(TokenService);
  const loginSvc  = inject(LoginService);
  const router    = inject(Router);

  // Token is valid — let through immediately
  if (tokenSvc.hasToken() && !tokenSvc.isTokenExpired()) {
    return true;
  }

  // Force-change-password flow: user has a restricted token that may not pass
  // isTokenExpired() or a refresh. As long as a token exists, allow navigation
  // so the user can reach the change-password page.
  const url = state.url;
  if (tokenSvc.hasToken() && url.includes('change-password') && url.includes('forceChange=true')) {
    return true;
  }

  // Token is expired but still present — try a silent refresh
  if (tokenSvc.hasToken()) {
    return loginSvc.refreshToken().pipe(
      map(() => true),
      catchError(() => {
        tokenSvc.clearAuth();
        return of(router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }));
      })
    );
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
