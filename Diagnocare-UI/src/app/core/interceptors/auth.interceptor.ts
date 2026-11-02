import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { LoginService }       from '../../services/loginServices/login.service';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { TokenService }       from './token.service';
import { PinService }         from '../../services/pinServices/pin.service';
import { PinModalService }    from '../../shared/pin-modal/pin-modal.service';

/**
 * Auth interceptor:
 *  - Pre-login endpoints      →  sent as-is, no credential header. They are authorised by the
 *                                request itself (password, OTP, TOTP, WebAuthn assertion, reset token),
 *                                never by a secret shipped in this bundle.
 *  - All other endpoints      →  Bearer token from sessionStorage
 *
 * Token-refresh behaviour (both paths require PIN):
 *  1. Proactive  — token is already expired client-side before the request fires.
 *  2. Reactive   — server returns 401 (clock skew, race condition, etc.).
 *
 *  In both cases:
 *    a. PIN set      — show PIN modal. Correct PIN → refresh + retry.
 *                      Wrong × 3 or cancel → force logout.
 *    b. No PIN set   — show "Set Up a PIN" modal. A missing PIN is a setup
 *                      state, NOT an auth failure, so "Go to Settings" keeps
 *                      the session and navigates to /settings?setupPin=1
 *                      (token refresh is best-effort only — a failure must not
 *                      log the user out). Only "Log Out" ends the session.
 *
 *  Concurrent requests that all hit the expired-token check simultaneously are
 *  deduplicated by PinModalService — the modal opens exactly once and all
 *  callers receive the same result.
 *
 *  If the refresh call itself fails the user is redirected to /login.
 */
export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenSvc       = inject(TokenService);
  const loginSvc       = inject(LoginService);
  const router         = inject(Router);
  const pinService     = inject(PinService);
  const pinModalService= inject(PinModalService);

  // ── Always attach X-Browser-Id ────────────────────────────────────────────
  // The backend uses this stable UUID to distinguish "same browser, new tab"
  // (no conflict) from "different browser / incognito" (conflict dialog).
  req = req.clone({ setHeaders: { 'X-Browser-Id': tokenSvc.getBrowserId() } });

  // ── Pre-login endpoints — no Authorization header ─────────────────────────
  // Logout and ClearSession are excluded: Logout is called via rawHttp (bypasses
  // interceptors) and ClearSession validates the password itself. Fingerprint
  // ASSERTION runs mid-login (no JWT yet); registration / status / disable are
  // made by an authenticated user and fall through to Bearer.
  const isLoginPath = req.url.includes(controllerEndpoints.login);
  const isLogoutPath = req.url.includes(apiEndpoints.logout) ||
                       req.url.includes(apiEndpoints.clearSession);
  const isOtpPath = req.url.includes(controllerEndpoints.otp);
  const isFpAssertPath = req.url.includes(controllerEndpoints.fingerprint + 'assert');
  const isPreLogin = (isLoginPath || isOtpPath || isFpAssertPath) && !isLogoutPath;
  if (isPreLogin) {
    const ticket = (isOtpPath || isFpAssertPath) ? tokenSvc.getLoginTicket() : null;
    if (ticket) req = req.clone({ setHeaders: { "X-Login-Ticket": ticket } });
    return next(req);
  }

  // ── Helper: add Bearer header ─────────────────────────────────────────────
  const withBearer = (r: typeof req) => {
    const t = tokenSvc.getToken();
    return t ? r.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : r;
  };

  // ── Helper: refresh token then retry request ──────────────────────────────
  const refreshAndRetry = () =>
    loginSvc.refreshToken().pipe(
      switchMap(() => next(withBearer(req))),
      catchError(() => {
        tokenSvc.clearAuth();
        // Don't redirect to login if the user is in a force-change-password flow —
        // they have a restricted token that the backend rejects for non-password endpoints.
        const isForceChange = router.url.includes('change-password') &&
                              router.url.includes('forceChange=true');
        if (!isForceChange) {
          router.navigate(['/login']);
        }
        return throwError(() => new Error('Token refresh failed – redirecting to login'));
      })
    );

  // ── Helper: are we on (or navigating to) the PIN-setup page? ──────────────
  // router.navigate() resolves asynchronously, so a request fired in the gap
  // between "Go to Settings" and the URL actually changing would still see the
  // old route.  Prefer the in-flight navigation target when there is one, so
  // that gap cannot re-open the modal.  The optional call keeps this working
  // with a plain Router stub in tests.
  const isOnPinSetupPage = () => {
    const pending = router.getCurrentNavigation?.()?.finalUrl?.toString();
    const url = pending ?? router.url;
    return url.split('?')[0].startsWith('/settings');
  };

  // ── Helper: "Go to Settings" → PIN setup, session preserved ───────────────
  // Deliberately does NOT go through refreshAndRetry(): that helper calls
  // clearAuth() + navigate('/login') when the refresh is rejected, which logged
  // the user out just for not having a PIN yet.  The setup modal only ever
  // appears once the token has expired, and the API refuses to refresh an
  // expired token unless a grace buffer is configured, so that failure was the
  // normal case — "Go to Settings" logged you out almost every time.
  //
  // Here instead:
  //   • renew the token FIRST, then navigate, so the Settings page loads like
  //     any other authenticated page;
  //   • navigate even when the renewal is refused, so the user still reaches
  //     PIN setup (the PIN is stored client-side, so it can still be saved);
  //   • never clear auth state — the session is left exactly as it was.
  //
  // Ordering matters: SettingsComponent fetches the signed-in user's profile in
  // ngOnInit. Navigating before the refresh resolved was a race between the
  // lazy-loaded route chunk and the refresh round-trip — when the page won,
  // its profile calls were made with the still-expired token, got suppressed
  // below, and Settings rendered with no account data at all.
  const goToPinSetup = () => {
    pinModalService.beginPinSetup();
    const openSettings = () => router.navigate(['/settings'], { queryParams: { setupPin: '1' } });
    return loginSvc.refreshToken().pipe(
      // catchError sits BEFORE switchMap so it only covers the refresh itself;
      // a failure of the retried request below must propagate untouched.
      catchError(() => {
        openSettings();
        return throwError(
          () => new Error('PIN not set up yet — navigated to Settings, session kept'),
        );
      }),
      switchMap(() => {
        openSettings();
        return next(withBearer(req));
      }),
    );
  };

  // ── Helper: PIN gate → refresh → retry ────────────────────────────────────
  // Used by BOTH the proactive check and the reactive 401 path so neither
  // path can bypass PIN verification.
  const pinGatedRefresh = () => {
    const userId = tokenSvc.getUserId();
    if (pinService.hasPin(userId)) {
      return pinModalService.requestPin().pipe(
        switchMap(verified => {
          if (verified) return refreshAndRetry();
          loginSvc.logout().subscribe();
          router.navigate(['/login'], { queryParams: { reason: 'pin_failed' } });
          return throwError(() => new Error('PIN failed — redirecting to login'));
        }),
      );
    } else {
      // ── No PIN configured ───────────────────────────────────────────────
      // A missing PIN is a SETUP state, never an authentication failure, so
      // nothing in this branch may clear the token, the user state or the
      // session — except the explicit "Log Out" choice below.

      // Already heading to / sitting on the PIN-setup page. The page's own API
      // calls must not re-open the modal (infinite loop) and must not end the
      // session — but they must not be dropped on the floor either: that left
      // Settings rendering with none of the signed-in user's details.
      //
      // So try to renew once more, silently. No modal: the user already chose
      // "Go to Settings", and with no PIN there is no second factor to ask for,
      // so there is nothing to verify. This is the same renewal goToPinSetup()
      // performs on the way in; repeating it per request means a call that
      // raced ahead of it — or a "Try again" after a transient failure — can
      // still succeed. The server remains the authority: it still enforces the
      // grace-buffer window and that the session id is live, so this grants no
      // extra reach. A refusal fails THIS request only, and the session stays.
      if (pinModalService.isPinSetupPending) {
        if (isOnPinSetupPage()) {
          return loginSvc.refreshToken().pipe(
            // Before switchMap: covers the renewal only, so a genuine error
            // from the retried request propagates as itself.
            catchError(() => throwError(
              () => new Error('Session expired and could not be renewed — PIN setup page'),
            )),
            switchMap(() => next(withBearer(req))),
          );
        }
        // They navigated away without setting a PIN — drop the flag so the
        // normal prompt comes back.
        pinModalService.endPinSetup();
      }

      return pinModalService.requestPinSetup().pipe(
        switchMap(goToSettings => {
          if (goToSettings) return goToPinSetup();
          // Only an explicit "Log Out" ends the session.
          loginSvc.logout().subscribe();
          router.navigate(['/login'], { queryParams: { reason: 'no_pin' } });
          return throwError(() => new Error('No PIN — user chose to log out'));
        }),
      );
    }
  };

  // ── Proactive check: token already expired before the request goes out ────
  if (tokenSvc.hasToken() && tokenSvc.isTokenExpired()) {
    return pinGatedRefresh();
  }

  // ── Normal flow: attach Bearer, then watch for 401 ────────────────────────
  return next(withBearer(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        // Session forcibly terminated (a new login from another browser replaced ours).
        // Check BOTH the response header AND the body: the header is reliable in dev
        // (same-origin) but may be stripped by a reverse proxy in QA/prod.
        const sessionTerminated =
          err.headers?.get('X-Auth-Error') === 'session_terminated' ||
          err.error?.error === 'session_terminated';
        if (sessionTerminated) {
          tokenSvc.markSessionTerminated();
          router.navigate(['/login'], { queryParams: { reason: 'session_terminated' } });
          return throwError(() => err);
        }
        // 401 from clock skew or token that expired mid-flight — require PIN.
        // Only when there is an actual session: a 401 with no token simply means
        // the user isn't logged in (e.g. the public register-pathology page), so
        // do NOT prompt to set up a PIN — just propagate the error.
        if (tokenSvc.hasToken()) {
          return pinGatedRefresh();
        }
        return throwError(() => err);
      }
      return throwError(() => err);
    })
  );
};
