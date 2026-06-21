import { Injectable } from '@angular/core';

/**
 * Stores the single pathology logo as a base64 data-URL in localStorage.
 *
 * Key is `pathology_logo` — one entry, one pathology, always the same name.
 * Reads/writes are synchronous so any component can call them inline.
 */
const STORAGE_KEY = 'pathology_logo';

@Injectable({ providedIn: 'root' })
export class PathologyLogoService {

  /** Returns the stored logo data-URL, or null if none has been saved. */
  get(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  }

  /** Persists a logo data-URL (result of FileReader.readAsDataURL). */
  save(dataUrl: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, dataUrl);
    } catch (e) {
      console.warn('PathologyLogoService: could not save logo to localStorage', e);
    }
  }

  /** Removes the stored logo. */
  remove(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }

  /** True when a logo is currently stored. */
  hasLogo(): boolean {
    return !!this.get();
  }
}
