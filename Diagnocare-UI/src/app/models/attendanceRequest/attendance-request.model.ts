// ── Attendance request models & shared config ────────────────────────────────
//
// Mirrors the backend contracts in Model/Dtos/AttendanceRequest.
// The backend serialises statuses as integers; labels are provided alongside.

/** Lifecycle state of a request (matches C# AttendanceRequestStatus). */
export enum RequestStatus {
  Pending = 1,
  Approved = 2,
  Rejected = 3,
  Cancelled = 4,
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
  [RequestStatus.Pending]:   { label: 'Pending',   cssClass: 'badge-pending' },
  [RequestStatus.Approved]:  { label: 'Approved',  cssClass: 'badge-approved' },
  [RequestStatus.Rejected]:  { label: 'Rejected',  cssClass: 'badge-rejected' },
  [RequestStatus.Cancelled]: { label: 'Cancelled', cssClass: 'badge-cancelled' },
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

  // Server-computed flags — the UI renders from these, never re-derives rules.
  canEdit: boolean;
  canCancel: boolean;
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

export interface AttendanceRequestFilter {
  userId?: number;
  status?: number;
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
