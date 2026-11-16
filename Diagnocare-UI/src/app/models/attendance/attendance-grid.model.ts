import { AttendanceStatus } from 'src/app/models/attendance/attendance-record.dto';

export interface AttendanceCell {
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
  /**
   * Set when this employee has a correction request for this day still awaiting a
   * decision. The cell stays editable — the admin may well know better — but it is
   * flagged so a day isn't marked in ignorance of a request sitting in the queue.
   */
  requestId:            number | null;
  /** 'Pending' or 'Withdrawal Requested'. Empty when there's no open request. */
  requestStatusLabel:   string;
  /** The status the employee asked for, e.g. 'Half Day'. Empty when none. */
  requestedStatusLabel: string;
}

export interface AttendanceRow {
  userId:        number;
  fullName:      string;
  typeUserId:    number;
  deactivatedAt: string | null;
  cells:         AttendanceCell[];
}
