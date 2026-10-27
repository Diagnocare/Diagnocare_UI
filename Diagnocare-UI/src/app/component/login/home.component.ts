import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { PathologyProfileCacheService } from 'src/app/services/pathologyServices/pathology-profile-cache.service';
import { PathologyRegistrationCacheService } from 'src/app/services/pathologyServices/pathology-registration-cache.service';
import { TokenService }     from 'src/app/core/interceptors/token.service';

/** How many days before expiry the "Extend Licence" button appears */
const EXTEND_WINDOW_DAYS = 15;

export type HomeNavState =
  | 'unregistered'  // no pathology in DB → show Register
  | 'extend'        // registered, expiry ≤ 15 days → show Extend
  | 'registered';   // registered, expiry > 15 days → no CTA needed

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {

  currentYear = new Date().getFullYear();

  /**
   * Optimistic default: the navbar renders the Login link on the very first frame
   * instead of withholding every CTA until GetPublicInfo answers. An install that
   * turns out to be unregistered sees the link swap to "Register Pathology" once the
   * response lands — strictly better than a navbar that shows only *Help* for a
   * second or more and looks finished-but-broken. ngOnInit overrides this with the
   * last known state when one is cached.
   */
  navState: HomeNavState = 'registered';
  daysLeft = 0;
  expiryDisplay = '';

  // ── Licence refresh (pull latest from the shared API) ──────────────────────

  /** True while a forced refresh is in flight — disables the button. */
  refreshing = false;
  /** Feedback shown after a refresh attempt; cleared automatically. */
  refreshMessage = '';
  /** 'ok' | 'warn' — drives the styling of refreshMessage. */
  refreshMessageKind: 'ok' | 'warn' = 'ok';
  /** Forced refreshes left in the current hour (server-reported, max 5). */
  refreshesRemaining: number | null = null;

  private refreshMessageTimer: any = null;

  constructor(
    private _pathologyService: PathologyService,
    private _profileCache: PathologyProfileCacheService,
    private _registrationCache: PathologyRegistrationCacheService,
    private _tokenService: TokenService,
  ) {}

  ngOnInit(): void {
    // Paint from the last known registration state first, so nothing in the navbar
    // waits on the network. Then revalidate: registration and licence expiry do change
    // over time, so the server always gets the final say — it just no longer gates the
    // first frame. Normal loads read the server-side cache; only the explicit Refresh
    // button hits the shared PathologyManager API.
    const cached = this._registrationCache.get();
    if (cached) {
      this.applyPublicInfo(cached);
    }

    this.loadFromServer();
  }

  private loadFromServer(): void {
    this._pathologyService.getPublicInfo().subscribe({
      next: (info) => {
        this.applyPublicInfo(info);
        this._registrationCache.set(info);
      },
      error: () => {
        // Keep the cached/optimistic state when we have one. If the server is simply
        // unreachable, a Login link that fails on click is more honest than offering
        // to register a lab that is already registered.
        if (!this._registrationCache.has()) {
          this.navState = 'unregistered';
        }
      },
    });
  }

  /**
   * Explicit user action: fetch the latest licence straight from the shared API
   * instead of the cache. The server caps this at 5 calls per hour and, once the
   * quota is spent, still answers 200 with cached values and rateLimited = true —
   * so this only ever degrades to "showing cached data", never to an error state.
   */
  refreshLicence(): void {
    if (this.refreshing) return;

    this.refreshing = true;
    this.clearRefreshMessage();

    // The cached lab profile (12h TTL) carries licence type/status/expiry. Drop it
    // now so the profile page can't keep showing the pre-refresh licence.
    this._profileCache.clear();

    this._pathologyService.getPublicInfo(true).subscribe({
      next: (info) => {
        this.refreshing = false;
        this.applyPublicInfo(info);
        this._registrationCache.set(info);

        if (info?.rateLimited) {
          this.showRefreshMessage(
            'Refresh limit reached (5 per hour). Showing the last known licence details — please try again later.',
            'warn');
        } else if (info?.sourcedFromSharedApi) {
          this.showRefreshMessage('Licence details updated.', 'ok');
        } else {
          this.showRefreshMessage(
            'Could not reach the licence server. Showing locally stored details.', 'warn');
        }
      },
      error: () => {
        this.refreshing = false;
        this.showRefreshMessage('Could not refresh the licence right now. Please try again.', 'warn');
      },
    });
  }

  /** Tooltip showing how much of the hourly refresh quota is left. */
  get refreshTooltip(): string {
    if (this.refreshesRemaining === null) return 'Fetch the latest licence details';
    return `Fetch the latest licence details (${this.refreshesRemaining} of 5 refreshes left this hour)`;
  }

  private showRefreshMessage(message: string, kind: 'ok' | 'warn'): void {
    this.refreshMessage = message;
    this.refreshMessageKind = kind;

    clearTimeout(this.refreshMessageTimer);
    this.refreshMessageTimer = setTimeout(() => (this.refreshMessage = ''), 6000);
  }

  private clearRefreshMessage(): void {
    clearTimeout(this.refreshMessageTimer);
    this.refreshMessage = '';
  }

  /** Maps a GetPublicInfo response (from cache or server) to the nav state. */
  private applyPublicInfo(info: any): void {
    if (typeof info?.refreshesRemaining === 'number') {
      this.refreshesRemaining = info.refreshesRemaining;
    }
    if (!info?.isRegistered) {
      this.navState = 'unregistered';
      return;
    }
    if (!info.date_of_Expiry) {
      this.navState = 'registered';
      return;
    }
    this.daysLeft = this.daysUntil(info.date_of_Expiry);
    const _ed = new Date(info.date_of_Expiry);
    this.expiryDisplay = `${_ed.getDate().toString().padStart(2,'0')}-${(_ed.getMonth()+1).toString().padStart(2,'0')}-${_ed.getFullYear()}`;
    this.navState = this.daysLeft <= EXTEND_WINDOW_DAYS ? 'extend' : 'registered';
  }

  private daysUntil(isoDate: string): number {
    const diff = new Date(isoDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}
