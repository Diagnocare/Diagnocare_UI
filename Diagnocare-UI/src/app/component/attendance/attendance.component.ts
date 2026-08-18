import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError, map } from 'rxjs/operators';
import { isActiveByDate } from 'src/app/shared/member-utils';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { UnsavedChangesModalComponent } from 'src/app/shared/unsaved-changes-modal/unsaved-changes-modal.component';
import { UnsavedChangesModalService } from 'src/app/shared/unsaved-changes-modal/unsaved-changes-modal.service';
import { AttendanceService } from 'src/app/services/attendanceServices/attendance.service';
import { HolidayService } from 'src/app/services/holidayServices/holiday.service';
import { HolidayDTO } from 'src/app/models/holiday/holiday.dto';
import {
  AttendanceStatus,
  AttendanceRecordDTO,
  StatusConfig,
  ATTENDANCE_STATUS_MAP,
  STATUS_LIST,
  STATUS_CYCLE,
  mapBackendStatus,
  mapStatusToBackend,
} from 'src/app/models/attendance/attendance-record.dto';
import { WeeklyAttendanceResponseDTO } from 'src/app/models/attendance/user-weekly-attendance.dto';

// ── Internal grid types ───────────────────────────────────────────────────────

interface AttendanceCell {
  attendanceId:   number;
  status:         AttendanceStatus;
  originalStatus: AttendanceStatus;
  isFuture:    boolean;
  isToday:     boolean;
  isLocked:    boolean;
  isDirty:     boolean;
  isHoliday:   boolean;   // true when the date falls on a registered holiday
  holidayName: string;    // display name of the holiday, e.g. 'Diwali'
  dateStr:     string;    // ISO 'YYYY-MM-DD' — lets helpers re-verify against holidayDates at render time
}

interface AttendanceRow {
  userId:        number;
  fullName:      string;
  typeUserId:    number;
  deactivatedAt: string | null;
  cells:         AttendanceCell[];
}

@Component({
  selector: 'app-attendance',
  templateUrl: './attendance.component.html',
  styleUrls: ['./attendance.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, UnsavedChangesModalComponent],
  providers: [DatePipe],
})
export class AttendanceComponent implements OnInit, OnDestroy {

  // ── Enum / config exposed to template ─────────────────────────────────────
  readonly AttendanceStatus = AttendanceStatus;
  readonly statusMap: { [key in AttendanceStatus]: StatusConfig } = ATTENDANCE_STATUS_MAP;
  readonly statusList: StatusConfig[] = STATUS_LIST;

  // ── Inactive toggle ────────────────────────────────────────────────────────
  showInactive = false;

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    // No reload needed — all users are already in this.rows.
    // displayRows re-computes from them on every change.
    this.recalcTotals();
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  viewMode: 'weekly' | 'monthly' = 'weekly';

  // ── Spinner ────────────────────────────────────────────────────────────────
  isLoading      = false;
  isSaving       = false;
  spinnerMessage = 'Loading attendance…';

  // ── Weekly navigation state ────────────────────────────────────────────────
  weekMonday = '';

  // ── Monthly navigation state ───────────────────────────────────────────────
  currentYear  = 0;
  currentMonth = 0;   // 1-indexed

  // ── Fortnight filter (monthly view only) ──────────────────────────────────
  /** Controls which fortnight is visible. Auto-selects 2nd when today is after the 15th. */
  selectedFortnight: '1' | '2' = '1';

  get showFortnight1(): boolean { return this.selectedFortnight === '1'; }
  get showFortnight2(): boolean { return this.selectedFortnight === '2'; }

  /**
   * Returns '2' when the currently displayed month is the current month AND today is past the 15th,
   * otherwise returns '1'. Used as the smart default whenever the fortnight resets.
   */
  private defaultFortnight(): '1' | '2' {
    const isCurrentMonth =
      this.currentYear  === this.today.getFullYear() &&
      this.currentMonth === this.today.getMonth() + 1;
    return (isCurrentMonth && this.today.getDate() > 15) ? '2' : '1';
  }

  // ── Shared period columns ──────────────────────────────────────────────────
  /** Date for each column — 7 in weekly mode, 28-31 in monthly mode. */
  columnDates: Date[] = [];

  // ── Grid data ──────────────────────────────────────────────────────────────
  rows: AttendanceRow[] = [];

  get dirtyCount(): number {
    return this.rows.reduce((sum, r) => sum + r.cells.filter(c => c.isDirty).length, 0);
  }

  /** Per-column status totals — recalculated after every mutation and after user filter changes. */
  dayTotals: { [status: string]: number }[] = [];

  // ── Role filter ────────────────────────────────────────────────────────────
  roleFilter: 'all' | 'doctor' | 'collection-boy' | 'other' = 'other';

  setRoleFilter(f: 'all' | 'doctor' | 'collection-boy' | 'other'): void {
    this.roleFilter     = f;
    this.selectedUserId = null;   // reset individual user selection when role changes
    this.recalcTotals();
  }

  /** True when the row belongs to a deactivated (inactive) staff member. */
  isInactiveRow(row: AttendanceRow): boolean {
    return !isActiveByDate(row.deactivatedAt);
  }

  roleLabel(typeUserId: number): string {
    switch (typeUserId) {
      case 1: return 'User';
      case 2: return 'Assistant';
      case 3: return 'Admin';
      case 5: return 'Collection Boy';
      case 6: return 'Doctor';
      default: return '';
    }
  }

  roleFilteredRows(): AttendanceRow[] {
    if (this.roleFilter === 'all')            return this.rows;
    if (this.roleFilter === 'doctor')         return this.rows.filter(r => r.typeUserId === 6);
    if (this.roleFilter === 'collection-boy') return this.rows.filter(r => r.typeUserId === 5);
    // 'other' = User(1), Assistant(2), Admin(3)
    return this.rows.filter(r => [1, 2, 3].includes(r.typeUserId));
  }

  // ── User filter ────────────────────────────────────────────────────────────
  /** All unique users from the last API response. Drives the filter dropdown. */
  allUsers: { userId: number; fullName: string; typeUserId: number }[] = [];
  selectedUserId: number | null = null;

  /** Users visible in the dropdown — scoped to the active role filter. */
  get roleFilteredUserOptions(): { userId: number; fullName: string; typeUserId: number }[] {
    if (this.roleFilter === 'all')            return this.allUsers;
    if (this.roleFilter === 'doctor')         return this.allUsers.filter(u => u.typeUserId === 6);
    if (this.roleFilter === 'collection-boy') return this.allUsers.filter(u => u.typeUserId === 5);
    return this.allUsers.filter(u => [1, 2, 3].includes(u.typeUserId));
  }

  /** Rows currently visible in the grid — role filter, active/inactive filter, optional user filter. */
  get displayRows(): AttendanceRow[] {
    let rows = this.roleFilteredRows();
    if (!this.showInactive) rows = rows.filter(r => isActiveByDate(r.deactivatedAt));
    if (this.selectedUserId !== null) rows = rows.filter(r => r.userId === this.selectedUserId);
    return rows;
  }

  // ── Holiday data ───────────────────────────────────────────────────────────
  /** ISO date strings of all holidays in the currently displayed period's year(s). */
  holidayDates = new Set<string>();
  /** Maps ISO date string → holiday name for tooltip display. */
  holidayNames = new Map<string, string>();

  // ── Date helpers ───────────────────────────────────────────────────────────
  today            = new Date();
  private destroy$ = new Subject<void>();

  readonly DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  /**
   * Dates strictly before this are read-only.
   * Set once on init: Monday of the week before the current one.
   */
  editCutoff!: Date;

  constructor(
    private attendanceSvc: AttendanceService,
    private holidaySvc:    HolidayService,
    private datePipe:      DatePipe,
    private unsavedModalSvc: UnsavedChangesModalService
  ) {}

  ngOnInit(): void {
    this.today.setHours(0, 0, 0, 0);
    this.editCutoff = this.calcEditCutoff();
    this.jumpToWeek(0);
  }

  // ── Edit cutoff ────────────────────────────────────────────────────────────

  private calcEditCutoff(): Date {
    const dow = this.today.getDay();
    const thisMonday = new Date(this.today);
    thisMonday.setDate(this.today.getDate() + (dow === 0 ? -6 : 1 - dow));
    thisMonday.setHours(0, 0, 0, 0);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(thisMonday.getDate() - 7);
    return prevMonday;
  }

  // ── View switching ─────────────────────────────────────────────────────────

  switchView(mode: 'weekly' | 'monthly'): void {
    if (mode === this.viewMode) return;
    if (this.dirtyCount > 0) {
      this.unsavedModalSvc
        .prompt({ changeCount: this.dirtyCount, context: 'before switching view' })
        .pipe(takeUntil(this.destroy$))
        .subscribe(result => {
          if (result === 'save')    { this.performSave(() => this.applyViewSwitch(mode)); }
          if (result === 'discard') { this.discardChanges(); this.applyViewSwitch(mode); }
          // 'cancel' — stay on current view
        });
    } else {
      this.applyViewSwitch(mode);
    }
  }

  private applyViewSwitch(mode: 'weekly' | 'monthly'): void {
    this.viewMode = mode;
    if (mode === 'weekly') {
      this.selectedFortnight = '1';
      this.jumpToWeek(0);
    } else {
      this.currentYear  = this.today.getFullYear();
      this.currentMonth = this.today.getMonth() + 1;
      // Smart default: show 2nd fortnight when today is past the 15th
      this.selectedFortnight = this.defaultFortnight();
      this.loadMonthlyData();
    }
  }

  // ── Period navigation (delegates to weekly / monthly) ─────────────────────

  prevPeriod(): void {
    if (this.viewMode === 'weekly') {
      const mon = this.parseIso(this.weekMonday);
      mon.setDate(mon.getDate() - 7);
      this.requestWeekNav(this.toIso(mon));
    } else {
      let m = this.currentMonth - 1;
      let y = this.currentYear;
      if (m < 1) { m = 12; y--; }
      this.requestMonthNav(y, m);
    }
  }

  nextPeriod(): void {
    if (this.isCurrentPeriod) return;
    if (this.viewMode === 'weekly') {
      const mon = this.parseIso(this.weekMonday);
      mon.setDate(mon.getDate() + 7);
      this.requestWeekNav(this.toIso(mon));
    } else {
      let m = this.currentMonth + 1;
      let y = this.currentYear;
      if (m > 12) { m = 1; y++; }
      this.requestMonthNav(y, m);
    }
  }

  /** True when the displayed period is the current one — disables the Next button. */
  get isCurrentPeriod(): boolean {
    if (this.viewMode === 'weekly') {
      const next = this.parseIso(this.weekMonday);
      next.setDate(next.getDate() + 7);
      return next > this.today;
    }
    // Monthly: disable next when on or past the current month
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

  private requestWeekNav(targetMonday: string): void {
    this.withUnsavedGuard(
      'for this week',
      () => this.applyWeekNav(targetMonday),
    );
  }

  private applyWeekNav(targetMonday: string): void {
    this.weekMonday = targetMonday;
    this.buildWeekColumns(this.parseIso(targetMonday));
    this.loadWeeklyData();
  }

  // ── Monthly navigation ─────────────────────────────────────────────────────

  private requestMonthNav(year: number, month: number): void {
    this.withUnsavedGuard(
      'for this month',
      () => this.applyMonthNav(year, month),
    );
  }

  private applyMonthNav(year: number, month: number): void {
    this.currentYear  = year;
    this.currentMonth = month;
    // Smart default: show 2nd fortnight when navigating to the current month past the 15th
    this.selectedFortnight = this.defaultFortnight();
    this.loadMonthlyData();
  }

  // ── Unsaved-changes guard (shared) ─────────────────────────────────────────

  private withUnsavedGuard(context: string, onProceed: () => void): void {
    if (this.dirtyCount > 0) {
      this.unsavedModalSvc
        .prompt({ changeCount: this.dirtyCount, context })
        .pipe(takeUntil(this.destroy$))
        .subscribe(result => {
          if (result === 'save')    { this.performSave(onProceed); }
          if (result === 'discard') { this.discardChanges(); onProceed(); }
        });
    } else {
      onProceed();
    }
  }

  private discardChanges(): void {
    this.rows.forEach(row =>
      row.cells.forEach(cell => {
        if (cell.isDirty) { cell.status = cell.originalStatus; cell.isDirty = false; }
      })
    );
    this.recalcTotals();
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

    // A week may span two calendar years (e.g. last days of Dec / first days of Jan)
    const years = [...new Set(this.columnDates.map(d => d.getFullYear()))];

    forkJoin({
      attendance: this.attendanceSvc.getWeeklyAttendance(this.weekMonday),
      holidays:   this.fetchHolidaysForYears(years),
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ attendance, holidays }) => {
          this.applyHolidays(holidays);
          this.buildGrid(attendance);
          this.recalcTotals();
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
      attendance: this.attendanceSvc.getMonthlyAttendance(this.currentYear, this.currentMonth),
      holidays:   this.fetchHolidaysForYears([this.currentYear]),
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ attendance, holidays }) => {
          this.applyHolidays(holidays);
          this.buildGrid(attendance);
          this.recalcTotals();
          this.isLoading = false;
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isLoading = false;
        },
      });
  }

  /** Fetches holidays for one or more years, merging results into a flat array. Errors are swallowed gracefully. */
  private fetchHolidaysForYears(years: number[]): import('rxjs').Observable<HolidayDTO[]> {
    if (!years.length) return of([]);
    return forkJoin(
      years.map(y => this.holidaySvc.getByYear(y).pipe(catchError(() => of([] as HolidayDTO[]))))
    ).pipe(map(results => ([] as HolidayDTO[]).concat(...results)));
  }

  /** Populates holidayDates and holidayNames from the fetched holiday list. */
  private applyHolidays(holidays: HolidayDTO[]): void {
    this.holidayDates = new Set(holidays.map(h => h.holidayDate));
    this.holidayNames = new Map(holidays.map(h => [h.holidayDate, h.holidayName]));
  }

  /** Returns true when the given date is a registered holiday — used from the template. */
  isHolidayDate(date: Date): boolean {
    return this.holidayDates.has(this.toIso(date));
  }

  /** Returns the holiday name for a given date — used from the template for tooltips. */
  getHolidayName(date: Date): string {
    return this.holidayNames.get(this.toIso(date)) ?? 'Holiday';
  }

  // ── Grid construction ──────────────────────────────────────────────────────

  private buildGrid(response: WeeklyAttendanceResponseDTO): void {
    // Keep allUsers in sync for the filter dropdown; preserve selection if user still present
    this.allUsers = response.rows.map(r => ({ userId: r.userId, fullName: r.fullName, typeUserId: r.typeUserId ?? 0 }));
    if (this.selectedUserId !== null &&
        !this.allUsers.some(u => u.userId === this.selectedUserId)) {
      this.selectedUserId = null;
    }

    this.rows = response.rows.map(u => {
      const cells: AttendanceCell[] = this.columnDates.map(date => {
        const dateStr = this.toIso(date);
        const dayRec  = u.days[dateStr] ?? null;
        const future  = date > this.today;
        const locked  = !future && date < this.editCutoff;
        const holiday = this.holidayDates.has(dateStr);
        const loaded  = (future || holiday) ? AttendanceStatus.None : mapBackendStatus(dayRec?.status);
        return {
          attendanceId:   dayRec?.attendanceId ?? 0,
          status:         loaded,
          originalStatus: loaded,
          isFuture:       future,
          isLocked:       locked,
          isToday:        dateStr === this.toIso(this.today),
          isDirty:        false,
          isHoliday:      holiday,
          holidayName:    this.holidayNames.get(dateStr) ?? '',
          dateStr,
        };
      });
      return { userId: u.userId, fullName: u.fullName, typeUserId: u.typeUserId ?? 0, deactivatedAt: u.deactivatedAt ?? null, cells };
    });
  }

  // ── Cell interaction ───────────────────────────────────────────────────────

  cycleStatus(row: AttendanceRow, cellIdx: number): void {
    const cell = row.cells[cellIdx];
    // Double-guard: check both the per-cell flag (set at build time) and the
    // live holidayDates Set (same source the column header uses), so holidays
    // are always blocked even if the cell flag somehow didn't get stamped.
    if (cell.isFuture || cell.isLocked || cell.isHoliday || this.isHolidayDate(this.columnDates[cellIdx])) return;
    const idx   = STATUS_CYCLE.indexOf(cell.status);
    cell.status  = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    cell.isDirty = cell.status !== cell.originalStatus;
    this.recalcTotals();
  }

  markColumn(colIdx: number, status: AttendanceStatus): void {
    this.displayRows.forEach(row => {
      const cell = row.cells[colIdx];
      if (!cell.isFuture && !cell.isLocked && !this.isCellHoliday(cell)) {
        cell.status  = status;
        cell.isDirty = cell.status !== cell.originalStatus;
      }
    });
    this.recalcTotals();
  }

  clearColumn(colIdx: number): void {
    this.displayRows.forEach(row => {
      const cell = row.cells[colIdx];
      if (!cell.isFuture && !cell.isLocked && !this.isCellHoliday(cell)) {
        cell.status  = AttendanceStatus.None;
        cell.isDirty = cell.status !== cell.originalStatus;
      }
    });
    this.recalcTotals();
  }

  clearAll(): void {
    this.rows.forEach(row =>
      row.cells.forEach(cell => {
        if (!cell.isFuture && !cell.isLocked && !this.isCellHoliday(cell)) {
          cell.status  = AttendanceStatus.None;
          cell.isDirty = cell.status !== cell.originalStatus;
        }
      })
    );
    this.recalcTotals();
  }
  // ── Totals ─────────────────────────────────────────────────────────────────

  recalcTotals(): void {
    this.dayTotals = this.columnDates.map((_, col) => {
      const totals: { [s: string]: number } = {};
      this.statusList.forEach(s => (totals[s.value] = 0));
      totals[AttendanceStatus.None] = 0;
      this.displayRows.forEach(r => {
        const s = r.cells[col].status;
        if (totals[s] !== undefined) totals[s]++;
      });
      return totals;
    });
  }

  rowSummary(row: AttendanceRow): { config: StatusConfig; count: number }[] {
    return this.statusList.map(s => ({
      config: s,
      count:  row.cells.filter(c => c.status === s.value).length,
    }));
  }

  /** Per-fortnight row summary — used by the monthly split tables. */
  rowSummaryRange(row: AttendanceRow, from: number, to: number): { config: StatusConfig; count: number }[] {
    return this.statusList.map(s => ({
      config: s,
      count:  row.cells.slice(from, to).filter(c => c.status === s.value).length,
    }));
  }

  // ── Monthly fortnight helpers ──────────────────────────────────────────────

  /** Days 1–15 of the current month. */
  get fortnight1Dates(): Date[] { return this.columnDates.slice(0, 15); }

  /** Days 16–end of the current month. */
  get fortnight2Dates(): Date[] { return this.columnDates.slice(15); }

  /** Daily totals for the first fortnight. */
  get fortnight1Totals(): { [status: string]: number }[] { return this.dayTotals.slice(0, 15); }

  /** Daily totals for the second fortnight. */
  get fortnight2Totals(): { [status: string]: number }[] { return this.dayTotals.slice(15); }

  /** Last day number of the currently displayed month (e.g. 28, 30, 31). */
  get lastDayOfMonth(): number {
    return this.columnDates.length > 0
      ? this.columnDates[this.columnDates.length - 1].getDate()
      : 31;
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  saveAll(): void { this.performSave(); }

  private performSave(onSuccess?: () => void): void {
    const records: AttendanceRecordDTO[] = [];

    this.rows.forEach(row =>
      row.cells.forEach((cell, colIdx) => {
        if (cell.isDirty && cell.status !== AttendanceStatus.None) {
          records.push({
            attendanceId:   cell.attendanceId,
            userId:         row.userId,
            attendanceDate: this.toIso(this.columnDates[colIdx]),
            status:         mapStatusToBackend(cell.status),   // numeric string e.g. "1"
          });
        }
      })
    );

    if (!records.length) {
      onSuccess?.();
      return;
    }

    this.spinnerMessage = 'Saving attendance…';
    this.isSaving = true;

    this.attendanceSvc.saveBulkAttendance(records)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.rows.forEach(row =>
            row.cells.forEach(c => {
              if (c.isDirty) { c.originalStatus = c.status; c.isDirty = false; }
            })
          );
          this.isSaving = false;
          onSuccess?.();
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isSaving = false;
        },
      });
  }

  // ── Template helpers ───────────────────────────────────────────────────────

  /** Returns true if a cell is a holiday — checks the live holidayDates Set as the
   *  authoritative source (same as the column header), with cell.isHoliday as a fast-path. */
  private isCellHoliday(cell: AttendanceCell): boolean {
    return cell.isHoliday || this.holidayDates.has(cell.dateStr);
  }

  cellClass(cell: AttendanceCell): string {
    if (cell.isFuture)          return 'cell-future';
    if (this.isCellHoliday(cell)) return 'cell-holiday';
    const base = this.statusMap[cell.status]?.cssClass ?? 'cell-unmarked';
    if (cell.isLocked) return `${base} cell-locked`;
    return cell.isDirty ? `${base} cell-dirty` : base;
  }

  cellLabel(cell: AttendanceCell): string {
    if (cell.isFuture)            return '—';
    if (this.isCellHoliday(cell)) return 'H';
    return this.statusMap[cell.status]?.shortLabel ?? '·';
  }

  cellTitle(cell: AttendanceCell): string {
    if (cell.isFuture)  return 'Future date — cannot be marked';
    if (this.isCellHoliday(cell)) {
      const name = cell.holidayName || this.holidayNames.get(cell.dateStr);
      return name ? `${name} — Holiday (read-only)` : 'Holiday — read-only';
    }
    const cfg = this.statusMap[cell.status];
    if (cell.isLocked) {
      return cfg?.value !== AttendanceStatus.None
        ? `${cfg.label} — locked (only last 2 weeks editable)`
        : 'Not marked — locked (only last 2 weeks editable)';
    }
    return cfg?.value !== AttendanceStatus.None
      ? `${cfg.label} — click to change`
      : 'Not marked — click to set status';
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
