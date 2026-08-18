import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { catchError, throwError } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { extractErrorMessage, toAppHttpError } from 'src/app/core/errors/http-error';

/**
 * Header a caller can set to suppress the automatic error toast for a single
 * request (e.g. background polling, or a flow that renders its own inline error).
 * The header is stripped before the request is sent.
 */
export const SKIP_ERROR_TOAST_HEADER = 'X-Skip-Error-Toast';

/**
 * Centralised HTTP error handling.
 *
 * Any failed HTTP call (network down, 4xx, 5xx) surfaces a toast with the most
 * useful message we can pull from the response, so no component can silently
 * swallow a server error.
 *
 * This is also the single place where errors are NORMALISED. Every failed request
 * is re-thrown as an `AppHttpError` (see core/errors/http-error.ts) carrying the
 * status code, the parsed server body and the server's own message. Services
 * therefore do not pipe `catchError` at all — they used to, and each one mangled
 * the error into a slightly different shape, losing the status and the body on
 * the way to the component.
 *
 * Non-HTTP failures pass through untouched, so AuthInterceptor's redirect
 * sentinels ("Token refresh failed…") stay exactly what they are.
 *
 * Ordering: this interceptor must be registered BEFORE AuthInterceptor in
 * withInterceptors([...]) so that, on the response path, AuthInterceptor runs
 * first and can transparently refresh/retry 401s. Only errors it does not resolve
 * reach this interceptor. 401s are skipped here regardless (auth owns that UX).
 *
 * Note: endpoints that return HTTP 200 with a failure body (e.g. OperationResult
 * { success:false }) are NOT HTTP errors and are intentionally left to the caller
 * to interpret via result.success.
 *
 * 403 handling
 * ────────────
 * A 403 means the session is valid but the role is not permitted — the server-side
 * counterpart of roleGuard. Rather than a toast the user can miss behind a
 * half-rendered screen, we send them to /access-denied, which names the role and
 * the thing that was refused.
 *
 * Requests that opted out of toasts (SKIP_ERROR_TOAST_HEADER — background polls,
 * badge counts, anything speculative) do NOT trigger the redirect. A background
 * poll for a resource this role can't see must not yank the user off the page they
 * are working on.
 */
export const ErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastr = inject(ToastrService);
  const router = inject(Router);

  // Honour per-request opt-out, then strip the header so it never leaves the app.
  const skipToast = req.headers.has(SKIP_ERROR_TOAST_HEADER);
  if (skipToast) {
    req = req.clone({ headers: req.headers.delete(SKIP_ERROR_TOAST_HEADER) });
  }

  // Auth/login/OTP flows have their own bespoke error UX — don't double up.
  const url = req.url || '';
  const isAuthFlow =
    url.includes(controllerEndpoints.login) ||
    url.includes(controllerEndpoints.otp) ||
    url.includes(apiEndpoints.refreshToken) ||
    url.includes(apiEndpoints.logout) ||
    url.includes(apiEndpoints.clearSession);

  /**
   * Calls the app makes on its own initiative rather than because the user
   * opened a page — the session health poll, and anything else fired from
   * AppComponent bootstrap. A 403 on one of these must never navigate: the
   * user would be thrown off a page they legitimately have open.
   *
   * SKIP_ERROR_TOAST_HEADER is the general-purpose opt-out for this, but no
   * caller sets it today, so the poll is named explicitly here.
   */
  const isBackgroundCall = url.includes(apiEndpoints.ping);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && !skipToast && !isAuthFlow) {
        if (err.status === 403) {
          // Role refused by the API. Send the user somewhere that explains why,
          // unless we're already there (a 403 while ON /access-denied would loop).
          if (!router.url.startsWith('/access-denied')) {
            router.navigate(['/access-denied'], {
              queryParams: { attempted: router.url, reason: 'api' },
            });
          }
        } else if (err.status !== 401) {
          // 401 is handled by AuthInterceptor (refresh / redirect). Don't toast it.
          toastr.error(extractErrorMessage(err), 'Error');
        }
      }
      // Normalise on the way out. Non-HTTP errors are returned unchanged.
      return throwError(() => toAppHttpError(err));
    })
  );
};

