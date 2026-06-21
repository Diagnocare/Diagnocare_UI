import { Injectable } from '@angular/core';

const STORAGE_KEY = 'diagnocare_parameter_units';

/** Default units seeded from the original parameterUnit enum. */
const DEFAULT_UNITS: string[] = [
  'mg/dL', 'g/dL', 'g/L', 'mmol/L', 'µmol/L',
  'mEq/L', 'IU/L', 'U/L', 'cells/mcL',
  '10³/µL', '10⁶/µL', '%',
  'µg/dL', 'ng/mL', 'pg/mL', 'mIU/L',
  'seconds', 'ratio', 'units',
];

@Injectable({ providedIn: 'root' })
export class UnitService {

  // ── Read ──────────────────────────────────────────────────────────────────

  getAll(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* fall through to defaults */ }
    this.saveAll([...DEFAULT_UNITS]);
    return [...DEFAULT_UNITS];
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  add(name: string): { success: boolean; error?: string } {
    name = name.trim();
    if (!name) return { success: false, error: 'Unit name cannot be empty.' };
    const list = this.getAll();
    if (list.some(l => l.toLowerCase() === name.toLowerCase())) {
      return { success: false, error: `"${name}" already exists.` };
    }
    this.saveAll([...list, name]);
    return { success: true };
  }

  update(original: string, newName: string): { success: boolean; error?: string } {
    newName = newName.trim();
    if (!newName) return { success: false, error: 'Unit name cannot be empty.' };
    const list = this.getAll();
    if (!list.includes(original)) return { success: false, error: 'Unit not found.' };
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
    this.saveAll([...DEFAULT_UNITS]);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private saveAll(list: string[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
}
