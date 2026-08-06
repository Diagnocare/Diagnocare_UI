import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { environment } from 'src/environments/environment';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { NavigationHistoryService } from 'src/app/core/services/navigation-history.service';
import { FeedbackService } from 'src/app/services/feedbackServices/feedback.service';

/** Which portal screen to open. */
export type PortalView = 'new' | 'track';

/**
 * Public Help / Contact Us page.
 *
 * Reachable by everyone (no auth or role guard — see the `/help` route in
 * app-routing.module.ts), so both logged-in staff and logged-out visitors can
 * find support details and raise an issue on the project board.
 *
 * NOTE: the contact values below are PLACEHOLDERS. Replace them with the real
 * lab / support details before going live.
 */
@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.css'],
})
export class HelpComponent {

  currentYear = new Date().getFullYear();

  constructor(
    private tokenService: TokenService,
    private feedbackService: FeedbackService,
    private navHistory: NavigationHistoryService,
    private router: Router,
    private location: Location,
  ) {}

  /**
   * Where the on-page "Back" button should return to — the page the user came
   * from, since Help is reachable two ways:
   *   • from the public home page  → back to /home
   *   • from the in-app profile menu → back to that in-app page
   *
   * Falls back to /home when there is no usable in-app history (e.g. the user
   * opened /help directly via a bookmark).
   */
  goBack(): void {
    const prev = this.navHistory.previousUrl;
    if (prev && !prev.startsWith('/help')) {
      this.router.navigateByUrl(prev);
      return;
    }
    // No recorded previous route within the app.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      this.location.back();
      return;
    }
    this.router.navigate(['/home']);
  }

  /** Label for the back button — generic since the destination varies by entry. */
  get backLabel(): string {
    const prev = this.navHistory.previousUrl;
    return prev && !prev.startsWith('/help') && !prev.startsWith('/home') ? 'Back' : 'Back to Home';
  }

  // ── Opening the feedback portal ──────────────────────────────────────────

  /** True while a token request is in flight, so the buttons can show progress. */
  opening: PortalView | null = null;

  /** Submit a new issue / suggestion. */
  openSubmit(): void {
    this.openPortal('new');
  }

  /**
   * Open the user's own case list.
   *
   * Previously this pointed at the bare portal URL, so the tracking ID handed out
   * at submit time was the only way back to a report. The token now identifies
   * the user and lab, so the portal can list every issue they've raised.
   *
   * Open / Closed filtering deliberately lives in the PORTAL, not here — this page
   * only says who is asking; the portal owns how the list is presented.
   */
  openTrack(): void {
    this.openPortal('track');
  }

  /**
   * Opens the portal in a new tab, with a freshly-minted feedback token.
   *
   * The blank tab is opened SYNCHRONOUSLY, inside the click handler, and only
   * pointed at the portal once the token arrives — open it after the HTTP call
   * instead and every popup blocker will swallow it.
   *
   * `/help` is a PUBLIC route (no auth guard), so a logged-out visitor has no
   * session and gets no token. Same if the token call fails, or if the lab isn't
   * registered yet (404). None of those are worth blocking on: we fall through to
   * the context-free URL and let the portal ask for a tracking ID.
   */
  private openPortal(view: PortalView): void {
    // No 'noopener' feature here — passing it makes window.open return null, and we
    // need the handle to point the tab at the URL once the token arrives. The opener
    // reference is severed manually below, which achieves the same thing.
    const tab = window.open('', '_blank');

    const go = (url: string) => {
      this.opening = null;
      if (!tab) {
        window.location.href = url;   // popup blocked — navigate in place
        return;
      }
      tab.opener = null;              // portal must not be able to reach back into this window
      tab.location.href = url;
    };

    if (!this.tokenService.hasToken() || this.tokenService.isTokenExpired()) {
      go(this.buildHelpUrl(view));
      return;
    }

    this.opening = view;
    this.feedbackService.getToken().subscribe({
      next: res => go(this.buildHelpUrl(view, res.token)),
      error: err => {
        console.warn('Help: could not obtain a feedback token — opening portal without one.', err);
        go(this.buildHelpUrl(view));
      },
    });
  }

  /**
   * Builds the portal launch URL.
   *
   *   ?view=…&product=…&env=…      non-sensitive routing context, query string
   *   #token=…                     signed identity claims, URL FRAGMENT
   *
   * The token goes in the fragment on purpose: fragments are never sent to the
   * server, so the token stays out of the portal's access logs and out of any
   * `Referer` header the portal emits onward. Identity now travels inside the
   * signed token, so no userId / userName / email / role / pathId params are
   * needed — the portal reads them from the verified payload instead of trusting
   * values a user could edit in the address bar.
   *
   * See docs/FEEDBACK_PORTAL_CONTRACT.md for the full contract.
   */
  private buildHelpUrl(view: PortalView, token?: string): string {
    const base = environment.helpUrl;
    const params = new URLSearchParams();

    // ── Which screen to open ──────────────────────────────────────────────
    params.set('view', view);

    // ── Product context (always present, not sensitive) ────────────────────
    params.set('product', environment.appName);
    params.set('env', environment.envName);

    const separator = base.includes('?') ? '&' : '?';
    const url = `${base}${separator}${params.toString()}`;

    return token ? `${url}#token=${encodeURIComponent(token)}` : url;
  }

  /**
   * Contact details shown on the page.
   * ⚠️ PLACEHOLDERS — update these with your real support contact details.
   */
  readonly contact = {
    email:   'support@diagnocare.com',
    phone:   '+91 XXXXX XXXXX',
    altPhone:'+91 XXXXX XXXXX',
    address: 'Diagnocare, [Street Address], [City], [State] – [PIN]',
    hours:   'Monday – Saturday, 9:00 AM – 7:00 PM (IST)',
  };
}
