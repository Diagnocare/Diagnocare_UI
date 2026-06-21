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
 * Mapping:  "1" = Present  |  "2" = Absent  |  "3" = HalfDay  |  "4" = SecondHalf |  "5" = Holiday
 */
export enum BackendAttendanceStatus {
  Present    = 1,
  Absent     = 2,
  FirstHalf    = 3,   // maps to frontend FirstHalf
  SecondHalf = 4,
  Holiday    = 5,
}

/**
 * Converts the backend numeric string status (e.g. "2") to the frontend AttendanceStatus.
 * Accepts string, number, null or undefined — always returns a valid AttendanceStatus.
 */
export function mapBackendStatus(backendStatus: string | number | null | undefined): AttendanceStatus {
  const num = typeof backendStatus === 'string' ? parseInt(backendStatus, 10) : backendStatus;
  switch (num) {
    case BackendAttendanceStatus.Present:    return AttendanceStatus.Present;
    case BackendAttendanceStatus.Absent:     return AttendanceStatus.Absent;
    case BackendAttendanceStatus.FirstHalf:    return AttendanceStatus.FirstHalf;
    case BackendAttendanceStatus.SecondHalf: return AttendanceStatus.SecondHalf;
    case BackendAttendanceStatus.Holiday:    return AttendanceStatus.Holiday;
    default:                                 return AttendanceStatus.None;
  }
}

/**
 * Converts a frontend AttendanceStatus to the backend numeric string for POST payloads.
 * Returns '' for None — callers must filter out None cells before posting.
 */
export function mapStatusToBackend(status: AttendanceStatus): string {
  switch (status) {
    case AttendanceStatus.Present:    return String(BackendAttendanceStatus.Present);    // '1'
    case AttendanceStatus.Absent:     return String(BackendAttendanceStatus.Absent);     // '2'
    case AttendanceStatus.FirstHalf:  return String(BackendAttendanceStatus.FirstHalf);   // '3'
    case AttendanceStatus.SecondHalf: return String(BackendAttendanceStatus.SecondHalf);// '4'
    case AttendanceStatus.Holiday:    return String(BackendAttendanceStatus.Holiday);    // '5'
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
 * The backend AttendanceRecordDto.Status is a plain C# string.
 * Use mapStatusToBackend(cell.status) to get the correct value before posting.
 * Expected values: "Present" | "Absent" | "FirstHalf" | "SecondHalf" | "Holiday"
 */
export interface AttendanceRecordDTO {
  /** 0 for INSERT; the actual ID for UPDATE. */
  attendanceId:   number;
  userId:         number;
  attendanceDate: string;   // ISO date 'YYYY-MM-DD'
  /** String — must be one of: "Present", "Absent", "FirstHalf", "SecondHalf", "Holiday" */
  status:         string;
  remarks?:       string;
}
