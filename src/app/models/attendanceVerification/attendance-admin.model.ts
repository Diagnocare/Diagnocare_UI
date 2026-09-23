import { AttendanceDisplayStatus } from './attendance-verification.model';

/**
 * Client-side mirrors of the attendance administration DTOs.
 *
 * Split from `attendance-verification.model.ts`, which serves the employee screen and the
 * kiosk. These shapes carry coordinates, device tokens and audit rows — administrator-only
 * data — and keeping them in a separate file means the employee bundle never imports a
 * type it has no business knowing about.
 */

// ── Locations ────────────────────────────────────────────────────────────────

export interface AttendanceLocation {
  locationId:         number;
  name:               string;
  address?:           string | null;
  latitude:           number;
  longitude:          number;
  /** The radius actually in force — the location's own, or the configured default. */
  radiusMetres:       number;
  usingDefaultRadius: boolean;
  isActive:           boolean;
  assignedEmployeeCount: number;
}

export interface AttendanceLocationSave {
  /** 0 to create. */
  locationId:   number;
  name:         string;
  address?:     string | null;
  latitude:     number;
  longitude:    number;
  /** 0 means "use the configured default". */
  radiusMetres: number;
  isActive:     boolean;
}

// ── Shifts ───────────────────────────────────────────────────────────────────

export interface Shift {
  shiftId:              number;
  name:                 string;
  /** "HH:mm". */
  startTime:            string;
  endTime:              string;
  graceMinutes:         number;
  lateAfterMinutes:     number;
  halfDayAfterMinutes:  number;
  minimumWorkMinutes:   number;
  isActive:             boolean;
  assignedEmployeeCount: number;
}

export interface ShiftSave {
  /** 0 to create. */
  shiftId:             number;
  name:                string;
  startTime:           string;
  endTime:             string;
  graceMinutes:        number;
  lateAfterMinutes:    number;
  halfDayAfterMinutes: number;
  minimumWorkMinutes:  number;
  isActive:            boolean;
}

export interface EmployeeShift {
  employeeShiftId: number;
  userId:          number;
  fullName:        string;
  shiftId:         number;
  shiftName:       string;
  /** "dd-MM-yyyy". */
  effectiveFrom:   string;
  effectiveTo?:    string | null;
  /** Whether this is the assignment in force today. */
  isCurrent:       boolean;
}

export interface EmployeeShiftAssign {
  userId:        number;
  shiftId:       number;
  effectiveFrom: string;
  effectiveTo?:  string | null;
}

export interface EmployeeLocationAssign {
  userId:             number;
  locationIds:        number[];
  primaryLocationId?: number | null;
}

// ── Devices ──────────────────────────────────────────────────────────────────

export interface AttendanceDevice {
  deviceId:      number;
  userId:        number;
  fullName:      string;
  isKiosk:       boolean;
  locationId?:   number | null;
  locationName?: string | null;
  label?:        string | null;
  /** "dd-MM-yyyy HH:mm". */
  expiresAt:     string;
  isActive:      boolean;
  lastUsedAt?:   string | null;
  revokedReason?: string | null;
}

export interface EnrolAttendanceDevice {
  userId:            number;
  isKiosk:           boolean;
  /** Required for a kiosk — the location whose code it displays. */
  locationId?:       number | null;
  label?:            string | null;
  deviceIdentifier?: string | null;
}

/**
 * The result of enrolling a device.
 *
 * `token` appears here and nowhere else, ever — only its hash is stored. The screen has to
 * treat this as the one chance to hand it over, which is why the enrolment panel makes
 * copying it the most prominent thing on screen and warns before it is dismissed.
 */
export interface EnrolAttendanceDeviceResult {
  deviceId:  number;
  token:     string;
  expiresAt: string;
  message:   string;
}

// ── The daily view ───────────────────────────────────────────────────────────

export interface AttendanceDayRow {
  userId:   number;
  fullName: string;
  role:     string;

  shiftId?:    number | null;
  shiftName?:  string | null;
  shiftStart?: string | null;

  attendanceId?: number | null;

  checkInAt?:  string | null;
  checkOutAt?: string | null;

  lateMinutes:    number;
  workedMinutes?: number | null;

  displayStatus:      AttendanceDisplayStatus;
  displayStatusLabel: string;

  /** "GPS + QR", "Manual", "Not verified" — the column that makes this screen worth reading. */
  verificationMethod: string;

  locationName?:          string | null;
  checkInDistanceMetres?: number | null;

  wasCorrected:             boolean;
  acceptedWithPoorAccuracy: boolean;
}

export interface AttendanceDaySummary {
  totalEmployees: number;
  present:        number;
  late:           number;
  halfDay:        number;
  absent:         number;
  incomplete:     number;
  notMarked:      number;
  onLeave:        number;
  weekOff:        number;
}

export interface AttendanceDayView {
  date:         string;
  dayName:      string;
  isHoliday:    boolean;
  holidayName?: string | null;
  isToday:      boolean;
  summary:      AttendanceDaySummary;
  rows:         AttendanceDayRow[];
}

// ── Correction and audit ─────────────────────────────────────────────────────

export interface AttendanceCorrection {
  /** "HH:mm", or omitted to leave as-is. */
  checkInAt?:  string | null;
  checkOutAt?: string | null;
  /** "P", "A", "HD" or "WO". Omit to let the times decide. */
  status?:     string | null;
  remarks?:    string | null;
  /** Required — the service refuses a correction without one. */
  reason:      string;
}

export interface AttendanceEvent {
  eventId:       number;
  attendanceId?: number | null;
  userId:        number;
  fullName:      string;
  actedByName?:  string | null;

  eventType:      number;
  eventTypeLabel: string;

  attendanceDate: string;
  occurredAt:     string;

  locationName?:   string | null;
  latitude?:       number | null;
  longitude?:      number | null;
  accuracyMetres?: number | null;
  distanceMetres?: number | null;

  failureReason:       number;
  failureReasonLabel?: string | null;

  deviceIdentifier?: string | null;
  ipAddress?:        string | null;
  qrTokenId?:        number | null;

  oldValue?: string | null;
  newValue?: string | null;
  reason?:   string | null;
  metadata?: string | null;
}

/** The paged shape the audit endpoint returns. */
export interface AttendanceEventPage {
  items:      AttendanceEvent[];
  totalCount: number;
  page:       number;
  pageSize:   number;
}

/** The shape every write endpoint here answers with — matches the API's OperationResult. */
export interface OperationResult {
  success: boolean;
  message: string;
  token?:  string | null;
}
