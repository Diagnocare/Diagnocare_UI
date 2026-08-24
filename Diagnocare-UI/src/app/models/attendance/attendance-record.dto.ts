// ── Frontend display enum ─────────────────────────────────────────────────────

/** UI-side attendance status. Values are used as CSS class keys and display labels. */
export enum AttendanceStatus {
  Present    = 'P',
  Absent     = 'A',
  FirstHalf  = 'FH',
  SecondHalf = 'SH',
  Holiday    = 'H',
  None       = ''
}

// ── Backend status mapping ────────────────────────────────────────────────────

/**
 * The backend serialises its C# AttendanceStatus enum as a numeric string.
 * GET returns  "status": "2"  (string, not integer).
 * POST expects "status": "2"  (same string numeric format).
 *
 * VERIFIED against Diagnocare_API/Enums/AttendanceStatus.cs — the backend enum is:
 *   Present = 1 | Absent = 2 | HalfDay = 3 | Leave = 4 | Holiday = 5 | WeekOff = 6
 *
 * Backend has ONE half-day bucket (HalfDay = 3) — there is no separate
 * first-half/second-half concept server-side, and "4" is Leave, not a second
 * half-day variant. The values below used to claim "SecondHalf = 4", which
 * silently saved every "Second Half Present" grid entry as a Leave record
 * (status 4) instead of a half-day one. Fixed: both FirstHalf and SecondHalf
 * now resolve to backend value 3 — see mapStatusToBackend below.
 */
export enum BackendAttendanceStatus {
  Present  = 1,
  Absent   = 2,
  HalfDay  = 3,   // the only half-day value the backend understands
  Leave    = 4,   // NOT a half-day variant — do not map FirstHalf/SecondHalf here
  Holiday  = 5,
}

/**
 * Converts the backend numeric string status (e.g. "2") to the frontend AttendanceStatus.
 * Accepts string, number, null or undefined — always returns a valid AttendanceStatus.
 */
export function mapBackendStatus(backendStatus: string | number | null | undefined): AttendanceStatus {
  const num = typeof backendStatus === 'string' ? parseInt(backendStatus, 10) : backendStatus;
  switch (num) {
    case BackendAttendanceStatus.Present:  return AttendanceStatus.Present;
    case BackendAttendanceStatus.Absent:   return AttendanceStatus.Absent;
    // Backend can't tell first-half from second-half — every HalfDay record
    // reads back as FirstHalf. A cell saved as "Second Half Present" will
    // therefore display as "First Half Present" after a reload; there is no
    // way to preserve that distinction without a backend schema change.
    case BackendAttendanceStatus.HalfDay:  return AttendanceStatus.FirstHalf;
    case BackendAttendanceStatus.Holiday:  return AttendanceStatus.Holiday;
    // Leave (4) has no equivalent cell state in this grid today (the grid only
    // ever writes Present/Absent/HalfDay/Holiday — Leave only reaches this table
    // via an approved attendance-request). Falling through to None rather than
    // mislabeling it as a half-day avoids re-introducing the bug above; a real
    // "Leave" chip would need its own AttendanceStatus value and CSS class.
    default:                               return AttendanceStatus.None;
  }
}

/**
 * Converts a frontend AttendanceStatus to the backend numeric string for POST payloads.
 * Returns '' for None — callers must filter out None cells before posting.
 *
 * FirstHalf and SecondHalf BOTH send backend value 3 (HalfDay) — see the
 * BackendAttendanceStatus comment above for why sending 4 for SecondHalf was
 * silently corrupting saved records into Leave.
 */
export function mapStatusToBackend(status: AttendanceStatus): string {
  switch (status) {
    case AttendanceStatus.Present:    return String(BackendAttendanceStatus.Present);   // '1'
    case AttendanceStatus.Absent:     return String(BackendAttendanceStatus.Absent);    // '2'
    case AttendanceStatus.FirstHalf:  return String(BackendAttendanceStatus.HalfDay);   // '3'
    case AttendanceStatus.SecondHalf: return String(BackendAttendanceStatus.HalfDay);   // '3' — NOT '4' (Leave)
    case AttendanceStatus.Holiday:    return String(BackendAttendanceStatus.Holiday);   // '5'
    default:                          return '';
  }
}

// ── UI config ─────────────────────────────────────────────────────────────────

/** UI config for each status — drives labels, chip colours and CSS classes. */
export interface StatusConfig {
  value:      AttendanceStatus;
  label:      string;       // full label, e.g. 'First Half'
  shortLabel: string;       // cell label, e.g. 'FH'
  cssClass:   string;       // applied to .att-cell
  chipClass:  string;       // applied to legend chips
}

/**
 * Keyed by AttendanceStatus value so both component logic and templates can
 * look up config with  statusMap[cell.status]  without a switch statement.
 */
export const ATTENDANCE_STATUS_MAP: { [key in AttendanceStatus]: StatusConfig } = {
  [AttendanceStatus.Present]:    { value: AttendanceStatus.Present,    label: 'Present',     shortLabel: 'P',  cssClass: 'cell-present',    chipClass: 'chip-p'  },
  [AttendanceStatus.Absent]:     { value: AttendanceStatus.Absent,     label: 'Absent',      shortLabel: 'A',  cssClass: 'cell-absent',     chipClass: 'chip-a'  },
  [AttendanceStatus.FirstHalf]:  { value: AttendanceStatus.FirstHalf,  label: 'First Half Present',  shortLabel: 'HD', cssClass: 'cell-firsthalf',  chipClass: 'chip-fh' },
  [AttendanceStatus.SecondHalf]: { value: AttendanceStatus.SecondHalf, label: 'Second Half Present', shortLabel: 'SH', cssClass: 'cell-secondhalf', chipClass: 'chip-sh' },
  [AttendanceStatus.Holiday]:    { value: AttendanceStatus.Holiday,    label: 'Holiday',     shortLabel: 'H',  cssClass: 'cell-holiday',    chipClass: 'chip-h'  },
  [AttendanceStatus.None]:       { value: AttendanceStatus.None,       label: 'Not Marked',  shortLabel: '·',  cssClass: 'cell-unmarked',   chipClass: 'chip-none' },
};

/**
 * Ordered list used for:
 *  - legend row   (excludes None and Holiday — Holiday is rendered separately in the template)
 *  - click-cycle  (includes None at end to allow un-marking)
 *  - column bulk-action buttons  (Holiday excluded — it is system-managed, not manually assignable)
 */
export const STATUS_LIST: StatusConfig[] = [
  ATTENDANCE_STATUS_MAP[AttendanceStatus.Present],
  ATTENDANCE_STATUS_MAP[AttendanceStatus.Absent],
  ATTENDANCE_STATUS_MAP[AttendanceStatus.FirstHalf],
  ATTENDANCE_STATUS_MAP[AttendanceStatus.SecondHalf],
];

/** Full cycle including None so clicking cycles back to unmarked. Holiday excluded — it is system-managed. */
export const STATUS_CYCLE: AttendanceStatus[] = [
  AttendanceStatus.Present,
  AttendanceStatus.Absent,
  AttendanceStatus.FirstHalf,
  AttendanceStatus.SecondHalf,
  AttendanceStatus.None,
];

// ── POST payload ──────────────────────────────────────────────────────────────

/**
 * One record sent in the POST api/attendance/Add array payload.
 *
 * The backend AttendanceRecordDto.Status is a plain C# string, parsed server-side
 * by AttendanceService.ParseStatus(), which accepts the numeric string form —
 * "1".."5" (also accepts "P"/"A"/"H"/"HO" word-ish aliases, but NOT "FirstHalf"/
 * "SecondHalf"; the comment that used to be here claiming those words were
 * expected was wrong). Use mapStatusToBackend(cell.status) to get the correct
 * numeric string before posting.
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
