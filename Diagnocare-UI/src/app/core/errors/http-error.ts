import { HttpErrorResponse } from '@angular/common/http';

/**
 * Centralised HTTP error handling for the whole app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Why this file exists
 * ─────────────────────────────────────────────────────────────────────────────
 * Every service used to declare its own private `errorHandler`, and between them
 * they threw four different shapes:
 *
 *   throwError(() => error.message || 'Server Error')            // a raw string
 *   throwError(() => new Error(error.message))                   // Error, Angular's text
 *   throwError(() => new Error(`API error: ${m} (status ${s})`)) // status baked into text
 *   throwError(() => error)                                      // the real response
 *
 * All but the last discarded `error.error` — the body where this API puts its
 * actual message, e.g. { message: "No salary configuration found for this user." }
 * — along with the status code. A component could subscribe with an error
 * callback and still have nothing useful to react to.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * How it works now
 * ─────────────────────────────────────────────────────────────────────────────
 * ErrorInterceptor is the ONLY place that converts errors. Every failed request
 * reaches subscribers as an `AppHttpError`, so services no longer pipe
 * `catchError` at all — they just return `this.http.get(...)`.
 *
 * `AppHttpError extends Error`, which keeps `err instanceof Error` true and
 * `err.message` populated, so existing call sites keep working — except that
 * `message` is now the server's own wording rather than Angular's wrapper text.
 * The status code is a real number on `.status`, so nobody has to string-match
 * for it.
 *
 * Non-HTTP failures (e.g. AuthInterceptor's "Token refresh failed" sentinel) are
 * deliberately NOT converted — they are control flow, not server errors.
 */

/** Normalised error for every failed HTTP call in the app. */
export class AppHttpError extends Error {
  /** HTTP status. 0 means the request never reached the server. */
  readonly status: number;
  readonly statusText: string;
  readonly url: string | null;
  /** Parsed response body, exactly as the server sent it. */
  readonly serverBody: unknown;
  /** The untouched Angular error, for anything this class does not model. */
  readonly original: HttpErrorResponse;

  constructor(response: HttpErrorResponse) {
    super(extractErrorMessage(response));
    this.name       = 'AppHttpError';
    this.status     = response.status;
    this.statusText = response.statusText;
    this.url        = response.url;
    this.serverBody = response.error;
    this.original   = response;

    // Required when targeting ES5/ES2015 downlevel: without it `instanceof
    // AppHttpError` is false because the prototype chain is lost through super().
    Object.setPrototypeOf(this, AppHttpError.prototype);
  }

  /** True when the request never reached the server (offline, CORS, DNS). */
  get isNetworkError(): boolean { return this.status === 0; }

  /** True for 5xx. */
  get isServerError(): boolean { return this.status >= 500; }
}

/**
 * Wraps an HttpErrorResponse. Anything else is returned untouched, so
 * AuthInterceptor's redirect sentinels and genuine programming errors are not
 * disguised as server failures.
 */
export function toAppHttpError(err: unknown): unknown {
  return err instanceof HttpErrorResponse ? new AppHttpError(err) : err;
}

/**
 * Pulls the most meaningful message out of a failed response, covering the
 * shapes this API produces:
 *  - network / CORS failure (status 0)
 *  - ProblemDetails            { title, detail }
 *  - OperationResult           { message }
 *  - simple error object       { error: "..." }
 *  - ASP.NET ModelState        { errors: { field: [msg, ...] } }
 *  - plain string body
 */
export function extractErrorMessage(err: HttpErrorResponse): string {
  if (err.status === 0) {
    return 'Unable to reach the server. Please check your connection and try again.';
  }

  const body = err.error;

  // Plain string body, ignoring raw HTML error pages.
  if (typeof body === 'string' && body.trim() && !/^\s*</.test(body)) {
    return body.trim();
  }

  if (body && typeof body === 'object') {
    const direct = body.message || body.detail || body.error || body.title;
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

/**
 * Safe display text for any caught value. Use this instead of passing a caught
 * error straight to `toastr.error(...)`, which renders "[object Object]" for
 * anything that is not already a string.
 */
export function errorText(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof AppHttpError) return err.message;
  if (err instanceof HttpErrorResponse) return extractErrorMessage(err);
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Status check that does not depend on the wording of any message. */
export function isHttpStatus(err: unknown, status: number): boolean {
  if (err instanceof AppHttpError) return err.status === status;
  if (err instanceof HttpErrorResponse) return err.status === status;
  return false;
}

/** HTTP status of a caught error, or null if it was not an HTTP failure. */
export function httpStatusOf(err: unknown): number | null {
  if (err instanceof AppHttpError) return err.status;
  if (err instanceof HttpErrorResponse) return err.status;
  return null;
}

/**
 * For a component's `error:` callback: logs the full response under a label you
 * can grep for, and returns text suitable for an inline message.
 *
 * Does NOT toast — ErrorInterceptor already toasts every non-401/403 failure, so
 * toasting here as well shows the user two of them.
 *
 * @param context what was being attempted, including the ids involved, e.g.
 *                `CalculatePayableSalary(userId=5, 2026-8)`
 */
export function describeHttpError(err: unknown, context: string): string {
  const status = httpStatusOf(err);

  if (status !== null) {
    const detail = err instanceof AppHttpError ? err : null;
    console.error(`[HTTP] ${context} failed`, {
      status,
      statusText: detail?.statusText,
      url:        detail?.url,
      serverBody: detail?.serverBody ?? (err as HttpErrorResponse).error,
      error:      err,
    });
  } else {
    console.error(`[HTTP] ${context} failed with a non-HTTP error`, err);
  }

  return errorText(err);
}
