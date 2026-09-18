import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { VisitCalendarDayDto } from 'src/app/models/visitSchedule/visit-schedule.dto';

/** One cell in the month calendar grid. */
export interface CalendarDay {
  date:      Date;
  inMonth:   boolean;
  isToday:   boolean;
  visitInfo: VisitCalendarDayDto | null;
  /** True when this date is a registered holiday. */
  isHoliday:   boolean;
  holidayName: string | null;
  /** True when the date is a holiday that still has visits scheduled on it. */
  hasConflict: boolean;
}

/**
 * Shared presentational month calendar used by both the admin Visit Schedule
 * and the staff My Visits views. It renders the grid, per-day visit-count
 * badges and legend, and emits day-selection / month-navigation events. The
 * parent owns the year/month and reloads the calendar data on navigation.
 */
@Component({
  selector: 'app-visit-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visit-calendar.component.html',
  styleUrls: ['./visit-calendar.component.scss'],
})
export class VisitCalendarComponent {
  /** Per-day visit summary for the displayed month. */
  @Input() calendarData: VisitCalendarDayDto[] = [];
  @Input() viewYear  = new Date().getFullYear();
  @Input() viewMonth = new Date().getMonth() + 1;   // 1-indexed
  /** Currently selected day (YYYY-MM-DD) or null. */
  @Input() selectedDate: string | null = null;
  /**
   * When true the legend explains the holiday markers. Left on by default —
   * both the admin and the staff calendar now surface holidays.
   */
  @Input() showHolidays = true;

  @Output() prevMonth   = new EventEmitter<void>();
  @Output() nextMonth   = new EventEmitter<void>();
  @Output() daySelected = new EventEmitter<string>();

  readonly weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly months   = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  private readonly today = new Date();

  get viewLabel(): string { return `${this.months[this.viewMonth - 1]} ${this.viewYear}`; }

  /** Month grid, recomputed each change-detection cycle from calendarData. */
  get calendarWeeks(): CalendarDay[][] {
    const todayStr = this.today.toDateString();
    const first    = new Date(this.viewYear, this.viewMonth - 1, 1);
    const lastDay  = new Date(this.viewYear, this.viewMonth, 0).getDate();
    const startDow = first.getDay();

    const visitMap = new Map<string, VisitCalendarDayDto>(
      this.calendarData.map(d => [d.date, d])
    );

    const blank = (date: Date): CalendarDay => ({
      date, inMonth: false, isToday: false, visitInfo: null,
      isHoliday: false, holidayName: null, hasConflict: false,
    });

    const cells: CalendarDay[] = [];
    const prevLast = new Date(this.viewYear, this.viewMonth - 1, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      cells.push(blank(new Date(this.viewYear, this.viewMonth - 2, prevLast - i)));
    }
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(this.viewYear, this.viewMonth - 1, d);
      const info = visitMap.get(this.toIso(date)) ?? null;
      cells.push({
        date, inMonth: true,
        isToday: date.toDateString() === todayStr,
        // A holiday-only day still arrives with count 0 — treat it as an empty cell
        // for visit purposes so no "0" badge is drawn.
        visitInfo: info && info.count > 0 ? info : null,
        isHoliday:   !!info?.isHoliday,
        holidayName: info?.holidayName ?? null,
        hasConflict: !!info?.isHoliday && (info?.count ?? 0) > 0,
      });
    }
    let trail = 1;
    while (cells.length % 7 !== 0) {
      cells.push(blank(new Date(this.viewYear, this.viewMonth, trail++)));
    }

    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }

  isSelected(day: CalendarDay): boolean {
    return day.inMonth && this.toIso(day.date) === this.selectedDate;
  }

  /** True when any day in the displayed month is a holiday. Drives the legend. */
  get hasAnyHoliday(): boolean {
    return this.showHolidays && this.calendarData.some(d => d.isHoliday);
  }

  /** Tooltip text for a cell — holiday name and/or conflict warning. */
  dayTitle(day: CalendarDay): string {
    if (!day.inMonth) return '';
    const parts: string[] = [];
    if (day.holidayName) parts.push(`Holiday: ${day.holidayName}`);
    if (day.hasConflict) {
      const n = day.visitInfo?.count ?? 0;
      parts.push(`${n} visit${n === 1 ? '' : 's'} scheduled on this holiday`);
    }
    return parts.join(' — ');
  }

  onPrev(): void { this.prevMonth.emit(); }
  onNext(): void { this.nextMonth.emit(); }

  onSelect(day: CalendarDay): void {
    if (!day.inMonth) return;
    this.daySelected.emit(this.toIso(day.date));
  }

  private toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
}
