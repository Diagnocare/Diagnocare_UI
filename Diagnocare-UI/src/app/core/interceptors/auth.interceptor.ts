import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { AuthConfigService }  from '../../services/auth-config.service';
import { LoginService }       from '../../services/loginServices/login.service';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { TokenService }       from './token.service';
import { PinService }         from '../../services/pinServices/pin.service';
import { PinModalService }    from '../../shared/pin-modal/pin-modal.service';

/**
 * Auth interceptor:
 *  - Login-related endpoints  →  Basic Auth (Admin / static password)
 *  - All other endpoints      →  Bearer token from sessionStorage
 *
 * Token-refresh behaviour (both paths require PIN):
 *  1. Proactive  — token is already expired client-side before the request fires.
 *  2. Reactive   — server returns 401 (clock skew, race condition, etc.).
 *
 *  In both cases:
 *    a. PIN set      — show PIN modal. Correct PIN → refresh + retry.
 *                      Wrong × 3 or cancel → force logout.
 *    b. No PIN set   — show "Set Up a PIN" modal. "Go to Settings" → refresh
 *                      token once + navigate to /settings. "Log Out" → logout.
 *
 *  Concurrent requests that all hit the expired-token check simultaneously are
 *  deduplicated by PinModalService — the modal opens exactly once and all
 *  callers receive the same result.
 *
 *  If the refresh call itself fails the user is redirected to /login.
 */
export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  const authConfig     = inject(AuthConfigService);
  const tokenSvc       = inject(TokenService);
  const loginSvc       = inject(LoginService);
  const router         = inject(Router);
  const pinService     = inject(PinService);
  const pinModalService= inject(PinModalService);

  // ── Always attach X-Browser-Id ────────────────────────────────────────────
  // The backend uses this stable UUID to distinguish "same browser, new tab"
  // (no conflict) from "different browser / incognito" (conflict dialog).
  req = req.clone({ setHeaders: { 'X-Browser-Id': tokenSvc.getBrowserId() } });

  // ── Basic Auth — login / OTP / token-generation endpoints ────────────────
  // Logout and ClearSession are [AllowAnonymous]; Logout is called via rawHttp
  // (bypasses interceptors) and ClearSession handles its own validation, so
  // exclude both from the Basic-auth whitelist to avoid header conflicts.
  const isLoginPath = req.url.includes(controllerEndpoints.login);
  const isLogoutPath = req.url.includes(apiEndpoints.logout) ||
                       req.url.includes(apiEndpoints.clearSession);
  const isOtpPath = req.url.includes(controllerEndpoints.otp);
  // Fingerprint ASSERTION runs mid-login (no JWT yet) and is protected by the
  // BasicAuth policy — attach Basic auth. Registration / status / disable are
  // called by an already-authenticated user, so they fall through to Bearer.
  const isFpAssertPath = req.url.includes(controllerEndpoints.fingerprint + 'assert');
  const isBasicAuth = (isLoginPath || isOtpPath || isFpAssertPath) && !isLogoutPath;
  if (isBasicAuth) {
    return next(req.clone({ setHeaders: { Authorization: authConfig.getBasicAuthHeader() } }));
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
      return pinModalService.requestPinSetup().pipe(
        switchMap(goToSettings => {
          if (goToSettings) {
            return refreshAndRetry().pipe(tap(() => router.navigate(['/settings'])));
          }
          loginSvc.logout().subscribe();
          router.navigate(['/login'], { queryParams: { reason: 'no_pin' } });
          return throwError(() => new Error('No PIN — redirecting to login'));
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
