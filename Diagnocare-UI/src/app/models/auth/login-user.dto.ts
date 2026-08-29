/**
 * Response from `POST api/Login/GetUserDetails`.
 *
 * Mirrors the API's `LoginUserDto`. The endpoint used to return the whole User entity,
 * so this was typed as `MemberDto` — it never was a member record, and now the API
 * sends only the fields below.
 *
 * The same endpoint answers with three other shapes, so the alternate fields are
 * declared optional here rather than forcing every caller to cast:
 *   • account locked      → `accountLocked` + `lockedUntil`
 *   • session conflict    → `sessionConflict` + `loginTime` / `deviceInfo` / `userId`
 *   • bad credentials     → `success: false` + `message`
 * Check those flags before reading the identity fields.
 */
export interface LoginUserResponse {
  // ── Successful credential check ───────────────────────────────────────────
  /** Primary key. Note the API serialises User_Id as `user_Id`. */
  user_Id?: number;
  /** Alias some callers read; not sent by this endpoint. */
  id?: number;
  /** Preferred second factor: 2 = Email, 3 = Authenticator (TOTP), 4 = Fingerprint. */
  loginType?: number;
  email?: string;
  contactPhone?: number;
  /** False when the user still has their system-generated password. */
  password_updated?: boolean;
  /** Drives the password-expiry warning. */
  passwordChangedAt?: string | null;
  /** True when an authenticator app is enrolled. */
  isMfaEnabled?: boolean;

  // ── Account locked ────────────────────────────────────────────────────────
  accountLocked?: boolean;
  lockedUntil?: string;

  // ── Session conflict ──────────────────────────────────────────────────────
  sessionConflict?: boolean;
  loginTime?: string | null;
  deviceInfo?: string;
  /** Present on the conflict response only. */
  userId?: number;

  // ── Invalid credentials (OperationResult) ─────────────────────────────────
  success?: boolean;
  message?: string;
  token?: string;
}
