import { Component, OnInit, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { filter, Subscription } from 'rxjs';

import { ConfirmModalComponent } from './shared/confirm-modal/confirm-modal.component';
import { PinModalComponent }    from './shared/pin-modal/pin-modal.component';
import { TokenService }         from './core/interceptors/token.service';
import { LoginService }         from './services/loginServices/login.service';
import { SessionSignalRService } from './services/sessionSignalR/session-signalr.service';
import { SessionLockService }   from './core/services/session-lock.service';
import { ThemeService }         from './services/themeServices/theme.service';
import { PathologyService }     from './services/pathologyServices/pathology.service';

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
 * 5.  CROSS-BROWSER KICK-OUT (SignalR + fallback poll — this file)
 *     SessionSignalRService holds a WebSocket to /hubs/session.  The backend
 *     pushes "sessionCheck" on new login → displaced browser gets SESSION_TERMINATED
 *     401 → redirect to /login with reason=session_terminated.
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
  private static readonly POLL_INTERVAL_MS = 300_000;
  private sessionKickedSub: Subscription | null = null;

  constructor(
    private tokenService:    TokenService,
    private loginService:    LoginService,
    private router:          Router,
    private sessionSignalR:  SessionSignalRService,
    private sessionLock:     SessionLockService,
    private themeService:    ThemeService,
    private pathologyService:PathologyService,
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
    // 'session-terminated' so THIS tab gets disinfected immediately — before
    // its own SignalR sessionCheck arrives.  Without this, there is a window
    // where a sibling tab still has its token and responds to 'request-token',
    // sending the stale token back and causing a /pathology ↔ /login flicker.
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
      this.fetchAndCacheGraceBuffer();
    }
  }

  /**
   * Fetches pathology policy settings and caches them in TokenService so
   * they are available without waiting for the lab-setup page to open.
   * Errors are silently ignored — sensible defaults apply:
   *   graceBufferMinutes   → 0   (grace disabled)
   *   maxDiscountPercent   → 50
   *   sessionLockoutMinutes→ 30 minutes
   */
  private fetchAndCacheGraceBuffer(): void {
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

  // ── Session services (SignalR + fallback poll) ─────────────────────────────

  private startSessionServices(): void {
    this.sessionSignalR.start();
    this.sessionLock.start();
    this.startSessionPoll();
  }

  private stopSessionServices(): void {
    this.sessionSignalR.stop();
    this.sessionLock.stop();
    this.stopSessionPoll();
  }

  // ── Fallback poll ──────────────────────────────────────────────────────────

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
