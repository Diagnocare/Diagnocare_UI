import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { TokenService }     from 'src/app/core/interceptors/token.service';

/** How many days before expiry the "Extend Licence" button appears */
const EXTEND_WINDOW_DAYS = 15;

/** localStorage key + TTL for the cached registration state (avoids re-hitting the API). */
const HOME_CACHE_KEY = 'diagnocare_home_state';
const HOME_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type HomeNavState =
  | 'loading'       // still fetching
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
  navState: HomeNavState = 'loading';
  daysLeft = 0;
  expiryDisplay = '';

  /** True only when a Super Admin JWT is present in the session. */
  get isSuperAdmin(): boolean {
    return this._tokenService.isSuperAdmin();
  }

  constructor(
    private _pathologyService: PathologyService,
    private _tokenService: TokenService,
  ) {}

  ngOnInit(): void {
    // Client-side first: if we already know (cached) the lab is registered, use that
    // and skip the API call. Otherwise fall back to the GetPublicInfo endpoint.
    const cached = this.readCache();
    if (cached) {
      this.applyPublicInfo(cached);
      return;
    }
    this.loadFromServer();
  }

  private loadFromServer(): void {
    this._pathologyService.getPublicInfo().subscribe({
      next: (info) => {
        this.writeCache(info);
        this.applyPublicInfo(info);
      },
      error: () => {
        this.navState = 'unregistered';
      },
    });
  }

  /** Maps a GetPublicInfo response (from cache or server) to the nav state. */
  private applyPublicInfo(info: any): void {
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

  /** Returns cached registration info if present and fresh; otherwise null. */
  private readCache(): any | null {
    try {
      const raw = localStorage.getItem(HOME_CACHE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw);
      if (Date.now() - c.cachedAt > HOME_CACHE_TTL_MS) return null;
      return c.info;
    } catch {
      return null;
    }
  }

  /**
   * Caches ONLY the registered state. Registration is a one-way, single-entry event,
   * so once registered we can serve it from the cache; an unregistered result is never
   * cached so a freshly-registered lab is detected on the next visit.
   */
  private writeCache(info: any): void {
    try {
      if (info?.isRegistered) {
        localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ info, cachedAt: Date.now() }));
      }
    } catch {
      /* ignore storage errors */
    }
  }

  private daysUntil(isoDate: string): number {
    const diff = new Date(isoDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}
