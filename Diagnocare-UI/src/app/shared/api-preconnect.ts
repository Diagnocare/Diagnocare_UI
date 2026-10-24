import { getDiagnocareApiUrl } from './api-base-url.util';

/**
 * PERF-009 — warm the connection to the API origin as early as possible.
 *
 * The API answers in ~160 ms on a reused keep-alive connection and ~1.9 s on a
 * fresh one: DNS + TCP + TLS to a separate origin costs ~1.8 s on a consumer
 * connection. Today that whole handshake is paid *serially*, because nothing
 * touches the API origin until the first XHR fires — which happens after the
 * bundle has downloaded, Angular has bootstrapped and the first component has
 * asked for data.
 *
 * `<link rel="preconnect">` moves the handshake forward so it overlaps Angular's
 * bootstrap and first render instead of following them. It does not make the
 * handshake cheaper, it only stops it from being the thing the user waits on.
 *
 * `crossorigin="anonymous"` is required, not decorative: the browser keys its
 * connection pool by credentials mode, and every call the app makes is a CORS
 * request without credentials (no `withCredentials` anywhere in the app — the
 * JWT travels in the `Authorization` header). A preconnect without the attribute
 * opens a socket the XHRs cannot reuse, so the handshake would be paid twice.
 *
 * This is a mitigation, not the fix. The fix is to stop being cross-origin at
 * all — see `docs/SAME_ORIGIN_API.md`. Once the API is reached through the SPA's
 * own origin, `getDiagnocareApiUrl()` returns a relative path, this function
 * finds no foreign origin to warm and does nothing.
 */
export function preconnectToApiOrigin(baseUrl: string = getDiagnocareApiUrl()): void {
  if (typeof document === 'undefined') return;

  const origin = foreignOriginOf(baseUrl);
  if (!origin) return;

  // Idempotent: a second call (or a hand-written tag in index.html) must not
  // stack duplicate hints.
  if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

/**
 * The origin of `baseUrl` when it differs from the page's own, else null.
 *
 * Relative bases ('/', '/api/') resolve to the page origin and return null —
 * that is the same-origin deployment, where there is nothing to preconnect to.
 */
function foreignOriginOf(baseUrl: string): string | null {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl, window.location.href);
    return url.origin === window.location.origin ? null : url.origin;
  } catch {
    // A base URL that does not parse is a configuration error the HTTP calls
    // will report far more clearly than a startup hint can.
    return null;
  }
}
