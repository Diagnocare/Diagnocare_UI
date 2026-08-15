import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { jwtDecode } from 'jwt-decode';

import { JwtPayload } from 'src/app/models/common/jwtPayload';
import { Role, RoleId } from 'src/app/constant/enums';

/** Maps role label string → numeric RoleId. */
const ROLE_LABEL_TO_ID: Record<string, RoleId> = Object.fromEntries(
  Object.values(Role).map(r => [r.label, r.id])
) as Record<string, RoleId>;

/**
 * Session model
 * ─────────────
 * • sessionStorage.authToken       — JWT for this tab (cleared when tab/browser closes)
 * • sessionStorage.tabId           — UUID for this tab (survives refresh, clears on close)
 * • sessionStorage.sessionTerminated — set on kick-out; makes getToken() → null
 *
 * • localStorage.browserId         — stable UUID per browser/profile, never cleared
 * • localStorage.cleanupToken      — mirrors authToken so logout can clear the DB even
 *                                    after all tabs close (cleared on explicit logout)
 * • localStorage.openTabIds        — JSON array tracking open tabs in this browser
 * • localStorage.pendingCleanup    — flag set when the last tab closes without logout;
 *                                    triggers DB cleanup on the next page open
 *
 * BroadcastChannel 'diagnocare-auth'
 * ────────────────────────────────────
 * token-update  → another tab logged in; adopt token into this tab's sessionStorage
 * logout        → another tab logged out; clear this tab's auth state
 * request-token → new tab asking for the current token (answered by any logged-in tab)
 * token-response→ answer to request-token; emitted on tokenReceived$ for LoginComponent
 */
@Injectable({ providedIn: 'root' })
export class TokenService {

  // ── Storage keys ──────────────────────────────────────────────────────────

  private readonly TOKEN_KEY              = 'authToken';          // sessionStorage
  private readonly SESSION_TERMINATED_KEY = 'sessionTerminated';  // sessionStorage
  private readonly TAB_ID_KEY             = 'tabId';              // sessionStorage

  private readonly BROWSER_ID_KEY         = 'browserId';          // localStorage
  private readonly CLEANUP_TOKEN_KEY      = 'cleanupToken';        // localStorage
  private readonly OPEN_TABS_KEY          = 'openTabIds';         // localStorage
  private readonly PENDING_CLEANUP_KEY    = 'pendingCleanup';     // localStorage

  // ── Cross-tab communication ────────────────────────────────────────────────

  private readonly channel = new BroadcastChannel('diagnocare-auth');

  /**
   * Emits when another tab responds to our `request-token` broadcast.
   * LoginComponent subscribes to this to auto-authenticate without re-login.
   */
  readonly tokenReceived$ = new Subject<string>();

  /**
   * Emits when a sibling tab broadcasts `session-terminated`.
   * AppComponent subscribes to this and redirects to /login immediately,
   * before this tab makes its own API call and discovers the 401 independently.
   * This is the key to eliminating the multi-tab flicker loop.
   */
  readonly sessionKicked$ = new Subject<void>();

  /**
   * True when a previous all-tabs-close left cleanup pending.
   * Read once by LoginComponent on init, then reset.
   */
  hasPendingCleanup = false;

  constructor() {
    this.channel.onmessage = (evt) => this.handleBroadcast(evt.data);
  }

  // ── UUID generation ────────────────────────────────────────────────────────

  /**
   * Generates a UUID v4.
   * Prefers `this.generateUUID()` (available only in secure contexts — HTTPS
   * or localhost).  Falls back to a `Math.random`-based implementation for
   * HTTP dev/test environments where the Web Crypto secure-context restriction
   * applies.  The fallback is fine for tab/browser identity tokens; it is NOT
   * suitable for cryptographic purposes.
   */
  private generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // RFC 4122 §4.4 compliant fallback
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ── Browser identity ───────────────────────────────────────────────────────

  /**
   * Returns this browser's stable UUID (creates it on first call).
   * All tabs in the same browser profile share this value.
   * Private/incognito windows have their own localStorage → different ID.
   */
  getBrowserId(): string {
    let id = localStorage.getItem(this.BROWSER_ID_KEY);
    if (!id) {
      id = this.generateUUID();
      localStorage.setItem(this.BROWSER_ID_KEY, id);
    }
    return id;
  }

  // ── Tab lifecycle tracking ─────────────────────────────────────────────────

  /**
   * Register this tab, detect refresh vs new-open, and handle cleanup flags.
   * Call once from AppComponent.ngOnInit() before any auth checks.
   */
  initTabTracking(): void {
    const existingTabId = sessionStorage.getItem(this.TAB_ID_KEY);

    if (existingTabId) {
      // Page refresh — tabId survives; re-add to the open-tab list (beforeunload removed it)
      this.addTabToList(existingTabId);
      localStorage.removeItem(this.PENDING_CLEANUP_KEY);  // false alarm — still here
      this.hasPendingCleanup = false;
    } else {
      // Genuinely new tab or fresh browser open
      const tabId = this.generateUUID();
      sessionStorage.setItem(this.TAB_ID_KEY, tabId);

      if (localStorage.getItem(this.PENDING_CLEANUP_KEY) === 'true') {
        // All tabs were closed last time without explicit logout → need DB cleanup
        this.hasPendingCleanup = true;
        localStorage.removeItem(this.PENDING_CLEANUP_KEY);
      }

      this.addTabToList(tabId);
    }

    // On tab close (or refresh — but refresh clears the flag above on reload)
    window.addEventListener('beforeunload', () => {
      const tabId = sessionStorage.getItem(this.TAB_ID_KEY);
      if (!tabId) return;
      const remaining = this.removeTabFromList(tabId);
      if (remaining === 0) {
        // Might be the last tab closing; set flag so the next open knows to clean up.
        // If this was a refresh, the next onload call will clear the flag immediately.
        localStorage.setItem(this.PENDING_CLEANUP_KEY, 'true');
      }
    });
  }

  private addTabToList(tabId: string): void {
    const tabs = this.getOpenTabSet();
    tabs.add(tabId);
    localStorage.setItem(this.OPEN_TABS_KEY, JSON.stringify([...tabs]));
  }

  /** Returns remaining tab count after removal. */
  private removeTabFromList(tabId: string): number {
    const tabs = this.getOpenTabSet();
    tabs.delete(tabId);
    localStorage.setItem(this.OPEN_TABS_KEY, JSON.stringify([...tabs]));
    return tabs.size;
  }

  private getOpenTabSet(): Set<string> {
    try {
      const raw = localStorage.getItem(this.OPEN_TABS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Returns true when at least one OTHER tab (not this tab) is listed in openTabIds.
   * Used by LoginComponent.runStartupCleanup() to avoid calling logout() while a
   * sibling tab still holds an active session.
   */
  hasOtherActiveTabs(): boolean {
    const myTabId = sessionStorage.getItem(this.TAB_ID_KEY);
    const allTabs = this.getOpenTabSet();
    if (myTabId) allTabs.delete(myTabId);
    return allTabs.size > 0;
  }

  // ── Token storage ──────────────────────────────────────────────────────────

  /**
   * Persist JWT in sessionStorage (clears on tab/browser close).
   * Also mirrors to localStorage.cleanupToken so the DB session can be cleared
   * even when sessionStorage has already been wiped (browser-close scenario).
   * Broadcasts to sibling tabs so they all stay in sync.
   */
  setToken(token: string): void {
    sessionStorage.setItem(this.TOKEN_KEY, token);
    sessionStorage.removeItem(this.SESSION_TERMINATED_KEY);
    localStorage.setItem(this.CLEANUP_TOKEN_KEY, token);
    // Notify sibling tabs so they adopt the new token without a full re-login
    this.channel.postMessage({ type: 'token-update', token });
  }

  /**
   * Retrieve JWT from sessionStorage.
   * Returns null if no token exists or if this tab's session has been terminated.
   */
  getToken(): string | null {
    if (sessionStorage.getItem(this.SESSION_TERMINATED_KEY) === '1') return null;
    return sessionStorage.getItem(this.TOKEN_KEY);
  }

  /** True if a JWT is stored and this tab's session is active. */
  hasToken(): boolean {
    return !!this.getToken();
  }

  /**
   * Remove the stored JWT and clear all auth state for this tab and all sibling tabs.
   * Deliberately does NOT clear the cached pathology policy settings (grace buffer,
   * max discount, session lockout) — that cache is keyed to the browser/pathology,
   * not the login session, and is kept fresh by PathologyService whenever the
   * corresponding value is updated (see updateGraceBuffer/updateMaxDiscount/
   * updateSessionLockout). Clearing it here would force a DB round-trip on every
   * login even when nothing changed.
   */
  removeToken(): void {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.SESSION_TERMINATED_KEY);
    localStorage.removeItem(this.CLEANUP_TOKEN_KEY);
    // Signal all sibling tabs to log out immediately
    this.channel.postMessage({ type: 'logout' });
  }

  /** Alias for removeToken. */
  clearAuth(): void {
    this.removeToken();
  }

  /**
   * Returns the cleanup token from localStorage.
   * Used by LoginService.logout() as a fallback when sessionStorage is already gone.
   */
  getCleanupToken(): string | null {
    return localStorage.getItem(this.CLEANUP_TOKEN_KEY);
  }

  /**
   * Marks THIS TAB's session as terminated (SESSION_TERMINATED 401 from the API).
   *
   * Removes the auth token from sessionStorage immediately so that:
   *  a) sibling tabs receiving a `request-token` broadcast won't see this tab's
   *     token and hand it back (which would cause a flicker loop), and
   *  b) any in-flight token refresh initiated by the auth interceptor reads a
   *     null token and fails fast, driving a clean redirect to /login.
   *
   * The token is still in localStorage.cleanupToken for the DB-cleanup call
   * that LoginComponent.runStartupCleanup() will make on the next load.
   */
  markSessionTerminated(): void {
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.setItem(this.SESSION_TERMINATED_KEY, '1');
    // Immediately disinfect every sibling tab in this browser.
    // Without this, Tab 2 might still have its token when Tab 1's login page
    // broadcasts `request-token` and Tab 2 would hand the stale token back,
    // causing a /pathology ↔ /login flicker loop until Tab 2's own next API call
    // finally 401s and removes its token.
    this.channel.postMessage({ type: 'session-terminated' });
  }

  // ── Cross-tab communication ────────────────────────────────────────────────

  /**
   * Ask any open sibling tab for the current auth token.
   * LoginComponent calls this; it listens on tokenReceived$ for the answer.
   */
  requestTokenFromSiblingTab(): void {
    this.channel.postMessage({ type: 'request-token' });
  }

  private handleBroadcast(data: { type: string; token?: string }): void {
    switch (data.type) {
      case 'token-update':
        // Sibling logged in or refreshed its token — adopt into this tab,
        // BUT only if this tab's session has NOT been terminated.
        // A terminated tab must not be revived by a sibling's refresh broadcast;
        // doing so would let the user briefly navigate to a protected page before
        // the next API call returns 401 and kicks them back to /login (flicker).
        if (data.token && sessionStorage.getItem(this.SESSION_TERMINATED_KEY) !== '1') {
          sessionStorage.setItem(this.TOKEN_KEY, data.token);
          sessionStorage.removeItem(this.SESSION_TERMINATED_KEY);
          localStorage.setItem(this.CLEANUP_TOKEN_KEY, data.token);
        }
        break;

      case 'logout':
        // Sibling logged out — clear this tab too (redirect is handled separately)
        sessionStorage.removeItem(this.TOKEN_KEY);
        sessionStorage.removeItem(this.SESSION_TERMINATED_KEY);
        break;

      case 'session-terminated':
        // A sibling tab was kicked by another browser.  Disinfect this tab
        // immediately — remove token and mark terminated — then emit sessionKicked$
        // so AppComponent can redirect to /login without waiting for this tab's
        // own SignalR sessionCheck event (which may arrive with a small delay).
        sessionStorage.removeItem(this.TOKEN_KEY);
        sessionStorage.setItem(this.SESSION_TERMINATED_KEY, '1');
        this.sessionKicked$.next();
        break;

      case 'request-token': {
        // New sibling tab asking for our token — respond if we have one
        const myToken = sessionStorage.getItem(this.TOKEN_KEY);
        if (myToken && sessionStorage.getItem(this.SESSION_TERMINATED_KEY) !== '1') {
          this.channel.postMessage({ type: 'token-response', token: myToken });
        }
        break;
      }

      case 'token-response':
        // We asked for a token and got one — store it silently and notify LoginComponent
        if (data.token) {
          sessionStorage.setItem(this.TOKEN_KEY, data.token);
          sessionStorage.removeItem(this.SESSION_TERMINATED_KEY);
          localStorage.setItem(this.CLEANUP_TOKEN_KEY, data.token);
          this.tokenReceived$.next(data.token);
        }
        break;
    }
  }

  // ── Token decoding ─────────────────────────────────────────────────────────

  decodeToken(token?: string): JwtPayload | null {
    try {
      const raw = token ?? this.getToken();
      if (!raw) return null;
      return jwtDecode<JwtPayload>(raw);
    } catch (error) {
      console.warn('TokenService: failed to decode JWT', error);
      return null;
    }
  }

  // ── Identity helpers ───────────────────────────────────────────────────────

  getUserId(): string | null { return this.decodeToken()?.sub ?? null; }
  getEmail():  string | null { return this.decodeToken()?.email ?? null; }

  // ── Role helpers ───────────────────────────────────────────────────────────

  getUserRole(): RoleId | null {
    const payload = this.decodeToken();
    if (!payload?.role) return null;

    const numeric = parseInt(payload.role, 10);
    if (!isNaN(numeric)) return numeric as RoleId;

    const entry = Role[payload.role as keyof typeof Role];
    if (entry !== undefined) return entry.id;

    const byLabel = ROLE_LABEL_TO_ID[payload.role];
    return byLabel !== undefined ? byLabel : null;
  }

  hasRole(...roles: RoleId[]): boolean {
    const current = this.getUserRole();
    return current !== null && roles.includes(current);
  }

  /** True for Admin OR Super Admin — i.e. "can see the Admin Panel". */
  isAdmin(): boolean { return this.hasRole(Role.Admin.id, Role.Super_Admin.id); }

  /**
   * True only for Super Admin. Use this — not isAdmin() — to gate owner-level
   * surfaces: lab profile writes, payroll, licence and role assignment.
   */
  isSuperAdmin(): boolean { return this.hasRole(Role.Super_Admin.id); }

  // ── Token lifecycle ────────────────────────────────────────────────────────

  isTokenExpired(): boolean {
    const decoded = this.decodeToken();
    if (!decoded?.exp) return true;
    return Date.now() >= decoded.exp * 1000;
  }

  getTokenExpirationTime(): number {
    const decoded = this.decodeToken();
    if (!decoded?.exp) return -1;
    const remaining = decoded.exp * 1000 - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  // ── Grace buffer ───────────────────────────────────────────────────────────

  private readonly GRACE_BUFFER_KEY         = 'diagnocare_grace_buffer_minutes';
  private readonly MAX_DISCOUNT_KEY         = 'diagnocare_max_discount_percent';
  private readonly SESSION_LOCKOUT_KEY      = 'diagnocare_session_lockout_minutes';

  /**
   * Persist the pathology-configured grace buffer (in minutes) to localStorage.
   * Called by the lab-setup component when the admin saves the setting, and also
   * by AppComponent on init when it fetches pathology info.
   */
  setGraceBufferMinutes(minutes: number): void {
    localStorage.setItem(this.GRACE_BUFFER_KEY, String(minutes));
  }

  /**
   * Retrieve the grace buffer duration (in minutes).
   * Returns 0 if not configured (disables grace-period PIN auth).
   */
  getGraceBufferMinutes(): number {
    const raw = localStorage.getItem(this.GRACE_BUFFER_KEY);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  }

  /**
   * Returns true when the stored JWT is expired BUT the expiry happened within
   * the pathology-configured grace buffer window.
   *
   * Formula:
   *   milliseconds_since_expiry = now - (exp * 1000)
   *   within_grace = milliseconds_since_expiry <= graceBufferMinutes * 60 * 1000
   *
   * Returns false when:
   *   • No token is stored
   *   • Grace buffer is 0 (disabled)
   *   • Token expired longer ago than the grace window
   */
  // ── Max discount ───────────────────────────────────────────────────────────

  /** Persist the admin-configured maximum discount percentage. */
  setMaxDiscountPercent(percent: number): void {
    localStorage.setItem(this.MAX_DISCOUNT_KEY, String(percent));
  }

  /**
   * Returns the maximum discount percentage allowed (0–99).
   * Default 50 if not yet configured.
   */
  getMaxDiscountPercent(): number {
    const raw = localStorage.getItem(this.MAX_DISCOUNT_KEY);
    if (!raw) return 50;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed < 0 ? 50 : Math.min(parsed, 99);
  }

  // ── Session lockout ────────────────────────────────────────────────────────

  /** Persist the admin-configured session lockout threshold (minutes). */
  setSessionLockoutMinutes(minutes: number): void {
    localStorage.setItem(this.SESSION_LOCKOUT_KEY, String(minutes));
  }

  /**
   * Returns the session lockout threshold in minutes.
   * 0 means screen lock is disabled. Default 30.
   */
  getSessionLockoutMinutes(): number {
    const raw = localStorage.getItem(this.SESSION_LOCKOUT_KEY);
    if (!raw) return 30;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) || parsed < 0 ? 30 : parsed;
  }

  /**
   * True when pathology policy settings (grace buffer, max discount, session
   * lockout) are already cached in localStorage from a previous load.
   * AppComponent uses this to skip the DB round-trip on repeat page loads.
   */
  hasCachedPolicies(): boolean {
    return localStorage.getItem(this.GRACE_BUFFER_KEY) !== null;
  }

  /** Clear cached pathology policy settings (called on logout). */
  clearCachedPolicies(): void {
    localStorage.removeItem(this.GRACE_BUFFER_KEY);
    localStorage.removeItem(this.MAX_DISCOUNT_KEY);
    localStorage.removeItem(this.SESSION_LOCKOUT_KEY);
  }

  isWithinGracePeriod(): boolean {
    const graceMs = this.getGraceBufferMinutes() * 60 * 1000;
    if (graceMs <= 0) return false;

    const decoded = this.decodeToken();
    if (!decoded?.exp) return false;

    const expiredAgoMs = Date.now() - decoded.exp * 1000;
    return expiredAgoMs > 0 && expiredAgoMs <= graceMs;
  }
}
