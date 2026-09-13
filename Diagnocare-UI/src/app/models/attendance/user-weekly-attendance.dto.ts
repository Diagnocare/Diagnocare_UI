/**
 * Actual shape returned by GET api/attendance/GetWeekly?startDate=YYYY-MM-DD
 *
 * Status note: the C# enum is serialised as a numeric string, NOT an integer and
 * NOT a label. e.g. Absent comes through as status: "2", statusLabel: "2".
 * Use mapBackendStatus() from attendance-record.dto.ts to convert to AttendanceStatus.
 */

/** One day's attendance record within a weekly row. Null means no record for that date. */
export interface DayAttendanceDTO {
  attendanceId: number;
  /**
   * Numeric string: "1"=Present, "2"=Absent, "3"=HalfDay, "6"=WeekOff
   * (matches Diagnocare_API/Enums/AttendanceStatus.cs). "4" (Leave) and "5"
   * (Holiday) were retired and only ever appear on legacy rows.
   * Use mapBackendStatus(dayRec.status) to get the frontend AttendanceStatus.
   */
  status:      string;
  /** Currently mirrors the status numeric string (e.g. "2"). Not a human-readable label. */
  statusLabel: string;
  checkIn:     string | null;
  checkOut:    string | null;
  remarks:     string | null;
}

/**
 * A correction request for one day that is still awaiting a decision.
 *
 * Sits beside `days` rather than inside a day cell because a request can exist for
 * a day that has no attendance record at all — those cells come back null, and a
 * null cell can't carry a flag.
 */
export interface OpenAttendanceRequestDTO {
  requestId: number;
  /** 1 = Pending, 5 = WithdrawalRequested. May arrive as a numeric string. */
  requestStatus: number | string;
  /** Display text: 'Pending' / 'Withdrawal Requested'. */
  requestStatusLabel: string;
  /** 1 = Present, 2 = Absent, 3 = HalfDay. May arrive as a numeric string. */
  requestedStatus: number | string;
  /** Display text: 'Present' / 'Absent' / 'Half Day'. */
  requestedStatusLabel: string;
}

/** One user row returned by GET GetWeekly. */
export interface UserWeeklyRowDTO {
  userId:       number;
  userName:     string;
  fullName:     string;
  typeUserId:   number;
  deactivatedAt?: string | null;
  /**
   * Dictionary keyed by ISO date string 'YYYY-MM-DD'.
   * Value is null when no attendance record exists for that day.
   */
  days: { [date: string]: DayAttendanceDTO | null };
  /**
   * Days that already have a correction request awaiting a decision, keyed by ISO
   * date string 'YYYY-MM-DD'. A date absent from this map has no open request.
   * Older API builds omit the field entirely — treat undefined as "none".
   */
  openRequests?: { [date: string]: OpenAttendanceRequestDTO };
}

/** Top-level response from GET GetWeekly?startDate=YYYY-MM-DD */
export interface WeeklyAttendanceResponseDTO {
  /** ISO datetime with timezone offset, e.g. '2026-05-04T00:00:00+05:30' */
  weekStart:   string;
  weekEnd:     string;
  /** Formatted label, e.g. '04 May – 10 May 2026' */
  weekLabel:   string;
  /** Ordered list of ISO date strings for the 7 columns, e.g. ['2026-05-04', ...] */
  dateColumns: string[];
  /** Day names parallel to dateColumns, e.g. ['Monday', 'Tuesday', ...] */
  dayNames:    string[];
  rows:        UserWeeklyRowDTO[];
}
