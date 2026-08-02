import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError, map } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { AttendanceService } from 'src/app/services/attendanceServices/attendance.service';
import { HolidayService } from 'src/app/services/holidayServices/holiday.service';
import { HolidayDTO } from 'src/app/models/holiday/holiday.dto';
import {
  AttendanceStatus,
  StatusConfig,
  ATTENDANCE_STATUS_MAP,
  STATUS_LIST,
  mapBackendStatus,
} from 'src/app/models/attendance/attendance-record.dto';
import { WeeklyAttendanceResponseDTO } from 'src/app/models/attendance/user-weekly-attendance.dto';

// ── Internal grid types ───────────────────────────────────────────────────────

interface AttendanceCell {
  attendanceId: number;
  status:       AttendanceStatus;
  isFuture:     boolean;
  isToday:      boolean;
  isHoliday:    boolean;
  holidayName:  string;
  dateStr:      string;
}

interface AttendanceRow {
  userId:   number;
  fullName: string;
  cells:    AttendanceCell[];
}

@Component({
  selector: 'app-my-attendance',
  templateUrl: './my-attendance.component.html',
  styleUrls: ['./my-attendance.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LoadingSpinnerComponent],
  providers: [DatePipe],
})
export class MyAttendanceComponent implements OnInit, OnDestroy {

  // ── Enum / config exposed to template ─────────────────────────────────────
  readonly AttendanceStatus = AttendanceStatus;
  readonly statusMap: { [key in AttendanceStatus]: StatusConfig } = ATTENDANCE_STATUS_MAP;
  readonly statusList: StatusConfig[] = STATUS_LIST;

  // ── Spinner ────────────────────────────────────────────────────────────────
  isLoading      = false;
  spinnerMessage = 'Loading attendance…';

  // ── View mode ──────────────────────────────────────────────────────────────
  viewMode: 'weekly' | 'monthly' = 'weekly';

  // ── Weekly navigation state ────────────────────────────────────────────────
  weekMonday = '';

  // ── Monthly navigation state ───────────────────────────────────────────────
  currentYear  = 0;
  currentMonth = 0;   // 1-indexed

  // ── Fortnight filter (monthly view only) ──────────────────────────────────
  selectedFortnight: '1' | '2' = '1';

  get showFortnight1(): boolean { return this.selectedFortnight === '1'; }
  get showFortnight2(): boolean { return this.selectedFortnight === '2'; }

  private defaultFortnight(): '1' | '2' {
    const isCurrentMonth =
      this.currentYear  === this.today.getFullYear() &&
      this.currentMonth === this.today.getMonth() + 1;
    return (isCurrentMonth && this.today.getDate() > 15) ? '2' : '1';
  }

  // ── Shared period columns ──────────────────────────────────────────────────
  columnDates: Date[] = [];

  // ── Grid data ──────────────────────────────────────────────────────────────
  row: AttendanceRow | null = null;

  // ── Holiday data ───────────────────────────────────────────────────────────
  holidayDates = new Set<string>();
  holidayNames = new Map<string, string>();

  // ── Date helpers ───────────────────────────────────────────────────────────
  today            = new Date();
  private destroy$ = new Subject<void>();

  // ── Monthly fortnight helpers ──────────────────────────────────────────────
  get fortnight1Dates(): Date[] { return this.columnDates.slice(0, 15); }
  get fortnight2Dates(): Date[] { return this.columnDates.slice(15); }

  get lastDayOfMonth(): number {
    return this.columnDates.length > 0
      ? this.columnDates[this.columnDates.length - 1].getDate()
      : 31;
  }

  constructor(
    private attendanceSvc: AttendanceService,
    private holidaySvc:    HolidayService,
    private toastr:        ToastrService,
    private datePipe:      DatePipe,
    private router:        Router,
  ) {}

  /**
   * Open the New Attendance Request form pre-filled with the clicked day's date.
   * Future dates and holidays can't be corrected, so they're ignored.
   */
  requestCorrection(cell: AttendanceCell): void {
    if (!cell || cell.isFuture || cell.isHoliday) return;
    this.router.navigate(['/attendance-requests/new'], { queryParams: { date: cell.dateStr } });
  }

  ngOnInit(): void {
    this.today.setHours(0, 0, 0, 0);
    this.jumpToWeek(0);
  }

  // ── View switching ─────────────────────────────────────────────────────────

  switchView(mode: 'weekly' | 'monthly'): void {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    if (mode === 'weekly') {
      this.selectedFortnight = '1';
      this.jumpToWeek(0);
    } else {
      this.currentYear  = this.today.getFullYear();
      this.currentMonth = this.today.getMonth() + 1;
      this.selectedFortnight = this.defaultFortnight();
      this.loadMonthlyData();
    }
  }

  // ── Period navigation ──────────────────────────────────────────────────────

  prevPeriod(): void {
    if (this.viewMode === 'weekly') {
      const mon = this.parseIso(this.weekMonday);
      mon.setDate(mon.getDate() - 7);
      this.weekMonday = this.toIso(mon);
      this.buildWeekColumns(mon);
      this.loadWeeklyData();
    } else {
      let m = this.currentMonth - 1;
      let y = this.currentYear;
      if (m < 1) { m = 12; y--; }
      this.currentYear  = y;
      this.currentMonth = m;
      this.selectedFortnight = this.defaultFortnight();
      this.loadMonthlyData();
    }
  }

  nextPeriod(): void {
    if (this.isCurrentPeriod) return;
    if (this.viewMode === 'weekly') {
      const mon = this.parseIso(this.weekMonday);
      mon.setDate(mon.getDate() + 7);
      this.weekMonday = this.toIso(mon);
      this.buildWeekColumns(mon);
      this.loadWeeklyData();
    } else {
      let m = this.currentMonth + 1;
      let y = this.currentYear;
      if (m > 12) { m = 1; y++; }
      this.currentYear  = y;
      this.currentMonth = m;
      this.selectedFortnight = this.defaultFortnight();
      this.loadMonthlyData();
    }
  }

  get isCurrentPeriod(): boolean {
    if (this.viewMode === 'weekly') {
      const next = this.parseIso(this.weekMonday);
      next.setDate(next.getDate() + 7);
      return next > this.today;
    }
    return (
      this.currentYear > this.today.getFullYear() ||
      (this.currentYear === this.today.getFullYear() &&
       this.currentMonth >= this.today.getMonth() + 1)
    );
  }

  // ── Weekly navigation ──────────────────────────────────────────────────────

  private jumpToWeek(weekOffset: number): void {
    const d   = new Date(this.today);
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    this.weekMonday = this.toIso(d);
    this.buildWeekColumns(d);
    this.loadWeeklyData();
  }

  // ── Period label ───────────────────────────────────────────────────────────

  get periodLabel(): string {
    if (this.viewMode === 'weekly') {
      if (!this.columnDates.length) return '';
      const fmt  = (d: Date) => this.datePipe.transform(d, 'EEE, dd MMM') ?? '';
      const year = this.columnDates[6].getFullYear();
      return `${fmt(this.columnDates[0])} – ${fmt(this.columnDates[6])} ${year}`;
    }
    const d = new Date(this.currentYear, this.currentMonth - 1, 1);
    return this.datePipe.transform(d, 'MMMM yyyy') ?? '';
  }

  // ── Column-date builders ───────────────────────────────────────────────────

  private buildWeekColumns(monday: Date): void {
    this.columnDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }

  private buildMonthColumns(year: number, month: number): void {
    const daysInMonth = new Date(year, month, 0).getDate();
    this.columnDates = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month - 1, i + 1);
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  private loadWeeklyData(): void {
    this.spinnerMessage = 'Loading attendance…';
    this.isLoading = true;

    const years = [...new Set(this.columnDates.map(d => d.getFullYear()))];

    forkJoin({
      attendance: this.attendanceSvc.getMyWeeklyAttendance(this.weekMonday),
      holidays:   this.fetchHolidaysForYears(years),
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ attendance, holidays }) => {
          this.applyHolidays(holidays);
          this.buildGrid(attendance);
          this.isLoading = false;
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isLoading = false;
        },
      });
  }

  private loadMonthlyData(): void {
    this.spinnerMessage = 'Loading attendance…';
    this.isLoading = true;
    this.buildMonthColumns(this.currentYear, this.currentMonth);

    forkJoin({
      attendance: this.attendanceSvc.getMyMonthlyAttendance(this.currentYear, this.currentMonth),
      holidays:   this.fetchHolidaysForYears([this.currentYear]),
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ attendance, holidays }) => {
          this.applyHolidays(holidays);
          this.buildGrid(attendance);
          this.isLoading = false;
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isLoading = false;
        },
      });
  }

  private fetchHolidaysForYears(years: number[]): import('rxjs').Observable<HolidayDTO[]> {
    if (!years.length) return of([]);
    return forkJoin(
      years.map(y => this.holidaySvc.getByYear(y).pipe(catchError(() => of([] as HolidayDTO[]))))
    ).pipe(map(results => ([] as HolidayDTO[]).concat(...results)));
  }

  private applyHolidays(holidays: HolidayDTO[]): void {
    this.holidayDates = new Set(holidays.map(h => h.holidayDate));
    this.holidayNames = new Map(holidays.map(h => [h.holidayDate, h.holidayName]));
  }

  isHolidayDate(date: Date): boolean {
    return this.holidayDates.has(this.toIso(date));
  }

  getHolidayName(date: Date): string {
    return this.holidayNames.get(this.toIso(date)) ?? 'Holiday';
  }

  // ── Grid construction ──────────────────────────────────────────────────────

  private buildGrid(response: WeeklyAttendanceResponseDTO): void {
    if (!response.rows?.length) {
      this.row = null;
      return;
    }

    const u = response.rows[0];
    const cells: AttendanceCell[] = this.columnDates.map(date => {
      const dateStr = this.toIso(date);
      const dayRec  = u.days[dateStr] ?? null;
      const future  = date > this.today;
      const holiday = this.holidayDates.has(dateStr);
      const loaded  = (future || holiday) ? AttendanceStatus.None : mapBackendStatus(dayRec?.status);
      return {
        attendanceId: dayRec?.attendanceId ?? 0,
        status:       loaded,
        isFuture:     future,
        isToday:      dateStr === this.toIso(this.today),
        isHoliday:    holiday,
        holidayName:  this.holidayNames.get(dateStr) ?? '',
        dateStr,
      };
    });

    this.row = { userId: u.userId, fullName: u.fullName, cells };
  }

  // ── Cell display helpers ───────────────────────────────────────────────────

  cellClass(cell: AttendanceCell): string {
    if (cell.isFuture)  return 'cell-future';
    if (cell.isHoliday) return 'cell-holiday';
    return this.statusMap[cell.status]?.cssClass ?? 'cell-unmarked';
  }

  cellLabel(cell: AttendanceCell): string {
    if (cell.isFuture)  return '—';
    if (cell.isHoliday) return 'H';
    return this.statusMap[cell.status]?.shortLabel ?? '·';
  }

  cellTitle(cell: AttendanceCell): string {
    if (cell.isFuture)  return 'Future date';
    if (cell.isHoliday) {
      const name = cell.holidayName || this.holidayNames.get(cell.dateStr);
      return name ? `${name} — Holiday` : 'Holiday';
    }
    const cfg = this.statusMap[cell.status];
    return cfg?.value !== AttendanceStatus.None ? cfg.label : 'Not marked';
  }

  // ── Row summary ────────────────────────────────────────────────────────────

  rowSummaryRange(cells: AttendanceCell[], from: number, to: number): { config: StatusConfig; count: number }[] {
    return this.statusList.map(s => ({
      config: s,
      count:  cells.slice(from, to).filter(c => c.status === s.value).length,
    }));
  }

  // ── Date utilities ─────────────────────────────────────────────────────────

  private toIso(d: Date): string {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dy}`;
  }

  private parseIso(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
