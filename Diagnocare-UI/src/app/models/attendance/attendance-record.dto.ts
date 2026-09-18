// ── Frontend display enum ─────────────────────────────────────────────────────

/**
 * UI-side attendance status. Values are used as CSS class keys and display labels.
 *
 * Only three of these are markable: Present (P), Absent (A) and HalfDay (HD).
 * Holiday and WeekOff are read-only display states — a holiday comes from the
 * holiday calendar and a week off is admin-assigned; neither can be picked in
 * the grid, so neither appears in STATUS_LIST or STATUS_CYCLE.
 */
export enum AttendanceStatus {
  Present  = 'P',
  Absent   = 'A',
  HalfDay  = 'HD',
  /** Read-only: the date is a registered holiday. Never posted. */
  Holiday  = 'H',
  /** Read-only: admin-assigned weekly off. Never posted from this grid. */
  WeekOff  = 'WO',
  None     = ''
}

// ── Backend status mapping ────────────────────────────────────────────────────

/**
 * The backend serialises its C# AttendanceStatus enum as a numeric string.
 * GET returns  "status": "2"  (string, not integer).
 * POST expects "status": "2"  (same string numeric format).
 *
 * Mirrors Diagnocare_API/Enums/AttendanceStatus.cs:
 *   Present = 1 | Absent = 2 | HalfDay = 3 | WeekOff = 6
 *
 * 4 (Leave) and 5 (Holiday) were retired — the backend now rejects them. The gap
 * in the numbering is deliberate so the surviving values still match the integers
 * already stored in the database.
 */
export enum BackendAttendanceStatus {
  Present  = 1,
  Absent   = 2,
  HalfDay  = 3,
  /** Admin-assigned only — the grid never posts this. */
  WeekOff  = 6,
}

/**
 * Converts the backend numeric string status (e.g. "2") to the frontend AttendanceStatus.
 * Accepts string, number, null or undefined — always returns a valid AttendanceStatus.
 * Anything unrecognised (including legacy 4/5 rows that predate the cleanup) reads
 * back as None rather than being mislabelled.
 */
export function mapBackendStatus(backendStatus: string | number | null | undefined): AttendanceStatus {
  const num = typeof backendStatus === 'string' ? parseInt(backendStatus, 10) : backendStatus;
  switch (num) {
    case BackendAttendanceStatus.Present: return AttendanceStatus.Present;
    case BackendAttendanceStatus.Absent:  return AttendanceStatus.Absent;
    case BackendAttendanceStatus.HalfDay: return AttendanceStatus.HalfDay;
    case BackendAttendanceStatus.WeekOff: return AttendanceStatus.WeekOff;
    default:                              return AttendanceStatus.None;
  }
}

/**
 * Converts a frontend AttendanceStatus to the backend numeric string for POST payloads.
 * Returns '' for None and for the read-only states (Holiday, WeekOff) — callers must
 * filter those out before posting; the backend rejects anything else.
 */
export function mapStatusToBackend(status: AttendanceStatus): string {
  switch (status) {
    case AttendanceStatus.Present: return String(BackendAttendanceStatus.Present);   // '1'
    case AttendanceStatus.Absent:  return String(BackendAttendanceStatus.Absent);    // '2'
    case AttendanceStatus.HalfDay: return String(BackendAttendanceStatus.HalfDay);   // '3'
    default:                       return '';
  }
}

// ── UI config ─────────────────────────────────────────────────────────────────

/** UI config for each status — drives labels, chip colours and CSS classes. */
export interface StatusConfig {
  value:      AttendanceStatus;
  label:      string;       // full label, e.g. 'Half Day'
  shortLabel: string;       // cell label, e.g. 'HD'
  cssClass:   string;       // applied to .att-cell
  chipClass:  string;       // applied to legend chips
}

/**
 * Keyed by AttendanceStatus value so both component logic and templates can
 * look up config with  statusMap[cell.status]  without a switch statement.
 */
export const ATTENDANCE_STATUS_MAP: { [key in AttendanceStatus]: StatusConfig } = {
  [AttendanceStatus.Present]: { value: AttendanceStatus.Present, label: 'Present',    shortLabel: 'P',  cssClass: 'cell-present',   chipClass: 'chip-p'  },
  [AttendanceStatus.Absent]:  { value: AttendanceStatus.Absent,  label: 'Absent',     shortLabel: 'A',  cssClass: 'cell-absent',    chipClass: 'chip-a'  },
  [AttendanceStatus.HalfDay]: { value: AttendanceStatus.HalfDay, label: 'Half Day',   shortLabel: 'HD', cssClass: 'cell-halfday',   chipClass: 'chip-hd' },
  [AttendanceStatus.Holiday]: { value: AttendanceStatus.Holiday, label: 'Holiday',    shortLabel: 'H',  cssClass: 'cell-holiday',   chipClass: 'chip-h'  },
  [AttendanceStatus.WeekOff]: { value: AttendanceStatus.WeekOff, label: 'Week Off',   shortLabel: 'WO', cssClass: 'cell-weekoff',   chipClass: 'chip-wo' },
  [AttendanceStatus.None]:    { value: AttendanceStatus.None,    label: 'Not Marked', shortLabel: '·',  cssClass: 'cell-unmarked',  chipClass: 'chip-none' },
};

/**
 * The only statuses a user may mark. Drives:
 *  - legend row   (Holiday is rendered separately in the template)
 *  - click-cycle  (via STATUS_CYCLE, which adds None to allow un-marking)
 *  - column bulk-action buttons
 *
 * Holiday and WeekOff are excluded — both are system/admin-managed.
 */
export const STATUS_LIST: StatusConfig[] = [
  ATTENDANCE_STATUS_MAP[AttendanceStatus.Present],
  ATTENDANCE_STATUS_MAP[AttendanceStatus.Absent],
  ATTENDANCE_STATUS_MAP[AttendanceStatus.HalfDay],
];

/** Full cycle including None so clicking cycles back to unmarked. */
export const STATUS_CYCLE: AttendanceStatus[] = [
  AttendanceStatus.Present,
  AttendanceStatus.Absent,
  AttendanceStatus.HalfDay,
  AttendanceStatus.None,
];

// ── POST payload ──────────────────────────────────────────────────────────────

/**
 * One record sent in the POST api/attendance/Add array payload.
 *
 * The backend AttendanceRecordDto.Status is a plain C# string, parsed server-side
 * by AttendanceService.ParseStatus(), which accepts "1"/"2"/"3" (and the aliases
 * P / A / HD). Use mapStatusToBackend(cell.status) to get the correct numeric
 * string before posting.
 */
export interface AttendanceRecordDTO {
  /** 0 for INSERT; the actual ID for UPDATE. */
  attendanceId:   number;
  userId:         number;
  attendanceDate: string;   // ISO date 'YYYY-MM-DD'
  /** Numeric string expected by the backend, e.g. "1" for Present — see mapStatusToBackend. */
  status:         string;
  remarks?:       string;
}
