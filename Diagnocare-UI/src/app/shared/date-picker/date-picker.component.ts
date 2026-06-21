import {
  Component,
  ElementRef,
  EventEmitter,
  forwardRef,
  HostListener,
  Input,
  Output,
  ViewEncapsulation,
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR,
} from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface CalendarDay {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = MONTHS.map(m => m.slice(0, 3));
const WEEK_DAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Reusable custom calendar date-picker (ControlValueAccessor).
 *
 * Usage with ngModel:
 *   <app-date-picker [(ngModel)]="myDate" (dateChange)="onChanged()"></app-date-picker>
 *
 * Usage with reactive forms:
 *   <app-date-picker formControlName="myDate"></app-date-picker>
 *
 * Optional inputs:
 *   [inputClass]   — extra CSS classes on the trigger element (e.g. "form-control")
 *   [min]          — minimum selectable date (YYYY-MM-DD)
 *   [max]          — maximum selectable date (YYYY-MM-DD)
 *   [placeholder]  — text shown when no date is selected
 *
 * Value format: YYYY-MM-DD string (backward-compatible with the native date input).
 */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-picker.component.html',
  styleUrls: ['./date-picker.component.css'],
  encapsulation: ViewEncapsulation.None,   // styles applied globally so Bootstrap can't override dp-* rules
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatePickerComponent),
      multi: true,
    },
  ],
})
export class DatePickerComponent implements ControlValueAccessor {
  @Input() inputClass  = '';
  @Input() min         = '';
  @Input() max         = '';
  @Input() placeholder = 'Select date';
  /** When true the calendar cannot be opened (mirrors native [readonly] behaviour). */
  @Input() readonly    = false;

  @Output() dateChange = new EventEmitter<string>();

  // ── State ─────────────────────────────────────────────────────────────────────

  /** Stored value in YYYY-MM-DD format. */
  value        = '';
  isDisabled   = false;
  showCalendar = false;

  viewMonth: number;
  viewYear:  number;

  readonly weekDays   = WEEK_DAYS;
  readonly monthNames = MONTHS;

  /** calendarDays split into 6 rows of 7, ready for a <table>. */
  get calendarWeeks(): CalendarDay[][] {
    const days = this.calendarDays;
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  }

  /** Always returns the current local date — never stale across midnight or page sessions. */
  private get today(): Date { return new Date(); }

  private onChange: (v: string) => void = () => {};
  onTouched:        ()          => void = () => {};

  constructor(private elementRef: ElementRef) {
    const now      = new Date();
    this.viewMonth = now.getMonth();
    this.viewYear  = now.getFullYear();
  }

  // ── ControlValueAccessor ─────────────────────────────────────────────────────

  writeValue(val: string): void {
    // Normalise: strip time portion if API returns a full ISO datetime string
    this.value = val ? val.split('T')[0] : '';
    if (this.value) {
      const d = new Date(this.value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        this.viewMonth = d.getMonth();
        this.viewYear  = d.getFullYear();
      }
    }
  }

  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void          { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void        { this.isDisabled = disabled; }

  // ── Display helpers ──────────────────────────────────────────────────────────

  /** Human-readable date shown in the trigger in dd-mm-yyyy format. */
  get displayValue(): string {
    if (!this.value) return '';
    const d = new Date(this.value + 'T00:00:00');
    if (isNaN(d.getTime())) return this.value;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  /** Month + year shown in the calendar header. */
  get viewLabel(): string {
    return `${MONTHS[this.viewMonth]} ${this.viewYear}`;
  }

  // ── Calendar grid ────────────────────────────────────────────────────────────

  get calendarDays(): CalendarDay[] {
    const days: CalendarDay[]  = [];
    const firstOfMonth         = new Date(this.viewYear, this.viewMonth, 1);
    const leadDays             = firstOfMonth.getDay();                                  // 0=Sun
    const daysInMonth          = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const prevMonthTotal       = new Date(this.viewYear, this.viewMonth, 0).getDate();
    const todayIso             = this.toIso(this.today);
    const minDate = this.min   ? new Date(this.min + 'T00:00:00') : null;
    const maxDate = this.max   ? new Date(this.max + 'T00:00:00') : null;

    // Tail of previous month
    for (let i = leadDays - 1; i >= 0; i--) {
      days.push(this.buildDay(
        new Date(this.viewYear, this.viewMonth - 1, prevMonthTotal - i),
        false, todayIso, minDate, maxDate,
      ));
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(this.buildDay(
        new Date(this.viewYear, this.viewMonth, d),
        true, todayIso, minDate, maxDate,
      ));
    }

    // Head of next month (pad to 42 cells = 6 rows × 7 cols)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      days.push(this.buildDay(
        new Date(this.viewYear, this.viewMonth + 1, d),
        false, todayIso, minDate, maxDate,
      ));
    }

    return days;
  }

  private buildDay(
    date: Date,
    inMonth: boolean,
    todayIso: string,
    minDate: Date | null,
    maxDate: Date | null,
  ): CalendarDay {
    const iso        = this.toIso(date);
    const isDisabled =
      (minDate !== null && date < minDate) ||
      (maxDate !== null && date > maxDate);
    return { date, inMonth, isToday: iso === todayIso, isSelected: iso === this.value, isDisabled };
  }

  trackByDate(_: number, day: CalendarDay): string {
    return this.toIso(day.date);
  }

  // ── Interactions ─────────────────────────────────────────────────────────────

  toggleCalendar(): void {
    if (this.isDisabled || this.readonly) return;
    this.showCalendar = !this.showCalendar;
  }

  closeCalendar(): void {
    if (this.showCalendar) {
      this.showCalendar = false;
      this.onTouched();
    }
  }

  /** Close on Escape key. */
  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeCalendar(); }

  /** Close when clicking outside the component entirely. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showCalendar && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closeCalendar();
    }
  }

  selectDay(day: CalendarDay): void {
    if (day.isDisabled) return;
    const iso = this.toIso(day.date);
    this.value = iso;
    this.onChange(iso);
    this.onTouched();
    this.dateChange.emit(iso);
    this.showCalendar = false;
  }

  prevYear():  void { this.viewYear--;  }
  nextYear():  void { this.viewYear++;  }

  prevMonth(): void {
    if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
    else this.viewMonth--;
  }

  nextMonth(): void {
    if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
    else this.viewMonth++;
  }

  goToToday(): void {
    // Navigate to today's month/year, then delegate to selectDay() so the
    // disabled/range check is identical to clicking a date cell in the grid.
    this.viewMonth = this.today.getMonth();
    this.viewYear  = this.today.getFullYear();
    const todayDay = this.calendarDays.find(d => d.isToday);
    if (todayDay) {
      this.selectDay(todayDay);
    } else {
      this.showCalendar = false;
    }
  }

  clearValue(): void {
    this.value = '';
    this.onChange('');
    this.onTouched();
    this.dateChange.emit('');
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
