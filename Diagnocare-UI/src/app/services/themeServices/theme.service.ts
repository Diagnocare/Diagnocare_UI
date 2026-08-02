import { Injectable } from '@angular/core';

export type Theme = 'light' | 'dark' | 'midnight' | 'warm' | 'system';

/**
 * ThemeService
 * ─────────────
 * Persists the user's theme preference in localStorage keyed by username.
 * Key format: `diagnocare_theme_{username}`
 *
 * Themes:
 *   light  — always light
 *   dark   — always dark
 *   system — follows the OS prefers-color-scheme setting
 *
 * Applies the theme by setting a `data-theme` attribute on <html>.
 * CSS in styles.css responds to html[data-theme="dark"] and
 * @media (prefers-color-scheme: dark) + html[data-theme="system"].
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {

  private readonly STORAGE_PREFIX = 'diagnocare_theme_';
  private readonly LAST_THEME_KEY = 'diagnocare_theme_last';
  private readonly DEFAULT_THEME: Theme = 'light';

  /** Current live theme (reactive for the UI). */
  private _current: Theme = this.DEFAULT_THEME;
  get current(): Theme { return this._current; }

  // ── Per-user persistence ───────────────────────────────────────────────────

  private storageKey(username: string): string {
    return `${this.STORAGE_PREFIX}${username}`;
  }

  /** Load and apply the theme saved for the given user. */
  loadForUser(username: string): void {
    const saved = localStorage.getItem(this.storageKey(username)) as Theme | null;
    const theme: Theme = this.isValidTheme(saved) ? saved! : this.DEFAULT_THEME;
    this.apply(theme);
  }

  /** Save the chosen theme for the user and apply it immediately. */
  setForUser(username: string, theme: Theme): void {
    localStorage.setItem(this.storageKey(username), theme);
    this.apply(theme);
  }

  /** Return the saved theme for a user without applying it. */
  getForUser(username: string): Theme {
    const saved = localStorage.getItem(this.storageKey(username)) as Theme | null;
    return this.isValidTheme(saved) ? saved! : this.DEFAULT_THEME;
  }

  // ── DOM application ────────────────────────────────────────────────────────

  /**
   * Apply a theme by setting data-theme on <html>.
   * CSS variables in styles.css respond to this attribute.
   */
  apply(theme: Theme): void {
    this._current = theme;
    document.documentElement.setAttribute('data-theme', theme);
    // Save a username-independent fallback so the inline script in index.html
    // can restore the theme on a full reload even when the token is already gone
    // (e.g. the page reload that follows logout clears sessionStorage first).
    localStorage.setItem(this.LAST_THEME_KEY, theme);
  }

  /** Remove any stored theme for a user (e.g. on account deletion). */
  clearForUser(username: string): void {
    localStorage.removeItem(this.storageKey(username));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private isValidTheme(value: string | null): value is Theme {
    return value === 'light' || value === 'dark' || value === 'midnight' || value === 'warm' || value === 'system';
  }
}
