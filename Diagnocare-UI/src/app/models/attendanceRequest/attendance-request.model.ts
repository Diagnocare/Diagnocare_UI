// ── Attendance request models & shared config ────────────────────────────────
//
// Mirrors the backend contracts in Model/Dtos/AttendanceRequest.
// The backend serialises statuses as integers; labels are provided alongside.

/**
 * Lifecycle state of a request (matches C# AttendanceRequestStatus).
 *
 *   Pending             → Approved | Rejected | Cancelled
 *   Approved            → WithdrawalRequested
 *   WithdrawalRequested → Withdrawn | Approved      (admin decides)
 *
 * Rejected / Cancelled / Withdrawn are terminal. The server owns these rules —
 * this enum exists to render them, not to enforce them.
 */
export enum RequestStatus {
  Pending = 1,
  Approved = 2,
  Rejected = 3,
  Cancelled = 4,
  /** Employee asked for an approved correction to be undone; awaiting admin. */
  WithdrawalRequested = 5,
  /** Admin granted the withdrawal; the attendance record has been reverted. */
  Withdrawn = 6,
}

/** Attendance status the request targets (matches C# AttendanceStatus). */
export enum AttendanceStatusCode {
  Present = 1,
  Absent = 2,
  HalfDay = 3,
  Leave = 4,
  Holiday = 5,
  WeekOff = 6,
}

/** Statuses an employee may request. Holiday/WeekOff are admin-managed. */
export const REQUESTABLE_STATUSES: { value: number; label: string }[] = [
  { value: AttendanceStatusCode.Present, label: 'Present' },
  { value: AttendanceStatusCode.Absent, label: 'Absent' },
  { value: AttendanceStatusCode.HalfDay, label: 'Half Day' },
  { value: AttendanceStatusCode.Leave, label: 'Leave' },
];

/** Admin may additionally apply these when overriding before approval. */
export const ALL_ATTENDANCE_STATUSES: { value: number; label: string }[] = [
  ...REQUESTABLE_STATUSES,
  { value: AttendanceStatusCode.Holiday, label: 'Holiday' },
  { value: AttendanceStatusCode.WeekOff, label: 'Week Off' },
];

/** UI chip config per request status: label + CSS modifier class. */
export const REQUEST_STATUS_CONFIG: {
  [key in RequestStatus]: { label: string; cssClass: string };
} = {
  [RequestStatus.Pending]:  { label: 'Pending',  cssClass: 'badge-pending' },
  [RequestStatus.Approved]: { label: 'Approved', cssClass: 'badge-approved' },
  [RequestStatus.Rejected]: { label: 'Rejected', cssClass: 'badge-rejected' },

  // Reached by withdrawing a request nobody had reviewed yet, so "Withdrawn" is what
  // the employee actually did. The enum name stays Cancelled server-side because that
  // is the lifecycle state; this is the word for it in the UI.
  [RequestStatus.Cancelled]: { label: 'Withdrawn', cssClass: 'badge-cancelled' },

  // Shares the pending styling: both mean "waiting on an admin", and the admin queue
  // reads more clearly when the two look alike.
  [RequestStatus.WithdrawalRequested]: { label: 'Withdrawal requested', cssClass: 'badge-pending' },

  // Distinct from the above: this one HAD been approved and its attendance was rolled
  // back. "Reverted" says what happened to the record, and keeps the two terminal
  // withdrawal outcomes tellable apart in a list.
  [RequestStatus.Withdrawn]: { label: 'Reverted', cssClass: 'badge-cancelled' },
};

export function attendanceStatusLabel(value: number | null | undefined): string {
  const found = ALL_ATTENDANCE_STATUSES.find(s => s.value === value);
  return found ? found.label : '—';
}

// ── Server response ──────────────────────────────────────────────────────────

export interface AttendanceRequestDTO {
  requestId: number;
  userId: number;
  employeeName: string;

  attendanceDate: string;   // ISO
  dayName: string;

  currentStatus: number | null;
  currentStatusLabel: string | null;
  requestedStatus: number;
  requestedStatusLabel: string;
  approvedStatus: number | null;
  approvedStatusLabel: string | null;

  requestStatus: number;    // RequestStatus
  requestStatusLabel: string;

  reason: string | null;
  adminRemarks: string | null;

  reviewedByName: string | null;
  reviewedAt: string | null;
  created: string | null;

  // ── Withdrawal ─────────────────────────────────────────────────────────────
  withdrawalReason: string | null;
  withdrawalRequestedAt: string | null;
  /** Status the attendance record was rolled back to. Null if it was deleted. */
  revertedToStatus: number | null;
  revertedToStatusLabel: string | null;

  // Server-computed flags — the UI renders from these, never re-derives rules.
  canEdit: boolean;
  /** Legacy cancel endpoint. The UI renders `canWithdraw` instead. */
  canCancel: boolean;
  /**
   * Owner may take this request back — either Pending (immediate) or Approved with
   * payroll still open (seeks approval). Pair with `withdrawalNeedsApproval`.
   */
  canWithdraw: boolean;
  /** True when withdrawing starts a review rather than taking effect at once. */
  withdrawalNeedsApproval: boolean;
  /** Why withdrawal is unavailable, when it is. Shown so a missing button isn't a mystery. */
  withdrawalBlockedReason: string | null;
  /** Sitting in the admin queue awaiting a withdrawal decision. */
  isWithdrawalPending: boolean;
  isReadOnly: boolean;
}

// ── Request payloads ─────────────────────────────────────────────────────────

export interface CreateAttendanceRequestDTO {
  attendanceDate: string;    // 'yyyy-MM-dd'
  requestedStatus: string;   // numeric string, e.g. '1'
  reason?: string;
}

export interface UpdateAttendanceRequestDTO {
  requestedStatus: string;
  reason?: string;
}

export interface ApproveAttendanceRequestDTO {
  approvedStatus?: string;   // omit/empty = approve as requested
  remarks?: string;
}

export interface RejectAttendanceRequestDTO {
  remarks: string;
}

/**
 * Employee takes a request back.
 * Reason is required only when the request is Approved — the server enforces that.
 */
export interface WithdrawAttendanceRequestDTO {
  reason?: string;
}

/** Admin decides a withdrawal. Remarks required when refusing. */
export interface DecideWithdrawalDTO {
  remarks?: string;
}

export interface AttendanceRequestFilter {
  userId?: number;
  status?: number;
  /** Return everything awaiting a decision (Pending + WithdrawalRequested). Overrides status. */
  awaitingDecision?: boolean;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}
