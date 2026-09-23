/**
 * Getting a usable GPS fix out of a phone browser.
 *
 * A single `getCurrentPosition` call is the obvious implementation and the wrong one
 * indoors. The first fix a handset returns inside a concrete building is routinely
 * 100–500 m of claimed accuracy — a cell-tower or Wi-Fi estimate — and it improves over
 * the next few seconds as the GPS radio settles. Taking the first answer means rejecting
 * a technician standing at their own bench; waiting forever means an employee holding a
 * phone at the door with nothing happening.
 *
 * So this watches the position stream, keeps the best fix it has seen, and stops as soon
 * as one is good enough — or returns the best it managed when time runs out and lets the
 * server decide. The server is the authority on whether a fix is acceptable; this only
 * tries to give it the best one the handset can produce.
 */

export interface GeoFix {
  latitude:  number;
  longitude: number;
  /** The browser's own error estimate, in metres. */
  accuracy:  number;
  /** How long acquiring it took, for the "still looking" message. */
  elapsedMs: number;
  /** True when we gave up waiting and returned the best fix so far. */
  timedOut:  boolean;
}

export type GeoFailure =
  | 'unsupported'      // no geolocation API at all
  | 'insecure'         // not a secure context — the API exists but will always refuse
  | 'denied'           // the user said no, or the browser has a standing denial
  | 'unavailable'      // the device could not get a position
  | 'timeout';         // nothing at all arrived in time

export class GeolocationError extends Error {
  constructor(readonly reason: GeoFailure, message: string) {
    super(message);
    this.name = 'GeolocationError';
  }
}

export interface AcquireOptions {
  /** Stop as soon as a fix is at least this precise, in metres. */
  targetAccuracyMetres: number;
  /** Give up waiting for improvement after this long and return the best so far. */
  maxWaitMs: number;
  /** Called with each improved fix, so the screen can show progress. */
  onProgress?: (fix: GeoFix) => void;
}

/**
 * True when the browser can provide a position at all.
 *
 * Checked before asking, because the failure modes are indistinguishable at the call site
 * but need completely different messages: an insecure origin will refuse every single
 * time no matter what the employee does, and telling them to "allow location access"
 * would send them hunting through settings for a permission that was never the problem.
 * `localhost` counts as secure, which is why development works over plain http.
 */
export function describeGeolocationSupport(): GeoFailure | null {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported';
  }

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'insecure';
  }

  return null;
}

/**
 * Acquires the best fix available within the time allowed.
 *
 * Resolves with a fix — possibly one flagged `timedOut` — or rejects with a
 * {@link GeolocationError} when nothing usable arrived.
 */
export function acquirePosition(options: AcquireOptions): Promise<GeoFix> {
  const unsupported = describeGeolocationSupport();

  if (unsupported) {
    return Promise.reject(new GeolocationError(
      unsupported,
      unsupported === 'insecure'
        ? 'Location needs a secure (https) connection.'
        : 'This browser cannot provide a location.',
    ));
  }

  return new Promise<GeoFix>((resolve, reject) => {
    const startedAt = Date.now();

    let best: GeoFix | null = null;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {
          // Nothing to do; the watch is going away with the page regardless.
        }
        watchId = null;
      }

      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const finish = (fix: GeoFix) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(fix);
    };

    const fail = (reason: GeoFailure, message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new GeolocationError(reason, message));
    };

    timer = setTimeout(() => {
      // Time is up. A fix we already have, however imprecise, is worth more than an
      // error: the server may still accept it when the QR code proves presence, and it
      // gives the employee a real distance to look at instead of a shrug.
      if (best) {
        finish({ ...best, timedOut: true, elapsedMs: Date.now() - startedAt });
      } else {
        fail('timeout', 'Could not get a location in time.');
      }
    }, options.maxWaitMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        position => {
          const fix: GeoFix = {
            latitude:  position.coords.latitude,
            longitude: position.coords.longitude,
            // A browser may report accuracy as null despite the type. Treating that as
            // "very poor" rather than as zero matters: the server reads a zero or
            // negative accuracy as unusable precision, not as a perfect fix, and a
            // NaN here would sail through the comparison below.
            accuracy:  Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : 9999,
            elapsedMs: Date.now() - startedAt,
            timedOut:  false,
          };

          if (!best || fix.accuracy < best.accuracy) {
            best = fix;
            options.onProgress?.(fix);
          }

          if (fix.accuracy <= options.targetAccuracyMetres) {
            finish(fix);
          }
        },
        error => {
          // PERMISSION_DENIED is terminal — the watch will never produce anything, so
          // stop rather than sitting until the timeout with a spinner the employee has
          // no way to resolve.
          if (error.code === error.PERMISSION_DENIED) {
            fail('denied', 'Location permission was denied.');
            return;
          }

          // Everything else is left to the deadline. POSITION_UNAVAILABLE and TIMEOUT are
          // both routinely transient — a moment away from a window, a handset still
          // warming up its GPS — and watchPosition often delivers a good fix seconds
          // after reporting one. Treating them as fatal here would abandon the attempt
          // precisely when it was about to succeed, so the timer above is left to decide.
        },
        {
          enableHighAccuracy: true,
          // Per-callback timeout, distinct from our own deadline. Left generous so the
          // browser keeps trying and our timer stays the single source of "long enough".
          timeout: options.maxWaitMs,
          // No cached fix. A position from ten minutes ago is exactly what somebody
          // checking in from the car park would want us to use.
          maximumAge: 0,
        },
      );
    } catch {
      fail('unavailable', 'This device could not start looking for a location.');
    }
  });
}

/** A short, human explanation for each failure, for display next to a retry button. */
export function describeGeoFailure(reason: GeoFailure): string {
  switch (reason) {
    case 'unsupported':
      return 'This browser cannot provide a location. Try a different browser.';
    case 'insecure':
      return 'Location needs a secure (https) connection. Ask your administrator to open the app over https.';
    case 'denied':
      return 'Location permission was denied. Allow location for this site in your browser settings, then try again.';
    case 'unavailable':
      return 'Your device could not determine a location. Move near a window or step outside and try again.';
    case 'timeout':
      return 'Could not get a location in time. Stand still for a moment and try again.';
    default:
      return 'Could not get your location.';
  }
}
