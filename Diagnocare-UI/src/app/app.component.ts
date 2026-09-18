import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { filter, Subscription } from 'rxjs';

import { ConfirmModalComponent } from './shared/confirm-modal/confirm-modal.component';
import { PinModalComponent }    from './shared/pin-modal/pin-modal.component';
import { TokenService }         from './core/interceptors/token.service';
import { LoginService }         from './services/loginServices/login.service';
import { SessionLockService }   from './core/services/session-lock.service';
import { ThemeService }         from './services/themeServices/theme.service';
import { PathologyService }     from './services/pathologyServices/pathology.service';
import { NavigationHistoryService } from './core/services/navigation-history.service';

/**
 * Session model
 * ─────────────
 *
 * 1.  SAME-BROWSER MULTI-TAB — no conflict
 *     All tabs in the same browser share localStorage.browserId.  The backend
 *     stores browserId as ActiveSessionId; conflict is only raised when the
 *     incoming browserId differs from the stored one.  A new tab that has no
 *     sessionStorage token requests one from a sibling via BroadcastChannel
 *     (diagnocare-auth / request-token) so the user never sees the login page.
 *
 * 2.  DIFFERENT BROWSER / INCOGNITO — conflict dialog
 *     Each browser profile has its own localStorage → different browserId →
 *     backend raises the conflict dialog.  User can force-login to displace the
 *     other session.
 *
 * 3.  ALL TABS CLOSED — DB session cleared on next open
 *     When the last tab fires beforeunload, TokenService sets
 *     localStorage.pendingCleanup.  The next page open (new tab or reopened
 *     browser) detects this in LoginComponent and calls logout() to clear
 *     ActiveSessionId before the form is enabled.
 *     localStorage.cleanupToken provides a fallback token for that call
 *     (sessionStorage is already empty at that point).
 *
 * 4.  EXPLICIT LOGOUT — all tabs logged out immediately
 *     removeToken() broadcasts a "logout" message via BroadcastChannel so every
 *     open sibling tab clears its sessionStorage token instantly.
 *
 * 5.  CROSS-BROWSER KICK-OUT (server-side token check + poll — this file)
 *     The backend stamps each JWT with the session id it was minted for ("sid") and
 *     compares it against the user's current ActiveSessionId on every authenticated
 *     request.  A displaced browser therefore gets SESSION_TERMINATED 401 → redirect
 *     to /login with reason=session_terminated on its next API call, and the poll
 *     below bounds how long an idle displaced tab can sit there unaware.
 *
 *     This used to be pushed instantly over a SignalR WebSocket (/hubs/session).
 *     That was removed: the hub had no backplane, so on a scaled-out deployment the
 *     broadcast only reached one instance's connections, and where WebSockets were
 *     blocked it degraded to long polling and hammered the API.
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  styleUrls: ['./app.component.css'],
  imports: [RouterModule, HttpClientModule, ConfirmModalComponent, PinModalComponent, CommonModule],
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'diagnocare';

  private sessionPollTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * How often an authenticated tab pings the API to notice it has been displaced by
   * a login from another browser.  Any real API call detects this too — the poll only
   * covers a tab sitting idle, so it bounds worst-case detection rather than driving it.
   */
  private static readonly POLL_INTERVAL_MS = 300_000;   // 5 minutes
  private sessionKickedSub: Subscription | null = null;

  constructor(
    private tokenService:    TokenService,
    private loginService:    LoginService,
    private router:          Router,
    private sessionLock:     SessionLockService,
    private themeService:    ThemeService,
    private pathologyService:PathologyService,
    // Injected so it is created at bootstrap and starts recording navigation
    // history immediately (used by Help to return to its entry page).
    private navigationHistory: NavigationHistoryService,
  ) {}

  ngOnInit(): void {
    // Register this tab, detect refresh vs new open, and check for pendingCleanup.
    // Must run before any auth guard fires so BroadcastChannel is ready to answer
    // request-token messages from sibling tabs.
    this.tokenService.initTabTracking();

    // Apply the saved theme for this user as early as possible to avoid flash.
    const username = this.tokenService.getUserId();
    if (username) {
      this.themeService.loadForUser(username);
    }

    // When a sibling tab is kicked out by another browser, it broadcasts
    // 'session-terminated' so THIS tab gets disinfected immediately — before this
    // tab makes its own API call and discovers the 401 independently.  Without this,
    // there is a window where a sibling tab still has its token and responds to
    // 'request-token', sending the stale token back and causing a
    // /pathology ↔ /login flicker.
    this.sessionKickedSub = this.tokenService.sessionKicked$.subscribe(() => {
      this.stopSessionServices();
      if (!this.router.url.includes('/login')) {
        this.router.navigate(['/login'], { queryParams: { reason: 'session_terminated' } });
      }
    });

    // Start/stop SignalR + poll based on route.
    // Also re-applies the user's saved theme on every post-login navigation so
    // the theme is correct even when Angular navigates without a full page reload
    // (e.g. SPA redirect after OTP verification).
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: NavigationEnd) => {
        if (e.urlAfterRedirects.includes('/login')) {
          this.stopSessionServices();
        } else if (this.tokenService.hasToken()) {
          this.startSessionServices();
          const username = this.tokenService.getUserId();
          if (username) {
            this.themeService.loadForUser(username);
          }
        }
      });

    // Kick off immediately if already on an authenticated route (page refresh).
    if (this.tokenService.hasToken()) {
      this.startSessionServices();
      // Fetch and cache grace buffer minutes so the interceptor can use them
      // on the next request without waiting for the lab-setup page to be opened.
      // Only hit the DB on the first load after login — once cached in
      // localStorage, subsequent page loads read from there instead. The
      // cache is cleared on logout (see TokenService.removeToken) so a new
      // login always gets fresh values.
      if (!this.tokenService.hasCachedPolicies()) {
        this.fetchAndCachePathologyDetails();
      }
    }
  }

  /**
   * Fetches pathology policy settings from the DB and caches them in
   * TokenService (localStorage) so later page loads can read the cache
   * instead of calling the API again. Errors are silently ignored —
   * sensible defaults apply:
   *   graceBufferMinutes   → 0   (grace disabled)
   *   maxDiscountPercent   → 50
   *   sessionLockoutMinutes→ 30 minutes
   */
  private fetchAndCachePathologyDetails(): void {
    this.pathologyService.getPathology().subscribe({
      next: (data) => {
        if (data?.graceBufferMinutes !== undefined) {
          this.tokenService.setGraceBufferMinutes(data.graceBufferMinutes);
        }
        if (data?.maxDiscountPercent !== undefined) {
          this.tokenService.setMaxDiscountPercent(data.maxDiscountPercent);
        }
        if (data?.sessionLockoutMinutes !== undefined) {
          this.tokenService.setSessionLockoutMinutes(data.sessionLockoutMinutes);
        }
      },
      error: () => { /* silently ignore — defaults apply */ },
    });
  }

  ngOnDestroy(): void {
    this.stopSessionServices();
    this.sessionKickedSub?.unsubscribe();
  }

  // ── Session services (idle lock + session poll) ────────────────────────────

  private startSessionServices(): void {
    this.sessionLock.start();
    this.startSessionPoll();
  }

  private stopSessionServices(): void {
    this.sessionLock.stop();
    this.stopSessionPoll();
  }

  // ── Session poll ───────────────────────────────────────────────────────────

  private startSessionPoll(): void {
    if (this.sessionPollTimer !== null) return;
    this.sessionPollTimer = setInterval(() => {
      if (!this.tokenService.hasToken()) {
        this.stopSessionPoll();
        return;
      }
      // Fire-and-forget: the auth interceptor handles SESSION_TERMINATED 401s.
      this.loginService.ping().subscribe({ error: () => {} });
    }, AppComponent.POLL_INTERVAL_MS);
  }

  private stopSessionPoll(): void {
    if (this.sessionPollTimer !== null) {
      clearInterval(this.sessionPollTimer);
      this.sessionPollTimer = null;
    }
  }
}
