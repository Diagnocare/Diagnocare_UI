import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ToastrService } from 'ngx-toastr';

import { AttendanceAdminService } from 'src/app/services/attendanceServices/attendance-admin.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { AttendanceDisplayStatus, DISPLAY_STATUS_TONE }
  from 'src/app/models/attendanceVerification/attendance-verification.model';
import {
  AUDIT_FILTER_TYPES,
  AttendanceDayRow,
  AttendanceDayView,
  AttendanceEvent,
  AttendanceEventType,
  AttendanceLocation,
  Shift,
} from 'src/app/models/attendanceVerification/attendance-admin.model';

/** One summary tile. Declared as data so the template is a loop, not nine copies. */
interface SummaryTile {
  key: string;
  label: string;
  value: number;
  tone: string;
  /** The display-status filter this tile applies when clicked, if any. */
  status: AttendanceDisplayStatus | null;
}

/**
 * One day of attendance across the whole laboratory, with the evidence behind it.
 *
 * <b>What this screen answers.</b> Not "who was present" — the existing attendance grid
 * already says that. This one answers <i>how do we know</i>: which check-ins were proved
 * by GPS and a scanned code, which were typed in by an administrator, how far from the
 * geofence each person was, and what was refused before the one that worked. That is the
 * question that matters once somebody disputes a day.
 *
 * <b>Why every employee appears, including the ones with no record.</b> An administrator
 * opens this at 10am to find out who has not turned up. A table of rows that exist would
 * show an empty space where the answer should be.
 *
 * <b>Why the summary counts ignore the filters.</b> They are computed server-side over
 * the whole roster. "3 absent" has to mean three absent — not three among whichever rows
 * a filter happens to be showing, which is the reading an administrator would take from a
 * number sitting above a filtered table.
 *
 * <b>Correction.</b> Admin and Super Admin both, matching the AttendanceCorrection policy.
 * Correcting your own attendance is refused server-side and hidden here, because the
 * value of a correction record is that somebody other than the beneficiary signed it off.
 */
@Component({
  selector: 'app-attendance-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attendance-dashboard.component.html',
  styleUrls: ['./attendance-dashboard.component.scss'],
})
export class AttendanceDashboardComponent implements OnInit {

  readonly Status = AttendanceDisplayStatus;
  readonly auditTypes = AUDIT_FILTER_TYPES;

  // ── The day ────────────────────────────────────────────────────────────────

  selectedDate = AttendanceDashboardComponent.todayIso();
  view: AttendanceDayView | null = null;
  loading = false;

  // ── Filters ────────────────────────────────────────────────────────────────

  filterLocationId: number | null = null;
  filterShiftId: number | null = null;
  filterStatus: AttendanceDisplayStatus | null = null;
  filterSearch = '';

  locations: AttendanceLocation[] = [];
  shifts: Shift[] = [];

  // ── Detail drawer ──────────────────────────────────────────────────────────

  selectedRow: AttendanceDayRow | null = null;
  drawerTab: 'trail' | 'correct' = 'trail';

  trail: AttendanceEvent[] = [];
  trailLoading = false;
  trailTotal = 0;

  correctCheckIn = '';
  correctCheckOut = '';
  correctStatus = '';
  correctRemarks = '';
  correctReason = '';
  correctSaving = false;
  correctError = '';

  private currentUserId = 0;

  constructor(
    private admin: AttendanceAdminService,
    private tokenService: TokenService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.currentUserId = Number(this.tokenService.getUserId() ?? 0);
    this.load();

    // The filter dropdowns. Failures are silent by design — a dashboard that refuses to
    // render because a dropdown could not be populated would be worse than one with an
    // empty dropdown.
    this.admin.getLocations().subscribe({ next: list => { this.locations = list; }, error: () => {} });
    this.admin.getShifts().subscribe({ next: list => { this.shifts = list; }, error: () => {} });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Loading
  // ═══════════════════════════════════════════════════════════════════════════

  load(): void {
    this.loading = true;
    this.closeDrawer();

    this.admin.getDailyView(this.selectedDate, {
      locationId: this.filterLocationId,
      shiftId: this.filterShiftId,
      status: this.filterStatus,
      search: this.filterSearch.trim() || null,
    }).subscribe({
      next: view => { this.view = view; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  shiftDay(days: number): void {
    const date = AttendanceDashboardComponent.parseIso(this.selectedDate);
    date.setDate(date.getDate() + days);
    this.selectedDate = AttendanceDashboardComponent.toIso(date);
    this.load();
  }

  goToToday(): void {
    this.selectedDate = AttendanceDashboardComponent.todayIso();
    this.load();
  }

  get isToday(): boolean {
    return this.selectedDate === AttendanceDashboardComponent.todayIso();
  }

  clearFilters(): void {
    this.filterLocationId = null;
    this.filterShiftId = null;
    this.filterStatus = null;
    this.filterSearch = '';
    this.load();
  }

  get hasFilters(): boolean {
    return this.filterLocationId !== null
      || this.filterShiftId !== null
      || this.filterStatus !== null
      || this.filterSearch.trim().length > 0;
  }

  /** Clicking a tile filters to it — and clicking it again clears the filter. */
  applyTile(tile: SummaryTile): void {
    if (tile.status === null) return;
    this.filterStatus = this.filterStatus === tile.status ? null : tile.status;
    this.load();
  }

  get tiles(): SummaryTile[] {
    const s = this.view?.summary;

    if (!s) return [];

    return [
      { key: 'total',     label: 'Employees',  value: s.totalEmployees, tone: 'neutral', status: null },
      { key: 'present',   label: 'Present',    value: s.present,    tone: 'success',   status: AttendanceDisplayStatus.Present },
      { key: 'late',      label: 'Late',       value: s.late,       tone: 'warning',   status: AttendanceDisplayStatus.Late },
      { key: 'halfDay',   label: 'Half day',   value: s.halfDay,    tone: 'warning',   status: AttendanceDisplayStatus.HalfDay },
      { key: 'incomplete', label: 'No check-out', value: s.incomplete, tone: 'warning', status: AttendanceDisplayStatus.Incomplete },
      { key: 'absent',    label: 'Absent',     value: s.absent,     tone: 'danger',    status: AttendanceDisplayStatus.Absent },
      { key: 'notMarked', label: 'Not marked', value: s.notMarked,  tone: 'neutral',   status: AttendanceDisplayStatus.NotMarked },
      { key: 'onLeave',   label: 'On leave',   value: s.onLeave,    tone: 'info',      status: AttendanceDisplayStatus.OnLeave },
      { key: 'weekOff',   label: 'Week off',   value: s.weekOff,    tone: 'neutral',   status: AttendanceDisplayStatus.WeekOff },
    ];
  }

  statusTone(status: AttendanceDisplayStatus): string {
    return DISPLAY_STATUS_TONE[status] ?? 'secondary';
  }

  /** Human minutes — "7h 20m" reads faster than "440" when scanning a column. */
  formatMinutes(minutes: number | null | undefined): string {
    if (minutes === null || minutes === undefined) return '—';
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
  }

  formatDistance(metres: number | null | undefined): string {
    if (metres === null || metres === undefined) return '—';
    return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Detail drawer
  // ═══════════════════════════════════════════════════════════════════════════

  openRow(row: AttendanceDayRow): void {
    this.selectedRow = row;
    this.drawerTab = 'trail';
    this.resetCorrection(row);
    this.loadTrail(row);
  }

  closeDrawer(): void {
    this.selectedRow = null;
    this.trail = [];
    this.trailTotal = 0;
  }

  switchDrawerTab(tab: 'trail' | 'correct'): void {
    this.drawerTab = tab;
  }

  /** Whether the correction tab is offered at all for this row. */
  get canCorrect(): boolean {
    const row = this.selectedRow;

    // No record means there is nothing to correct: the correction endpoint edits an
    // existing attendance day, it does not create one. Marking an absent day is the
    // existing attendance grid's job.
    if (!row?.attendanceId) return false;

    // Refused server-side anyway; hidden here so nobody fills in a form to be told no.
    return row.userId !== this.currentUserId;
  }

  get correctionBlockedReason(): string {
    const row = this.selectedRow;

    if (!row) return '';
    if (row.userId === this.currentUserId) {
      return 'You cannot correct your own attendance. Raise a correction request so somebody else reviews it.';
    }
    if (!row.attendanceId) {
      return 'There is no attendance record for this day yet, so there is nothing to correct. '
        + 'Mark the day in the Attendance module first.';
    }
    return '';
  }

  private loadTrail(row: AttendanceDayRow): void {
    this.trailLoading = true;

    // Scoped to this employee and this date rather than to the attendance id, on purpose:
    // the rows worth reading are usually the *refused* attempts, and a refusal that never
    // produced an attendance record carries no attendance id to filter by.
    this.admin.getAuditTrail({
      userId: row.userId,
      from: this.selectedDate,
      to: this.selectedDate,
      page: 1,
      pageSize: 100,
    }).subscribe({
      next: page => {
        this.trail = page.items;
        this.trailTotal = page.totalCount;
        this.trailLoading = false;
      },
      error: () => { this.trailLoading = false; },
    });
  }

  private resetCorrection(row: AttendanceDayRow): void {
    // Prefilled with what is already recorded, so an administrator fixing only the
    // check-out does not have to retype the check-in — and so a blank field is a
    // deliberate act rather than an oversight.
    this.correctCheckIn = AttendanceDashboardComponent.timeOnly(row.checkInAt);
    this.correctCheckOut = AttendanceDashboardComponent.timeOnly(row.checkOutAt);
    this.correctStatus = '';
    this.correctRemarks = '';
    this.correctReason = '';
    this.correctError = '';
  }

  applyCorrection(): void {
    const row = this.selectedRow;
    this.correctError = '';

    if (!row?.attendanceId) return;

    if (this.correctReason.trim().length < 5) {
      this.correctError = 'Give a reason. Months later it is the only thing that tells a correction '
        + 'apart from a mistake, and it is what a dispute turns on.';
      return;
    }
    if (this.correctCheckIn && this.correctCheckOut && this.correctCheckOut < this.correctCheckIn) {
      this.correctError = 'Check-out cannot be earlier than check-in. Overnight shifts are not supported yet.';
      return;
    }

    this.correctSaving = true;
    this.admin.applyCorrection(row.attendanceId, {
      // null, not '', for a field left alone — the API treats null as "leave as-is" and
      // would reject an empty string as a malformed time.
      checkInAt: this.correctCheckIn || null,
      checkOutAt: this.correctCheckOut || null,
      status: this.correctStatus || null,
      remarks: this.correctRemarks.trim() || null,
      reason: this.correctReason.trim(),
    }).subscribe({
      next: result => {
        this.correctSaving = false;

        if (!result.success) { this.correctError = result.message; return; }

        this.toastr.success(result.message || 'Correction applied.');
        this.load();
      },
      error: () => { this.correctSaving = false; },
    });
  }

  eventTone(type: AttendanceEventType): string {
    switch (type) {
      case AttendanceEventType.CheckInSuccess:
      case AttendanceEventType.CheckOutSuccess:
      case AttendanceEventType.DeviceEnrolled:
        return 'success';

      case AttendanceEventType.CheckInFailed:
      case AttendanceEventType.CheckOutFailed:
      case AttendanceEventType.QrValidationFailed:
      case AttendanceEventType.DeviceRevoked:
        return 'danger';

      case AttendanceEventType.ManualCorrection:
      case AttendanceEventType.AdminOverride:
        return 'warning';

      default:
        return 'neutral';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Export
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Exports exactly the rows on screen, filters and all.
   *
   * Built in the browser rather than asking the API for a file: the data is already here,
   * a lab of twenty people produces twenty rows, and a round trip would only introduce a
   * second definition of what this table means.
   */
  exportCsv(): void {
    const view = this.view;
    if (!view || view.rows.length === 0) return;

    const header = [
      'Employee', 'Role', 'Shift', 'Status', 'Check in', 'Check out',
      'Late (min)', 'Worked (min)', 'Verified by', 'Location', 'Distance (m)',
      'Corrected', 'Poor GPS accuracy',
    ];

    const lines = [header, ...view.rows.map(row => [
      row.fullName,
      row.role,
      row.shiftName ?? '',
      row.displayStatusLabel,
      row.checkInAt ?? '',
      row.checkOutAt ?? '',
      `${row.lateMinutes}`,
      row.workedMinutes === null || row.workedMinutes === undefined ? '' : `${row.workedMinutes}`,
      row.verificationMethod,
      row.locationName ?? '',
      row.checkInDistanceMetres === null || row.checkInDistanceMetres === undefined
        ? '' : `${Math.round(row.checkInDistanceMetres)}`,
      row.wasCorrected ? 'Yes' : 'No',
      row.acceptedWithPoorAccuracy ? 'Yes' : 'No',
    ])];

    const csv = lines.map(cells => cells.map(AttendanceDashboardComponent.csvCell).join(',')).join('\r\n');

    // A BOM, because this is opened in Excel far more often than anywhere else and
    // without one Excel reads UTF-8 as the local code page and mangles every name.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-${view.date.replace(/-/g, '')}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private static csvCell(value: string): string {
    // A leading =, +, - or @ makes Excel treat the cell as a formula. Names do not
    // normally start with one, but a pasted label can, and the result is a spreadsheet
    // running whatever it found in an attendance export.
    const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  /** "dd-MM-yyyy HH:mm" or "HH:mm" in, "HH:mm" out. */
  private static timeOnly(value: string | null | undefined): string {
    if (!value) return '';

    const match = /(\d{2}):(\d{2})/.exec(value);
    return match ? `${match[1]}:${match[2]}` : '';
  }

  private static todayIso(): string {
    return AttendanceDashboardComponent.toIso(new Date());
  }

  private static toIso(date: Date): string {
    const pad = (n: number) => `${n}`.padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  /**
   * Parses yyyy-MM-dd into a local date.
   *
   * Not `new Date(iso)`: that parses a bare date string as UTC, so east of Greenwich
   * "step back one day" from the 1st lands on the 30th instead of the 31st.
   */
  private static parseIso(iso: string): Date {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  }
}
