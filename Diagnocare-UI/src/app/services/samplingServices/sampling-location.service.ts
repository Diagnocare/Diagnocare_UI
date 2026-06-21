import { Injectable } from '@angular/core';
import { StorageEncryptionService } from 'src/app/services/storageEncryptionService/storage-encryption.service';

const STORAGE_KEY = 'diagnocare_sampling_locations';

/** Default locations seeded from the original samplingDoneStation enum. */
const DEFAULT_LOCATIONS: string[] = ['StarLab', 'DrLal', 'Scientific'];

@Injectable({ providedIn: 'root' })
export class SamplingLocationService {

  constructor(private crypto: StorageEncryptionService) {}

  // ── Read ──────────────────────────────────────────────────────────────────

  getAll(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const decrypted = this.crypto.decrypt(raw);
        if (decrypted) {
          const parsed = JSON.parse(decrypted) as string[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch { /* fall through to defaults */ }
    // First-time load — seed defaults and persist
    this.saveAll([...DEFAULT_LOCATIONS]);
    return [...DEFAULT_LOCATIONS];
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  add(name: string): { success: boolean; error?: string } {
    name = name.trim();
    if (!name) return { success: false, error: 'Name cannot be empty.' };
    const list = this.getAll();
    if (list.some(l => l.toLowerCase() === name.toLowerCase())) {
      return { success: false, error: `"${name}" already exists.` };
    }
    this.saveAll([...list, name]);
    return { success: true };
  }

  update(original: string, newName: string): { success: boolean; error?: string } {
    newName = newName.trim();
    if (!newName) return { success: false, error: 'Name cannot be empty.' };
    const list = this.getAll();
    if (!list.includes(original)) return { success: false, error: 'Location not found.' };
    if (
      newName.toLowerCase() !== original.toLowerCase() &&
      list.some(l => l.toLowerCase() === newName.toLowerCase())
    ) {
      return { success: false, error: `"${newName}" already exists.` };
    }
    this.saveAll(list.map(l => (l === original ? newName : l)));
    return { success: true };
  }

  delete(name: string): void {
    this.saveAll(this.getAll().filter(l => l !== name));
  }

  /** Restore factory defaults. */
  reset(): void {
    this.saveAll([...DEFAULT_LOCATIONS]);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private saveAll(list: string[]): void {
    const encrypted = this.crypto.encrypt(JSON.stringify(list));
    localStorage.setItem(STORAGE_KEY, encrypted);
  }
}
