import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { catchError, finalize, switchMap, take } from 'rxjs/operators';

import { TokenService }    from '../interceptors/token.service';
import { PinService }      from '../../services/pinServices/pin.service';
import { PinModalService } from '../../shared/pin-modal/pin-modal.service';
import { LoginService }    from '../../services/loginServices/login.service';

/**
 * SessionLockService
 * ──────────────────
 * Detects when the OS locks the screen (or the browser tab is hidden for long
 * enough) and prompts for the user's PIN when the page becomes visible again.
 *
 * How detection works
 * ───────────────────
 * Browsers fire the `visibilitychange` event when:
 *   • The OS locks the screen or puts the machine to sleep   ← what we want
 *   • The user minimises the browser window
 *   • The user switches to another tab
 *
 * Two distinct triggers
 * ──────────────────────
 *   1. Genuine OS screen lock — detected via the Idle Detection API
 *      (`IdleDetector.screenState === 'locked'`). This prompts for the PIN
 *      IMMEDIATELY on return, ignoring the tab-switch timeout, because a locked
 *      screen is an unambiguous "step away" signal.
 *   2. Tab-switch / window minimise — detected via `visibilitychange`. To avoid
 *      PIN prompts on normal tab-switches, this only triggers when the page was
 *      hidden for at least the admin-configured "Screen Lock Timeout"
 *      (TokenService.getSessionLockoutMinutes()). Set it to 0 in
 *      Lab Setup → Policies to disable the tab-switch lock.
 *
 * The Idle Detection API needs a one-time permission grant (Chrome/Edge only).
 * When it is unsupported or denied, the service degrades gracefully to the
 * visibility-timeout behaviour for all cases.
 *
 * PIN gate behaviour
 * ──────────────────
 * On unlock (page becomes visible after the threshold):
 *   • PIN set     → show PIN modal.
 *                   Correct PIN: session continues (token refreshed if expired).
 *                   Wrong × 3 / cancel / timeout: forced logout.
 *   • No PIN set  → show "Set Up a PIN" modal.
 *                   "Go to Settings": navigate to /settings.
 *                   "Log Out": forced logout.
 *
 * Token refresh
 * ─────────────
 * If the JWT expired while the screen was locked, the service refreshes it
 * after a correct PIN so the next HTTP request does not immediately re-open
 * the PIN modal.  If the refresh itself fails (server-side session revoked),
 * the user is redirected to /login.
 *
 * Integration
 * ───────────
 * Call start() from AppComponent when a session is active, stop() on logout.
 */
@Injectable({ providedIn: 'root' })
export class SessionLockService implements OnDestroy {

  private hiddenAt: number | null = null;
  private boundHandler!: () => void;
  private isRunning = false;

  // ── Screen-lock (Idle Detection API) state ─────────────────────────────────
  /** Set true when the OS screen locks; drives an immediate PIN prompt on return. */
  private screenWasLocked = false;
  private idleDetector: any = null;
  private idleAbort: AbortController | null = null;
  private gestureHandler: (() => void) | null = null;
  /** Re-entry guard so visibility + idle events cannot open two PIN modals. */
  private pinPromptActive = false;

  constructor(
    private tokenService:    TokenService,
    private pinService:      PinService,
    private pinModalService: PinModalService,
    private loginService:    LoginService,
    private router:          Router,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Start listening.  Call whenever a user session becomes active. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning    = true;
    this.boundHandler = () => this.onVisibilityChange();
    document.addEventListener('visibilitychange', this.boundHandler);
    this.initIdleDetection();
  }

  /** Stop listening.  Call on logout or when navigating to /login. */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    document.removeEventListener('visibilitychange', this.boundHandler);
    this.hiddenAt = null;
    this.teardownIdleDetection();
  }

  ngOnDestroy(): void {
    this.stop();
  }

  // ── Core logic ─────────────────────────────────────────────────────────────

  private onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      // Record when the page was hidden.
      this.hiddenAt = Date.now();
      return;
    }

    if (document.visibilityState !== 'visible') return;

    const hiddenAt = this.hiddenAt;
    this.hiddenAt  = null;

    // ── Case 1: genuine screen lock → prompt immediately ──────────────────────
    // A real OS screen lock (flagged by the Idle Detection API) bypasses the
    // tab-switch timeout entirely.
    if (this.screenWasLocked) {
      this.screenWasLocked = false;
      if (this.tokenService.hasToken()) this.triggerPinVerification();
      return;
    }

    if (hiddenAt === null) return;

    // ── Case 2: tab-switch / minimise → apply the Screen Lock Timeout ─────────
    const thresholdMinutes = this.tokenService.getSessionLockoutMinutes();
    if (thresholdMinutes <= 0) return;  // tab-switch lock disabled
    const thresholdMs = thresholdMinutes * 60_000;

    // Ignore brief tab-switches; only trigger past the configured timeout.
    if (Date.now() - hiddenAt < thresholdMs) return;

    // No active session → nothing to protect.
    if (!this.tokenService.hasToken()) return;

    this.triggerPinVerification();
  }

  private triggerPinVerification(): void {
    // Guard against a second prompt (e.g. visibilitychange + idle 'change'
    // firing back-to-back on unlock).
    if (this.pinPromptActive) return;
    this.pinPromptActive = true;
    const releasePrompt = () => { this.pinPromptActive = false; };

    const userId = this.tokenService.getUserId();

    if (this.pinService.hasPin(userId)) {
      // ── PIN already configured ──────────────────────────────────────────
      this.pinModalService.requestPin().pipe(
        take(1),
        finalize(releasePrompt),
        switchMap(verified => {
          if (!verified) {
            // Wrong PIN / cancel / timeout → force logout.
            this.loginService.logout().subscribe();
            this.router.navigate(['/login'], { queryParams: { reason: 'pin_failed' } });
            return EMPTY;
          }

          // PIN correct.  If the JWT expired while the screen was locked,
          // refresh it now so the next HTTP request does not immediately
          // re-prompt for PIN.
          if (this.tokenService.isTokenExpired()) {
            return this.loginService.refreshToken().pipe(
              catchError(() => {
                // Server-side session revoked — redirect to login.
                this.tokenService.clearAuth();
                this.router.navigate(['/login']);
                return EMPTY;
              }),
            );
          }

          return EMPTY;   // Token still valid — nothing more to do.
        }),
      ).subscribe();

    } else {
      // ── No PIN configured yet ───────────────────────────────────────────
      this.pinModalService.requestPinSetup().pipe(take(1), finalize(releasePrompt)).subscribe(goToSettings => {
        if (goToSettings) {
          this.router.navigate(['/settings']);
        } else {
          this.loginService.logout().subscribe();
          this.router.navigate(['/login'], { queryParams: { reason: 'no_pin' } });
        }
      });
    }
  }

  // ── Idle Detection (OS screen-lock) ──────────────────────────────────────────

  /**
   * Best-effort start of the Idle Detection API so a genuine OS screen lock can
   * be told apart from an ordinary tab-switch. Degrades silently when the API is
   * unsupported or permission is denied (visibility-timeout still applies).
   */
  private initIdleDetection(): void {
    const w = window as any;
    if (typeof w.IdleDetector === 'undefined') {
      // The Idle Detection API is only exposed in a SECURE CONTEXT (HTTPS or
      // localhost). On an HTTP-served site window.IdleDetector is undefined, so
      // the immediate OS-screen-lock prompt cannot arm — only the
      // visibility-timeout fallback (Screen Lock Timeout) applies. This is the
      // usual reason the lock "works on localhost but not on the HTTP server".
      if (!window.isSecureContext) {
        console.warn('[SessionLock] Idle Detection unavailable: page is not a secure context. ' +
          'Serve the app over HTTPS to enable the immediate screen-lock PIN prompt.');
      } else {
        console.warn('[SessionLock] Idle Detection API not supported by this browser; ' +
          'using the visibility-timeout fallback only.');
      }
      return;  // unsupported / insecure → visibility-only
    }

    const query = navigator.permissions?.query?.({ name: 'idle-detection' as any });
    if (!query) { this.requestIdlePermissionOnGesture(); return; }

    query
      .then(status => {
        if (status.state === 'granted')     this.startIdleDetector();
        else if (status.state === 'prompt') this.requestIdlePermissionOnGesture();
        // 'denied' → visibility-only fallback
      })
      .catch(() => this.requestIdlePermissionOnGesture());
  }

  /**
   * The idle-detection permission can only be requested from a user gesture, so
   * defer the request to the first pointer/key interaction after login.
   */
  private requestIdlePermissionOnGesture(): void {
    const w = window as any;
    if (typeof w.IdleDetector?.requestPermission !== 'function') return;

    this.gestureHandler = () => {
      w.IdleDetector.requestPermission()
        .then((perm: string) => { if (perm === 'granted') this.startIdleDetector(); })
        .catch(() => { /* denied / error → visibility-only fallback */ })
        .finally(() => this.removeGestureHandler());
    };
    document.addEventListener('pointerdown', this.gestureHandler, { once: true });
    document.addEventListener('keydown',     this.gestureHandler, { once: true });
  }

  private removeGestureHandler(): void {
    if (!this.gestureHandler) return;
    document.removeEventListener('pointerdown', this.gestureHandler);
    document.removeEventListener('keydown',     this.gestureHandler);
    this.gestureHandler = null;
  }

  private async startIdleDetector(): Promise<void> {
    if (this.idleDetector) return;
    const w = window as any;
    try {
      this.idleAbort = new AbortController();
      const detector = new w.IdleDetector();
      detector.addEventListener('change', () => this.onIdleChange(detector));
      // 60s is the API minimum for the user-idle threshold; screenState changes
      // (lock/unlock) are reported independently of it.
      await detector.start({ threshold: 60_000, signal: this.idleAbort.signal });
      this.idleDetector = detector;
    } catch {
      // Permission revoked or start failed — fall back to visibility-only.
      this.idleAbort   = null;
      this.idleDetector = null;
    }
  }

  private onIdleChange(detector: any): void {
    if (detector.screenState === 'locked') {
      // Flag the lock; the PIN prompt fires when the page becomes visible again.
      this.screenWasLocked = true;
    } else if (this.screenWasLocked && document.visibilityState === 'visible') {
      // Backup path for environments that unlock without a visibilitychange.
      this.screenWasLocked = false;
      if (this.tokenService.hasToken()) this.triggerPinVerification();
    }
  }

  private teardownIdleDetection(): void {
    this.removeGestureHandler();
    if (this.idleAbort) {
      try { this.idleAbort.abort(); } catch { /* no-op */ }
      this.idleAbort = null;
    }
    this.idleDetector    = null;
    this.screenWasLocked = false;
    this.pinPromptActive = false;
  }
}
