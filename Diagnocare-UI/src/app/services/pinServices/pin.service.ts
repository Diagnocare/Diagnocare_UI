import { Injectable } from '@angular/core';
import { StorageEncryptionService } from '../storageEncryptionService/storage-encryption.service';

/**
 * PIN Service
 * ───────────
 * Manages per-user session PINs for grace-period re-authentication.
 *
 * Storage (all XOR-encrypted, per-user):
 *   pin_<userId>          — SHA-256 hash of the current PIN.
 *   pin_history_<userId>  — JSON array of up to 3 previous PIN hashes (newest first).
 *   pin_set_at_<userId>   — ISO timestamp of when the current PIN was last set.
 *
 * Policies enforced here:
 *   • PIN must not match any of the last 3 PINs (history check).
 *   • PIN expires after PIN_EXPIRY_DAYS (60) days.
 *   • A "nearing expiry" warning fires when PIN_WARNING_DAYS (10) remain.
 *   • PIN that existed before the timestamp feature has no expiry (treated as fresh).
 */
@Injectable({ providedIn: 'root' })
export class PinService {

  private readonly PIN_KEY_PREFIX     = 'pin_';
  private readonly PIN_HISTORY_PREFIX = 'pin_history_';
  private readonly PIN_SET_AT_PREFIX  = 'pin_set_at_';

  static readonly PIN_EXPIRY_DAYS  = 60;
  static readonly PIN_WARNING_DAYS = 10;
  /** Max number of previous PINs remembered to prevent reuse. */
  static readonly PIN_HISTORY_SIZE = 3;

  constructor(private encryptionService: StorageEncryptionService) {}

  // ── PIN management ─────────────────────────────────────────────────────────

  /**
   * Hash the given PIN with SHA-256, enforce history policy, and store it.
   * Replaces any previously stored PIN for this user.
   *
   * IMPORTANT: callers must call `isRecentPin()` first and show a validation
   * error before calling this method — this method does NOT throw on reuse.
   */
  async setPin(userId: string, pin: string): Promise<void> {
    const newHash = await this.sha256(pin);

    // Shift the current hash into history before overwriting.
    const currentStored = localStorage.getItem(this.storageKey(userId));
    if (currentStored) {
      const currentHash = this.encryptionService.decrypt(currentStored);
      if (currentHash) {
        const history = this.getHistoryHashes(userId);
        history.unshift(currentHash);
        this.saveHistoryHashes(userId, history.slice(0, PinService.PIN_HISTORY_SIZE));
      }
    }

    // Store new PIN hash.
    localStorage.setItem(this.storageKey(userId), this.encryptionService.encrypt(newHash));

    // Stamp the set-at date so expiry can be tracked.
    localStorage.setItem(
      this.pinSetAtKey(userId),
      this.encryptionService.encrypt(new Date().toISOString()),
    );
  }

  /** Returns true if a PIN has been set for this user. */
  hasPin(userId: string | null): boolean {
    if (!userId) return false;
    return !!localStorage.getItem(this.storageKey(userId));
  }

  /** Verifies a candidate PIN against the stored hash. */
  async verifyPin(userId: string, candidatePin: string): Promise<boolean> {
    const stored = localStorage.getItem(this.storageKey(userId));
    if (!stored) return false;
    const storedHash    = this.encryptionService.decrypt(stored);
    const candidateHash = await this.sha256(candidatePin);
    return storedHash === candidateHash;
  }

  /**
   * Returns true if the candidate PIN matches the current PIN **or** any of
   * the last `PIN_HISTORY_SIZE` PINs — i.e. it would be a reuse.
   * Call this before `setPin()` to enforce the no-reuse policy.
   */
  async isRecentPin(userId: string, candidatePin: string): Promise<boolean> {
    const candidateHash = await this.sha256(candidatePin);

    // Check current PIN.
    const currentStored = localStorage.getItem(this.storageKey(userId));
    if (currentStored) {
      const currentHash = this.encryptionService.decrypt(currentStored);
      if (currentHash === candidateHash) return true;
    }

    // Check history.
    return this.getHistoryHashes(userId).includes(candidateHash);
  }

  /**
   * Removes the stored PIN, history, and timestamp for the user.
   * Called when the user explicitly removes their PIN from Settings.
   */
  clearPin(userId: string): void {
    localStorage.removeItem(this.storageKey(userId));
    localStorage.removeItem(this.pinHistoryKey(userId));
    localStorage.removeItem(this.pinSetAtKey(userId));
  }

  // ── Expiry ─────────────────────────────────────────────────────────────────

  /** Returns the date-time when the current PIN was set, or null if unknown. */
  getPinSetAt(userId: string): Date | null {
    const stored = localStorage.getItem(this.pinSetAtKey(userId));
    if (!stored) return null;
    const raw  = this.encryptionService.decrypt(stored);
    if (!raw)  return null;
    const date = new Date(raw);
    return isNaN(date.getTime()) ? null : date;
  }

  /** Days remaining before the PIN expires (0 means already expired). */
  getPinDaysLeft(userId: string): number {
    const setAt = this.getPinSetAt(userId);
    if (!setAt) return PinService.PIN_EXPIRY_DAYS; // no timestamp → treat as freshly set
    const daysSince = Math.floor(
      (Date.now() - setAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(0, PinService.PIN_EXPIRY_DAYS - daysSince);
  }

  /**
   * Returns true if the stored PIN has passed its 60-day expiry.
   * PINs set before the timestamp feature was added are never considered expired.
   */
  isPinExpired(userId: string): boolean {
    if (!this.hasPin(userId)) return false;
    const setAt = this.getPinSetAt(userId);
    if (!setAt) return false; // legacy PIN with no timestamp → not expired
    return this.getPinDaysLeft(userId) === 0;
  }

  /**
   * Returns true when the PIN will expire within `threshold` days but has not yet.
   * Default threshold: PIN_WARNING_DAYS (10).
   */
  isPinExpiringSoon(
    userId: string,
    threshold = PinService.PIN_WARNING_DAYS,
  ): boolean {
    if (!this.hasPin(userId)) return false;
    const daysLeft = this.getPinDaysLeft(userId);
    return daysLeft > 0 && daysLeft <= threshold;
  }

  // ── History (private) ──────────────────────────────────────────────────────

  private getHistoryHashes(userId: string): string[] {
    const stored = localStorage.getItem(this.pinHistoryKey(userId));
    if (!stored) return [];
    try {
      const raw = this.encryptionService.decrypt(stored);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private saveHistoryHashes(userId: string, hashes: string[]): void {
    localStorage.setItem(
      this.pinHistoryKey(userId),
      this.encryptionService.encrypt(JSON.stringify(hashes)),
    );
  }

  // ── Storage key helpers ────────────────────────────────────────────────────

  private storageKey(userId: string):    string { return `${this.PIN_KEY_PREFIX}${userId}`;     }
  private pinHistoryKey(userId: string): string { return `${this.PIN_HISTORY_PREFIX}${userId}`; }
  private pinSetAtKey(userId: string):   string { return `${this.PIN_SET_AT_PREFIX}${userId}`;  }

  /**
   * Returns the SHA-256 hex digest of the input string.
   * Uses the Web Crypto API when available (HTTPS / localhost).
   * Falls back to a deterministic pure-JS hash when running over plain HTTP
   * (where crypto.subtle is undefined by browser security policy).
   */
  private async sha256(value: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const data = new TextEncoder().encode(value);
      const buf  = await crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    // Fallback for non-secure contexts (plain HTTP).
    // Not cryptographically strong, but deterministic — sufficient for
    // local-storage PIN comparison on the user's own device.
    return this.fallbackHash(value);
  }

  /**
   * Simple deterministic hash used when Web Crypto is unavailable.
   * Produces a 64-char hex string so its output is the same length as SHA-256.
   */
  private fallbackHash(value: string): string {
    // Two independent djb2 passes seeded differently to widen the output.
    const pass = (str: string, seed: number): number => {
      let h = seed;
      for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) ^ str.charCodeAt(i);
      }
      return h >>> 0; // unsigned 32-bit
    };
    const segments: string[] = [];
    for (let i = 0; i < 8; i++) {
      segments.push(pass(value + i, 0x811c9dc5 + i * 0x01000193).toString(16).padStart(8, '0'));
    }
    return segments.join('');
  }
}
