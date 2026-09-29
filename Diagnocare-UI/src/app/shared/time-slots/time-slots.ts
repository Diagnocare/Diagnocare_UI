import { AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * Time helpers for pickers that snap to a fixed interval
 * (visit scheduling: 12:00 AM, 12:15 AM, 12:30 AM …).
 *
 * The form control always holds a 24-hour "HH:mm" string, so it passes
 * AppValidators.time24h() and goes to the API unchanged.
 */

/** Minute interval for visit scheduling. */
export const VISIT_SLOT_MINUTES = 15;

export type Meridiem = 'AM' | 'PM';

export function formatTime12h(hhmm: string): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Trims "HH:mm:ss" → "HH:mm"; returns '' for empty/invalid input. */
export function normalizeHHmm(t: string | null | undefined): string {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Drives three dropdowns — Hour (1–12), Minute (00/15/30/45) and AM/PM —
 * and keeps a single reactive-form control in sync with them.
 *
 * Usage (component):  timePicker = new TimePartsPicker(form.get('visitTime')!);
 *                     ngOnDestroy → timePicker.destroy();
 * Usage (template):   three <select>s bound with [(ngModel)] to hour / minute /
 *                     meridiem, [ngModelOptions]="{standalone: true}",
 *                     (ngModelChange)="timePicker.commit()".
 */
export class TimePartsPicker {
  readonly hours: string[] = Array.from({ length: 12 }, (_, i) => String(i + 1));
  minutes: string[];
  readonly meridiems: Meridiem[] = ['AM', 'PM'];

  hour = '';
  minute = '';
  meridiem: Meridiem | '' = '';

  private readonly baseMinutes: string[];
  private sub: Subscription;

  constructor(private control: AbstractControl, stepMinutes: number = VISIT_SLOT_MINUTES) {
    this.baseMinutes = [];
    for (let m = 0; m < 60; m += stepMinutes) this.baseMinutes.push(String(m).padStart(2, '0'));
    this.minutes = [...this.baseMinutes];

    this.readFrom(control.value);
    // Keep the dropdowns in step with outside changes (form.reset, patchValue …).
    this.sub = control.valueChanges.subscribe(v => {
      if (normalizeHHmm(v) !== this.currentValue) this.readFrom(v);
    });
  }

  /** Call from each dropdown's (ngModelChange). */
  commit(): void {
    const v = this.currentValue;
    if (this.control.value !== v) this.control.setValue(v);
    this.control.markAsDirty();
  }

  /** Call from each dropdown's (blur) so validation messages appear. */
  touch(): void { this.control.markAsTouched(); }

  destroy(): void { this.sub.unsubscribe(); }

  /** "HH:mm" once all three parts are chosen, otherwise ''. */
  private get currentValue(): string {
    if (!this.hour || !this.minute || !this.meridiem) return '';
    let h = Number(this.hour) % 12;
    if (this.meridiem === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${this.minute}`;
  }

  private readFrom(raw: string | null | undefined): void {
    this.minutes = [...this.baseMinutes];
    const v = normalizeHHmm(raw);
    if (!v) { this.hour = ''; this.minute = ''; this.meridiem = ''; return; }

    const [h, m] = v.split(':');
    const hNum = Number(h);
    this.hour = String(hNum % 12 || 12);
    this.meridiem = hNum >= 12 ? 'PM' : 'AM';
    this.minute = m;
    // Older visits may be off the grid (e.g. 10:07) — keep that minute
    // selectable so opening a form never silently changes the saved time.
    if (!this.minutes.includes(m)) this.minutes = [...this.minutes, m].sort();
    // Normalise "HH:mm:ss" coming from the API to "HH:mm".
    if (raw !== v) this.control.setValue(v, { emitEvent: false });
  }
}
