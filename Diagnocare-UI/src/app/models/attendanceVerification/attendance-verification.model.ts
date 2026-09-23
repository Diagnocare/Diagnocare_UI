/**
 * Client-side mirrors of the device-verified attendance DTOs.
 *
 * The enums below are numeric, not string unions, because the API serialises enums as
 * integers — `Program.cs` configures `AddJsonOptions` with the DateOnly converters only
 * and never adds `JsonStringEnumConverter`. A string union here would typecheck happily
 * and then never match a single response at runtime, which is the kind of bug that only
 * shows up in front of an employee standing at the door.
 */

// ── Enums (numeric, mirroring Diagnocare_API.Enums) ──────────────────────────

/**
 * The status shown on screen — derived server-side from shift rules, the holiday
 * calendar and the day's events. Deliberately richer than the four values the API
 * persists on UserAttendance; see AttendanceDisplayStatus in the C# enum for why
 * lateness is a column rather than a stored status.
 */
export enum AttendanceDisplayStatus {
  Present          = 1,
  Absent           = 2,
  HalfDay          = 3,
  OnLeave          = 4,
  Holiday          = 5,
  WeekOff          = 6,
  Late             = 7,
  Incomplete       = 8,
  ManualCorrection = 9,
  NotMarked        = 10,
}

/**
 * Why a check-in or check-out was refused.
 *
 * The screen switches on this rather than on the message text. Each one needs a
 * different action from the employee — retry the fix, rescan the code, move closer — and
 * "something went wrong" is what makes staff stop trusting the feature and start asking
 * for manual marks.
 */
export enum AttendanceFailureReason {
  None                             = 0,
  NotAnActiveEmployee              = 1,
  LocationNotFound                 = 2,
  LocationInactive                 = 3,
  EmployeeNotAuthorisedForLocation = 4,
  CoordinatesMissingOrInvalid      = 5,
  OutsideGeofence                  = 6,
  GpsAccuracyInsufficient          = 7,
  QrTokenMissing                   = 8,
  QrTokenInvalid                   = 9,
  QrTokenExpired                   = 10,
  QrTokenWrongLocation             = 11,
  QrTokenAlreadyUsed               = 12,
  AlreadyCheckedIn                 = 13,
  AlreadyCheckedOut                = 14,
  NotCheckedIn                     = 15,
  DayIsHoliday                     = 16,
  DayIsWeekOff                     = 17,
  NoShiftAssigned                  = 18,
  OutsideAttendanceWindow          = 19,
  SelfieRequiredButMissing         = 20,
  PayrollAlreadyPaidForMonth       = 21,
  DeviceNotEnrolledOrRevoked       = 22,
}

/**
 * Failures the employee can do something about by trying again.
 *
 * Used to decide whether the screen offers a Retry button. A poor GPS fix usually clears
 * within seconds of standing still, and a stale QR just needs the current one — offering
 * retry for "you are not authorised at this location" would only waste their time.
 */
export const RETRYABLE_FAILURES: ReadonlySet<AttendanceFailureReason> = new Set([
  AttendanceFailureReason.CoordinatesMissingOrInvalid,
  AttendanceFailureReason.GpsAccuracyInsufficient,
  AttendanceFailureReason.QrTokenMissing,
  AttendanceFailureReason.QrTokenExpired,
  AttendanceFailureReason.QrTokenInvalid,
  AttendanceFailureReason.OutsideGeofence,
  AttendanceFailureReason.SelfieRequiredButMissing,
]);

/** Failures where the right next step is to scan the code again, not to move. */
export const RESCAN_FAILURES: ReadonlySet<AttendanceFailureReason> = new Set([
  AttendanceFailureReason.QrTokenMissing,
  AttendanceFailureReason.QrTokenExpired,
  AttendanceFailureReason.QrTokenInvalid,
  AttendanceFailureReason.QrTokenWrongLocation,
]);

/** Bootstrap contextual class per display status, for chips and banners. */
export const DISPLAY_STATUS_TONE: Record<AttendanceDisplayStatus, string> = {
  [AttendanceDisplayStatus.Present]:          'success',
  [AttendanceDisplayStatus.Absent]:           'danger',
  [AttendanceDisplayStatus.HalfDay]:          'warning',
  [AttendanceDisplayStatus.OnLeave]:          'info',
  [AttendanceDisplayStatus.Holiday]:          'info',
  [AttendanceDisplayStatus.WeekOff]:          'secondary',
  [AttendanceDisplayStatus.Late]:             'warning',
  [AttendanceDisplayStatus.Incomplete]:       'warning',
  [AttendanceDisplayStatus.ManualCorrection]: 'secondary',
  [AttendanceDisplayStatus.NotMarked]:        'secondary',
};

// ── Request / response shapes ────────────────────────────────────────────────

/**
 * What the device sends to check in or out.
 *
 * Note what is absent, and keep it absent: no employee id (identity comes from the
 * token), no distance (the server computes it — a geofence satisfied by a number the
 * phone chose is not a geofence), no timestamp (a phone's clock is settable) and no
 * status (derived from shift rules server-side). Adding any of them would quietly undo
 * the anti-proxy design.
 */
export interface AttendanceCheckRequest {
  locationId:       number;
  latitude:         number;
  longitude:        number;
  accuracyMetres:   number;
  qrToken?:         string | null;
  selfieBase64?:    string | null;
  deviceIdentifier?: string | null;
}

export interface AttendanceCheckResult {
  success:                 boolean;
  failureReason:           AttendanceFailureReason;
  message:                 string;
  attendanceId?:           number | null;
  checkInAt?:              string | null;
  checkOutAt?:             string | null;
  distanceMetres?:         number | null;
  accuracyMetres?:         number | null;
  lateMinutes:             number;
  workedMinutes?:          number | null;
  displayStatus:           AttendanceDisplayStatus;
  displayStatusLabel:      string;
  acceptedWithPoorAccuracy: boolean;
}

/** A location the employee may attend at, with what the device needs to show distance. */
export interface AttendanceLocationOption {
  locationId:   number;
  name:         string;
  latitude:     number;
  longitude:    number;
  radiusMetres: number;
  isPrimary:    boolean;
}

/**
 * The whole employee screen in one response.
 *
 * One call on purpose: the requirement was attendance in a few seconds on a phone, and a
 * screen that fetches its profile, then its shift, then today's record spends that budget
 * on latency before anybody presses anything.
 */
export interface AttendanceToday {
  userId:   number;
  fullName: string;
  date:     string;
  dayName:  string;

  shiftId?:    number | null;
  shiftName?:  string | null;
  shiftStart?: string | null;
  shiftEnd?:   string | null;

  hasCheckedIn:  boolean;
  hasCheckedOut: boolean;
  checkInAt?:    string | null;
  checkOutAt?:   string | null;
  lateMinutes:   number;
  workedMinutes?: number | null;

  displayStatus:      AttendanceDisplayStatus;
  displayStatusLabel: string;

  /**
   * Whether the button should be live. Computed server-side and mirrored here for
   * usability only — every endpoint re-checks the same rules independently, so a stale
   * screen cannot produce a check-in the server would have refused.
   */
  canCheckIn:     boolean;
  canCheckOut:    boolean;
  blockedReason?: string | null;

  isNonWorkingDay:     boolean;
  nonWorkingDayLabel?: string | null;

  selfieRequired:      boolean;
  qrRequiredOnCheckOut: boolean;

  locations: AttendanceLocationOption[];
}

/**
 * The current kiosk rotation.
 *
 * `expiresInSeconds` is relative rather than an absolute expiry because a wall display's
 * clock is frequently minutes out — a relative figure cannot be wrong in the way an
 * absolute one silently is.
 */
export interface AttendanceQr {
  locationId:       number;
  locationName:     string;
  qrDataUri:        string;
  expiresInSeconds: number;
  /** Typed fallback shown under the code, for when a camera will not cooperate. */
  manualCode:       string;
}

/**
 * One day of the employee's own history.
 *
 * Carries no coordinates, and the API shape has nowhere to put them: the location trail
 * is personal data with no self-service purpose.
 */
export interface AttendanceHistoryItem {
  date:               string;
  dayName:            string;
  checkInAt?:         string | null;
  checkOutAt?:        string | null;
  lateMinutes:        number;
  workedMinutes?:     number | null;
  displayStatus:      AttendanceDisplayStatus;
  displayStatusLabel: string;
  locationName?:      string | null;
  shiftName?:         string | null;
  verificationMethod: string;
  wasCorrected:       boolean;
}
