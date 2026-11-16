import { AttendanceStatus } from 'src/app/models/attendance/attendance-record.dto';

export interface AttendanceCell {
  attendanceId: number;
  status:       AttendanceStatus;
  isFuture:     boolean;
  isToday:      boolean;
  isHoliday:    boolean;
  holidayName:  string;
  dateStr:      string;
  /**
   * Set when a correction request for this day is still awaiting a decision.
   * The cell then shows a "Requested" marker and clicking it opens that request
   * instead of the new-request form — raising a second one for the same date is
   * rejected by the server, and an error is a poor way to learn that.
   */
  requestId:            number | null;
  /** 'Pending' or 'Withdrawal Requested'. Empty when there's no open request. */
  requestStatusLabel:   string;
  /** The status that was asked for, e.g. 'Half Day'. Empty when there's no open request. */
  requestedStatusLabel: string;
}

export interface AttendanceRow {
  userId:   number;
  fullName: string;
  cells:    AttendanceCell[];
}
