import { Injectable } from '@angular/core';
import { PathologyPublicInfoDto } from 'src/app/features/pathology/models/pathology-public-info.dto';

/** The only two fields the home navbar needs in order to decide Login vs Register. */
export type RegistrationSnapshot = Pick<PathologyPublicInfoDto, 'isRegistered' | 'date_of_Expiry'>;

interface CachedSnapshot {
  data: RegistrationSnapshot;
  /** Epoch ms when this entry was written. */
  fetchedAt: number;
}

/**
 * Client-side cache for "is this install registered, and when does its licence expire?" —
 * the answer the home page needs before it can render the Login / Register CTA.
 *
 * This exists purely so the navbar can paint on the first frame instead of waiting on
 * GET Pathology/GetPublicInfo. The home component applies the snapshot synchronously and
 * then revalidates against the server in the background, so a stale entry is corrected
 * within the same page view. The registration state of a single-tenant install changes
 * approximately once, ever, which is why the TTL is a week — it's only a backstop.
 *
 * Only the expiry *date* is stored, never a derived day count, so "days left" is always
 * recomputed from the clock rather than resurrected stale from storage.
 *
 * Nothing sensitive is stored here — no licence key, no contact details.
 */
@Injectable({ providedIn: 'root' })
export class PathologyRegistrationCacheService {
  private readonly CACHE_KEY = 'diagnocare_pathology_registration_cache';

  /** Backstop only — the value is revalidated on every home page load. */
  private readonly TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  /** Returns the cached snapshot if present and still within the TTL, else null. */
  get(): RegistrationSnapshot | null {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;

      const parsed: CachedSnapshot = JSON.parse(raw);
      if (typeof parsed?.data?.isRegistered !== 'boolean') return null;
      if (typeof parsed.fetchedAt !== 'number') return null;
      if (Date.now() - parsed.fetchedAt > this.TTL_MS) return null;

      return parsed.data;
    } catch {
      // Storage disabled (private browsing), quota errors, corrupt entry — all mean
      // "no snapshot", never a broken home page.
      return null;
    }
  }

  /** True when a fresh (non-expired) snapshot exists. */
  has(): boolean {
    return this.get() !== null;
  }

  /** Stores the nav-relevant fields of a GetPublicInfo response with the current timestamp. */
  set(info: PathologyPublicInfoDto | null | undefined): void {
    if (typeof info?.isRegistered !== 'boolean') return;

    const entry: CachedSnapshot = {
      data: { isRegistered: info.isRegistered, date_of_Expiry: info.date_of_Expiry },
      fetchedAt: Date.now(),
    };

    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(entry));
    } catch {
      // Best-effort: a write failure just means the next load paints optimistically.
    }
  }

  /** Forces the next read to miss. */
  clear(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY);
    } catch {
      /* nothing to do */
    }
  }
}
