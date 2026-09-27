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

/** One cell of the month or year grid. */
export interface CalendarCell {
  /** Month index 0-11 in the month grid, full year in the year grid. */
  value: number;
  label: string;
  isCurrent: boolean;    // this month / this year on the wall calendar
  isSelected: boolean;   // holds the currently selected date
  isDisabled: boolean;   // entirely outside [min, max]
}

/** Which grid the panel is showing. */
export type DatePickerView = 'days' | 'months' | 'years';

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
 * Usage next to a text field that owns the value (the picker only mirrors it —
 * see the patient DOB row):
 *   <app-date-picker [value]="dobIso" (dateChange)="onPicked($event)"></app-date-picker>
 *
 * Optional inputs:
 *   [value]        — current date (YYYY-MM-DD) when not bound via ngModel/formControlName
 *   [inputClass]   — extra CSS classes on the trigger element (e.g. "form-control")
 *   [min]          — minimum selectable date (YYYY-MM-DD)
 *   [max]          — maximum selectable date (YYYY-MM-DD)
 *   [placeholder]  — text shown when no date is selected
 *   [yearSpan]     — how many years back the year grid reaches when [min] is absent
 *
 * The panel has three views. The header label is a button: from the day grid it
 * opens the year grid, a year opens that year's months, a month returns to the
 * days. Reaching 1985 from a date-of-birth field is three clicks instead of
 * forty presses of the year arrow.
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
  /**
   * How far back the year grid reaches when no [min] is supplied. A lifetime by
   * default, because the field that most needs a year grid is a date of birth.
   */
  @Input() yearSpan    = 120;

  @Output() dateChange = new EventEmitter<string>();

  /**
   * Current date in YYYY-MM-DD format.
   *
   * Also an @Input, so a parent that keeps the value somewhere else — a masked
   * text box the operator types into, say — can push it in and have the grid
   * open on that month instead of today. Writes go through writeValue(), so the
   * binding and the ControlValueAccessor stay one and the same value.
   */
  @Input()
  set value(val: string) { this.writeValue(val); }
  get value(): string    { return this._value; }

  // ── State ─────────────────────────────────────────────────────────────────────

  /** Stored value in YYYY-MM-DD format. */
  private _value = '';
  isDisabled   = false;
  showCalendar = false;

  viewMonth: number;
  viewYear:  number;

  /** Which grid the panel is showing. Always back to 'days' when it reopens. */
  view: DatePickerView = 'days';
  /** First year of the visible page of the year grid. */
  yearPageStart = 0;

  readonly weekDays   = WEEK_DAYS;
  readonly monthNames = MONTHS;

  /** 4 columns × 6 rows — a quarter-century at a glance without a scrollbar. */
  static readonly YEARS_PER_PAGE = 24;

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
    this._value = val ? val.split('T')[0] : '';
    if (this._value) {
      const d = new Date(this._value + 'T00:00:00');
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

  /** Header label — what it says depends on which grid is open. */
  get viewLabel(): string {
    if (this.view === 'months') return `${this.viewYear}`;
    if (this.view === 'years')  return `${this.yearPageStart} – ${this.yearPageStart + DatePickerComponent.YEARS_PER_PAGE - 1}`;
    return `${MONTHS[this.viewMonth]} ${this.viewYear}`;
  }

  /** What clicking the header label does next, for the tooltip and screen readers. */
  get viewSwitchLabel(): string {
    return this.view === 'days' ? 'Choose a year' : 'Back to the day grid';
  }

  // ── Selectable range ─────────────────────────────────────────────────────────

  /** Latest year the year grid offers. */
  get maxYear(): number {
    return this.max ? +this.max.slice(0, 4) : this.today.getFullYear() + 20;
  }

  /** Earliest year the year grid offers. */
  get minYear(): number {
    return this.min ? +this.min.slice(0, 4) : this.maxYear - this.yearSpan;
  }

  private get minDate(): Date | null { return this.min ? new Date(this.min + 'T00:00:00') : null; }
  private get maxDate(): Date | null { return this.max ? new Date(this.max + 'T00:00:00') : null; }

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

  trackByCell(_: number, cell: CalendarCell): number {
    return cell.value;
  }

  // ── Month and year grids ─────────────────────────────────────────────────────

  /** The twelve months of viewYear, as 3 rows of 4. */
  get monthRows(): CalendarCell[][] {
    const selected = this.selectedDate;
    const now      = this.today;
    const cells: CalendarCell[] = MONTHS.map((name, m) => ({
      value: m,
      label: MONTH_SHORT[m],
      isCurrent:  now.getFullYear() === this.viewYear && now.getMonth() === m,
      isSelected: !!selected && selected.getFullYear() === this.viewYear && selected.getMonth() === m,
      isDisabled: this.isMonthDisabled(m),
    }));
    return this.chunk(cells, 4);
  }

  /** The visible page of the year grid, as 6 rows of 4. */
  get yearRows(): CalendarCell[][] {
    const selected = this.selectedDate;
    const nowYear  = this.today.getFullYear();
    const cells: CalendarCell[] = [];
    for (let i = 0; i < DatePickerComponent.YEARS_PER_PAGE; i++) {
      const y = this.yearPageStart + i;
      cells.push({
        value: y,
        label: String(y),
        isCurrent:  y === nowYear,
        isSelected: !!selected && selected.getFullYear() === y,
        isDisabled: y < this.minYear || y > this.maxYear,
      });
    }
    return this.chunk(cells, 4);
  }

  /** Start of the newest page — the one that ends on maxYear. */
  private get lastPageStart(): number {
    return Math.max(this.minYear, this.maxYear - DatePickerComponent.YEARS_PER_PAGE + 1);
  }

  /** False when there is nothing selectable further back — the arrow greys out. */
  get canPageBack(): boolean {
    return this.yearPageStart > this.minYear;
  }

  get canPageForward(): boolean {
    return this.yearPageStart < this.lastPageStart;
  }

  /** A month is offered only when at least one of its days falls inside [min, max]. */
  private isMonthDisabled(month: number): boolean {
    const first = new Date(this.viewYear, month, 1);
    const last  = new Date(this.viewYear, month + 1, 0);
    const min   = this.minDate;
    const max   = this.maxDate;
    return (max !== null && first > max) || (min !== null && last < min);
  }

  /** The selected value as a Date, or null when nothing is selected. */
  private get selectedDate(): Date | null {
    if (!this._value) return null;
    const d = new Date(this._value + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  private chunk(cells: CalendarCell[], size: number): CalendarCell[][] {
    const rows: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += size) rows.push(cells.slice(i, i + size));
    return rows;
  }

  /**
   * First year of the page holding `year`.
   *
   * Pages are aligned to the newest year, not the oldest, so the page you land
   * on ends at maxYear. On a date-of-birth field, where max is today, that means
   * opening on 2003-2026 rather than on 2026 followed by 23 dead cells.
   */
  private pageStartFor(year: number): number {
    const size      = DatePickerComponent.YEARS_PER_PAGE;
    const lastStart = this.lastPageStart;
    const pagesBack = Math.max(0, Math.ceil((lastStart - year) / size));
    return Math.max(this.minYear, lastStart - pagesBack * size);
  }

  // ── View switching ───────────────────────────────────────────────────────────

  /**
   * The header label. From the day grid it opens the years — the long jump a
   * date of birth needs. From either of the other grids it steps back out.
   */
  toggleView(): void {
    if (this.view === 'days') this.openYearView();
    else                      this.view = 'days';
  }

  openYearView(): void {
    this.yearPageStart = this.pageStartFor(this.viewYear);
    this.view = 'years';
  }

  /** Picking a year drops into that year's months — year, then month, then day. */
  selectYear(cell: CalendarCell): void {
    if (cell.isDisabled) return;
    this.viewYear = cell.value;
    this.view = 'months';
  }

  /** Picking a month drops into its days, where the date is actually chosen. */
  selectMonth(cell: CalendarCell): void {
    if (cell.isDisabled) return;
    this.viewMonth = cell.value;
    this.view = 'days';
  }

  // ── Interactions ─────────────────────────────────────────────────────────────

  toggleCalendar(): void {
    if (this.isDisabled || this.readonly) return;
    // Opening always starts on the days, whichever grid was left showing last time.
    if (!this.showCalendar) this.view = 'days';
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

  /**
   * The ‹ and › arrows. What they step depends on the open grid: a month on the
   * days, a year on the months, a whole page of years on the years.
   */
  stepBack(): void {
    if (this.view === 'years')       this.pageBack();
    else if (this.view === 'months') this.prevYear();
    else                             this.prevMonth();
  }

  stepForward(): void {
    if (this.view === 'years')       this.pageForward();
    else if (this.view === 'months') this.nextYear();
    else                             this.nextMonth();
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

  pageBack(): void {
    if (!this.canPageBack) return;
    // Never page past the oldest selectable year — the page would be all greys.
    this.yearPageStart = Math.max(this.minYear, this.yearPageStart - DatePickerComponent.YEARS_PER_PAGE);
  }

  pageForward(): void {
    if (!this.canPageForward) return;
    // Stop on the newest page rather than one that runs past maxYear.
    this.yearPageStart = Math.min(this.lastPageStart, this.yearPageStart + DatePickerComponent.YEARS_PER_PAGE);
  }

  goToToday(): void {
    // Navigate to today's month/year, then delegate to selectDay() so the
    // disabled/range check is identical to clicking a date cell in the grid.
    this.view      = 'days';
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
