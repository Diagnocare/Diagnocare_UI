import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, catchError, of } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { HolidayService } from 'src/app/services/holidayServices/holiday.service';
import { HolidayDTO, CreateHolidayDTO, UpdateHolidayDTO } from 'src/app/models/holiday/holiday.dto';
import { ActionButtonComponent } from 'src/app/shared/action-button/action-button.component';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { ConfirmModalComponent } from 'src/app/shared/confirm-modal/confirm-modal.component';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';

/** Calendar cell: one day in the monthly mini-grid. */
interface CalendarCell {
  date:    Date;
  inMonth: boolean;
  holiday: HolidayDTO | null;
}

/** One month in the full-year calendar. */
interface MonthGrid {
  name:  string;
  year:  number;
  month: number;   // 1-based
  weeks: CalendarCell[][];
}

/** One row in the bulk-add form. */
interface BulkDraft {
  holidayDate: string;
  holidayName: string;
  remark:      string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_NAMES[d.getDay()];
}

@Component({
  selector: 'app-holiday',
  templateUrl: './holiday.component.html',
  styleUrls: ['./holiday.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, DatePickerComponent, ActionButtonComponent, ConfirmModalComponent],
  providers: [DatePipe],
})
export class HolidayComponent implements OnInit, OnDestroy {

  // ── Role ───────────────────────────────────────────────────────────────────
  isAdmin = false;

  // ── Year navigation ────────────────────────────────────────────────────────
  selectedYear = new Date().getFullYear();
  readonly currentYear = new Date().getFullYear();

  // ── View mode ──────────────────────────────────────────────────────────────
  viewMode: 'calendar' | 'list' = 'calendar';

  // ── Data ───────────────────────────────────────────────────────────────────
  holidays:  HolidayDTO[] = [];
  isLoading = false;

  // ── Calendar grid ─────────────────────────────────────────────────────────
  monthGrids: MonthGrid[] = [];

  // ── Single add / edit modal ────────────────────────────────────────────────
  showModal  = false;
  isEditMode = false;
  isSaving   = false;

  /** Local draft mirrors backend field names for clean DTO construction. */
  draft: { holidayId: number; holidayDate: string; holidayName: string; remark: string } = {
    holidayId: 0, holidayDate: '', holidayName: '', remark: '',
  };

  // ── Bulk add modal ─────────────────────────────────────────────────────────
  showBulkModal  = false;
  isBulkSaving   = false;
  bulkSubmitted  = false;
  bulkDrafts: BulkDraft[] = [];

  // ── Getters ────────────────────────────────────────────────────────────────

  get minDate(): string { return `${this.selectedYear}-01-01`; }
  get maxDate(): string { return `${this.selectedYear}-12-31`; }

  get draftDayOfWeek(): string {
    return this.draft.holidayDate ? dayOfWeek(this.draft.holidayDate) : '';
  }

  get sortedHolidays(): HolidayDTO[] {
    return [...this.holidays].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
  }

  private get existingDates(): Set<string> {
    return new Set(this.holidays.map(h => h.holidayDate));
  }

  private destroy$ = new Subject<void>();

  constructor(
    private holidayService: HolidayService,
    private toastr: ToastrService,
    private confirmModal: ConfirmModalService,
    private tokenService: TokenService,
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.tokenService.isAdmin();
    this.loadHolidays();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Year navigation ────────────────────────────────────────────────────────

  prevYear(): void { this.selectedYear--; this.loadHolidays(); }

  nextYear(): void {
    if (this.selectedYear < this.currentYear + 5) { this.selectedYear++; this.loadHolidays(); }
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  loadHolidays(): void {
    this.isLoading = true;
    this.holidays  = [];
    this.holidayService.getByYear(this.selectedYear)
      .pipe(
        takeUntil(this.destroy$),
        catchError(() => of([])),   // message shown centrally by ErrorInterceptor
      )
      .subscribe(list => {
        // Fill dayOfWeek locally in case backend omits it
        this.holidays = list.map(h => ({
          ...h,
          dayOfWeek: h.dayOfWeek || dayOfWeek(h.holidayDate),
        }));
        this.buildCalendar();
        this.isLoading = false;
      });
  }

  // ── Calendar builder ───────────────────────────────────────────────────────

  private buildCalendar(): void {
    // Key the map by holidayDate (YYYY-MM-DD) for O(1) lookup per cell
    const holidayMap = new Map<string, HolidayDTO>(
      this.holidays.map(h => [h.holidayDate, h])
    );

    this.monthGrids = MONTH_NAMES.map((name, idx) => {
      const month    = idx + 1;
      const firstDay = new Date(this.selectedYear, idx, 1);
      const lastDay  = new Date(this.selectedYear, idx + 1, 0);
      const cells: CalendarCell[] = [];

      for (let i = 0; i < firstDay.getDay(); i++) {
        const d = new Date(this.selectedYear, idx, 1 - (firstDay.getDay() - i));
        cells.push({ date: d, inMonth: false, holiday: null });
      }
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const date = new Date(this.selectedYear, idx, d);
        cells.push({ date, inMonth: true, holiday: holidayMap.get(this.toIso(date)) ?? null });
      }
      const remaining = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
      for (let i = 1; i <= remaining; i++) {
        cells.push({ date: new Date(this.selectedYear, idx + 1, i), inMonth: false, holiday: null });
      }

      const weeks: CalendarCell[][] = [];
      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
      return { name, year: this.selectedYear, month, weeks };
    });
  }

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // ── Single add / edit modal ────────────────────────────────────────────────

  openAdd(prefillDate?: string): void {
    this.isEditMode = false;
    this.draft = {
      holidayId:   0,
      holidayDate: prefillDate ?? `${this.selectedYear}-01-01`,
      holidayName: '',
      remark:      '',
    };
    this.showModal = true;
  }

  openEdit(h: HolidayDTO): void {
    this.isEditMode = true;
    this.draft = {
      holidayId:   h.holidayId,
      holidayDate: h.holidayDate,
      holidayName: h.holidayName,
      remark:      h.remark ?? '',
    };
    this.showModal = true;
  }

  closeModal(): void { this.showModal = false; }

  saveHoliday(): void {
    if (!this.draft.holidayDate || !this.draft.holidayName.trim()) {
      this.toastr.warning('Date and Holiday Name are required');
      return;
    }
    this.isSaving = true;

    if (this.isEditMode) {
      const dto: UpdateHolidayDTO = {
        holidayId:   this.draft.holidayId,
        holidayDate: this.draft.holidayDate,
        holidayName: this.draft.holidayName.trim(),
        remark:      this.draft.remark.trim(),
      };
      this.holidayService.update(dto).pipe(takeUntil(this.destroy$)).subscribe({
        next:  () => { this.toastr.success('Holiday updated'); this.isSaving = false; this.closeModal(); this.loadHolidays(); },
        error: () => { this.isSaving = false; },   // message shown centrally by ErrorInterceptor
      });
    } else {
      const dto: CreateHolidayDTO = {
        holidayDate: this.draft.holidayDate,
        holidayName: this.draft.holidayName.trim(),
        remark:      this.draft.remark.trim(),
      };
      this.holidayService.add(dto).pipe(takeUntil(this.destroy$)).subscribe({
        next:  () => { this.toastr.success('Holiday added'); this.isSaving = false; this.closeModal(); this.loadHolidays(); },
        error: () => { this.isSaving = false; },   // message shown centrally by ErrorInterceptor
      });
    }
  }

  // ── Bulk add modal ─────────────────────────────────────────────────────────

  openBulkAdd(): void {
    this.showBulkModal = true;
    this.isBulkSaving  = false;
    this.bulkSubmitted = false;
    this.bulkDrafts    = [this.emptyBulkRow()];
  }

  closeBulkModal(): void { this.showBulkModal = false; }

  addBulkRow(): void { this.bulkDrafts.push(this.emptyBulkRow()); }

  removeBulkRow(index: number): void {
    if (this.bulkDrafts.length > 1) this.bulkDrafts.splice(index, 1);
  }

  bulkDayOfWeek(date: string): string {
    return date ? dayOfWeek(date) : '';
  }

  isBulkRowValid(row: BulkDraft): boolean {
    return !!row.holidayDate && !!row.holidayName.trim();
  }

  isBulkDateDuplicate(row: BulkDraft, rowIndex: number): boolean {
    if (!row.holidayDate) return false;
    const batchDupe    = this.bulkDrafts.some((r, i) => i !== rowIndex && r.holidayDate === row.holidayDate);
    const alreadySaved = this.existingDates.has(row.holidayDate);
    return batchDupe || alreadySaved;
  }

  saveBulkHolidays(): void {
    this.bulkSubmitted = true;

    if (this.bulkDrafts.some(r => !this.isBulkRowValid(r))) {
      this.toastr.warning('Please fill Date and Holiday Name for all rows');
      return;
    }
    if (this.bulkDrafts.some((r, i) => this.isBulkDateDuplicate(r, i))) {
      this.toastr.warning('Duplicate dates detected — each holiday must have a unique date');
      return;
    }

    this.isBulkSaving = true;
    const dtos: CreateHolidayDTO[] = this.bulkDrafts.map(r => ({
      holidayDate: r.holidayDate,
      holidayName: r.holidayName.trim(),
      remark:      r.remark.trim(),
    }));

    this.holidayService.addBulk(dtos).pipe(takeUntil(this.destroy$)).subscribe({
      next: results => {
        const saved  = results.filter(r => r !== null).length;
        const failed = results.length - saved;
        if (saved  > 0) this.toastr.success(`${saved} holiday${saved   !== 1 ? 's' : ''} added successfully`);
        if (failed > 0) this.toastr.error(`${failed} holiday${failed  !== 1 ? 's' : ''} could not be saved`);
        this.isBulkSaving = false;
        this.closeBulkModal();
        this.loadHolidays();
      },
      error: () => { this.isBulkSaving = false; },   // message shown centrally by ErrorInterceptor
    });
  }

  private emptyBulkRow(): BulkDraft {
    return { holidayDate: `${this.selectedYear}-01-01`, holidayName: '', remark: '' };
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async deleteHoliday(h: HolidayDTO): Promise<void> {
    const confirmed = await this.confirmModal.confirm({
      title:       'Delete Holiday',
      message:     `Delete "${h.holidayName}" (${this.formatDate(h.holidayDate)})?`,
      confirmText: 'Yes, Delete',
      cancelText:  'Cancel',
    });
    if (!confirmed) return;

    this.holidayService.delete(h.holidayId).pipe(takeUntil(this.destroy$)).subscribe({
      next:  () => { this.toastr.success('Holiday deleted'); this.loadHolidays(); },
      error: () => { /* message shown centrally by ErrorInterceptor */ },
    });
  }

  // ── Calendar cell click ────────────────────────────────────────────────────

  onCalendarCellClick(cell: CalendarCell): void {
    if (!cell.inMonth) return;
    if (cell.holiday) { if (this.isAdmin) this.openEdit(cell.holiday); return; }
    if (this.isAdmin) this.openAdd(this.toIso(cell.date));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}-${m}-${y}`;   // DD-MM-YYYY
  }

  isWeekend(date: Date): boolean { const d = date.getDay(); return d === 0 || d === 6; }

  isToday(date: Date): boolean {
    const t = new Date();
    return date.getFullYear() === t.getFullYear() &&
           date.getMonth()    === t.getMonth()    &&
           date.getDate()     === t.getDate();
  }

  countForMonth(mg: MonthGrid): number {
    return this.holidays.filter(h => parseInt(h.holidayDate.split('-')[1], 10) === mg.month).length;
  }

  trackByMonth(_i: number, g: MonthGrid): number    { return g.month; }
  trackByHoliday(_i: number, h: HolidayDTO): number  { return h.holidayId; }
  trackByIndex(i: number): number                    { return i; }
}
