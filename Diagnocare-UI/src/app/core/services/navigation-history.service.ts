import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

/**
 * Tracks the previous in-app route so pages that can be reached from more than
 * one place (e.g. Help, which is opened both from the public home page and from
 * the in-app profile dropdown) can send the user *back to where they came from*
 * instead of a hard-coded destination.
 *
 * Provided in root and instantiated at bootstrap (injected by AppComponent) so
 * it starts recording from the very first navigation.
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private _previousUrl: string | null = null;
  private _currentUrl: string | null = null;

  constructor(private router: Router) {
    this._currentUrl = this.router.url;
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: NavigationEnd) => {
        // Shift: what was current becomes previous.
        this._previousUrl = this._currentUrl;
        this._currentUrl = e.urlAfterRedirects;
      });
  }

  /** The URL the user was on *before* the current one (null on first load). */
  get previousUrl(): string | null {
    return this._previousUrl;
  }

  get currentUrl(): string | null {
    return this._currentUrl;
  }
}
