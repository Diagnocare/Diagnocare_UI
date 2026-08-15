import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { catchError, throwError } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';

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
 * swallow a server error. The original error is re-thrown so components can still
 * react (reset loading state, etc.).
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
      return throwError(() => err);
    })
  );
};

/**
 * Pulls the most meaningful message out of an HttpErrorResponse, covering the
 * response shapes this API produces:
 *  - network/CORS failure (status 0)
 *  - ProblemDetails            { title, detail }
 *  - OperationResult           { message }
 *  - simple error object       { error: "..." }
 *  - ASP.NET ModelState        { errors: { field: [msg, ...] } }
 *  - plain string body
 */
function extractErrorMessage(err: HttpErrorResponse): string {
  // No connection / server unreachable / CORS / DNS.
  if (err.status === 0) {
    return 'Unable to reach the server. Please check your connection and try again.';
  }

  const body = err.error;

  // Plain string body (but ignore raw HTML error pages).
  if (typeof body === 'string' && body.trim() && !/^\s*</.test(body)) {
    return body.trim();
  }

  if (body && typeof body === 'object') {
    // OperationResult / ProblemDetails / { error }
    const direct =
      body.message ||
      body.detail ||
      body.error ||
      body.title;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    // ASP.NET ModelState validation errors: { errors: { field: [msg] } }
    if (body.errors && typeof body.errors === 'object') {
      const messages = Object.values(body.errors)
        .flat()
        .filter((m): m is string => typeof m === 'string' && !!m.trim());
      if (messages.length) {
        return messages.join(' ');
      }
    }
  }

  // Fall back to status-based text.
  if (err.status >= 500) {
    return 'A server error occurred. Please try again, and contact support if it persists.';
  }
  if (err.status === 404) {
    return 'The requested resource was not found.';
  }
  if (err.status === 403) {
    return 'You do not have permission to perform this action.';
  }

  return err.statusText
    ? `Request failed (${err.status} ${err.statusText}).`
    : 'Something went wrong. Please try again.';
}
