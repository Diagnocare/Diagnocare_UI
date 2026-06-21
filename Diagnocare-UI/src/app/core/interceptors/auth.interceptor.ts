import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthConfigService } from '../../services/auth-config.service';
import { LoginService } from '../../services/loginServices/login.service';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { TokenService } from './token.service';

/**
 * Auth interceptor:
 *  - Login-related endpoints  →  Basic Auth (Admin / static password)
 *  - All other endpoints      →  Bearer token from localStorage
 *
 * Token-refresh behaviour:
 *  1. Proactive  — if the stored JWT is already expired before the request
 *                  goes out, refresh first then retry with the new token.
 *  2. Reactive   — if the server returns 401 (clock skew / short-lived token),
 *                  refresh and retry once.
 *  In both cases, if the refresh call itself fails the user is redirected to
 *  /login and all auth data is cleared.
 */
export const AuthInterceptor: HttpInterceptorFn = (req, next) => {
  const authConfig  = inject(AuthConfigService);
  const tokenSvc    = inject(TokenService);
  const loginSvc    = inject(LoginService);
  const router      = inject(Router);

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
  const isBasicAuth = (isLoginPath || isOtpPath) && !isLogoutPath;
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

  // ── Proactive check: token already expired before the request goes out ────
  if (tokenSvc.hasToken() && tokenSvc.isTokenExpired()) {
    return refreshAndRetry();
  }

  // ── Normal flow: attach Bearer, then watch for 401 ────────────────────────
  return next(withBearer(req)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        // Session forcibly terminated (a new login from another browser replaced ours).
        // Don't attempt a refresh — the new token won't match either. Redirect with
        // a query param so the login page can show the user an informative message.
        //
        // Check BOTH the response header AND the body: the header is reliable in dev
        // (same-origin) but may be stripped by a reverse proxy in QA/prod. The body
        // JSON { error: "session_terminated" } is the authoritative fallback.
        const sessionTerminated =
          err.headers?.get('X-Auth-Error') === 'session_terminated' ||
          err.error?.error === 'session_terminated';
        if (sessionTerminated) {
          tokenSvc.markSessionTerminated();
          router.navigate(['/login'], { queryParams: { reason: 'session_terminated' } });
          return throwError(() => err);
        }
        return refreshAndRetry();
      }
      return throwError(() => err);
    })
  );
};