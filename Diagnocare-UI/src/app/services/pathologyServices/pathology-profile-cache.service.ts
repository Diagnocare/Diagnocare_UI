import { Injectable } from '@angular/core';
import { PathologyProfileDto } from 'src/app/models/pathology/pathology-profile.dto';

interface CachedProfile {
  data: PathologyProfileDto;
  /** Epoch ms when this entry was written. */
  fetchedAt: number;
}

/**
 * Client-side cache for the lab profile (GET Pathology/GetProfile).
 *
 * Pathology identity + license status rarely change, so we don't want to hit the
 * API (which in turn calls the shared PathologyManager service) on every page
 * load. Cached entries are considered fresh for TTL_MS; after that the next read
 * misses and the caller re-fetches.
 *
 * Nothing sensitive is stored here — PathologyProfileDto has no raw license key
 * field, only masked/summary license info (type, status, expiry).
 */
@Injectable({ providedIn: 'root' })
export class PathologyProfileCacheService {
  private readonly CACHE_KEY = 'diagnocare_pathology_profile_cache';

  /** How long a cached profile is considered fresh before we call the API again. */
  private readonly TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  /** Returns the cached profile if present and still within the TTL, else null. */
  get(): PathologyProfileDto | null {
    const raw = localStorage.getItem(this.CACHE_KEY);
    if (!raw) return null;

    try {
      const parsed: CachedProfile = JSON.parse(raw);
      if (!parsed?.data || typeof parsed.fetchedAt !== 'number') return null;
      if (Date.now() - parsed.fetchedAt > this.TTL_MS) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  /** True when a fresh (non-expired) cached profile exists. */
  has(): boolean {
    return this.get() !== null;
  }

  /** Stores the profile with the current timestamp. */
  set(data: PathologyProfileDto): void {
    const entry: CachedProfile = { data, fetchedAt: Date.now() };
    localStorage.setItem(this.CACHE_KEY, JSON.stringify(entry));
  }

  /** Forces the next read to miss, so the caller re-fetches from the API. */
  clear(): void {
    localStorage.removeItem(this.CACHE_KEY);
  }
}
