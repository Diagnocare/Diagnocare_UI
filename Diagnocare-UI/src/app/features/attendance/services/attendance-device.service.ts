import { Injectable } from '@angular/core';

/**
 * Holds the attendance device credential on this handset.
 *
 * <b>Why a second credential exists at all.</b> The application allows one active session
 * per user: a new login terminates the previous one over SignalR. An employee signing in
 * on their phone to check in would therefore log themselves out of the lab workstation
 * they were working at — twenty staff, twice a day. So attendance does not use the login
 * session. An administrator enrols the handset once, the resulting token lives here, and
 * the workstation session is never touched.
 *
 * <b>Why localStorage and not sessionStorage.</b> The login token deliberately lives in
 * sessionStorage and dies with the tab. That is right for a session and fatal here: a
 * mobile browser discards background tabs constantly, and a credential that died with the
 * tab would put the employee back through password, second factor and PIN twice a day,
 * which is the exact friction this was built to remove. The compensating controls are on
 * the server — the enrolment is checked on every request, so revoking a lost handset
 * takes effect on its next call.
 *
 * Every access is guarded. localStorage throws in private mode on some browsers, and an
 * employee unable to open the attendance screen because storage was unavailable would be
 * a worse failure than simply asking them to sign in.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceDeviceService {

  /** Header the backend reads the credential from. Matches AttendanceDeviceToken.HeaderName. */
  static readonly HEADER = 'X-Attendance-Device';

  private readonly TOKEN_KEY  = 'attendanceDeviceToken';
  private readonly DEVICE_KEY = 'attendanceDeviceId';

  /** The enrolled token, or null when this handset has not been enrolled. */
  getToken(): string | null {
    try {
      const value = localStorage.getItem(this.TOKEN_KEY);
      return value && value.trim().length > 0 ? value : null;
    } catch {
      return null;
    }
  }

  hasToken(): boolean {
    return this.getToken() !== null;
  }

  /**
   * Stores a token issued by an administrator.
   *
   * Returns false when storage refused, so the caller can say "this browser will not
   * remember the device" instead of silently appearing to succeed and failing on the
   * next page load.
   */
  setToken(token: string): boolean {
    try {
      localStorage.setItem(this.TOKEN_KEY, token.trim());
      return true;
    } catch {
      return false;
    }
  }

  clearToken(): void {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
    } catch {
      // Nothing useful to do — the caller is already on its way somewhere else.
    }
  }

  /**
   * A stable per-installation identifier, generated once.
   *
   * Recorded on every attendance event. Not a security control — a client can send
   * anything — but it is what makes "this employee checked in from a different handset
   * today" visible in the audit trail.
   */
  getDeviceIdentifier(): string {
    try {
      const existing = localStorage.getItem(this.DEVICE_KEY);
      if (existing) return existing;

      const generated = this.newIdentifier();
      localStorage.setItem(this.DEVICE_KEY, generated);
      return generated;
    } catch {
      // Storage unavailable: return a per-call value rather than failing. The audit row
      // still records that *a* device was used, it just cannot be correlated across
      // check-ins — which is the honest outcome when the browser will not remember.
      return this.newIdentifier();
    }
  }

  private newIdentifier(): string {
    // randomUUID needs a secure context, which this page already requires for
    // geolocation and the camera. The fallback is for an http:// development host,
    // where the identifier's only job is to be distinct.
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
    } catch {
      // fall through
    }

    return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
