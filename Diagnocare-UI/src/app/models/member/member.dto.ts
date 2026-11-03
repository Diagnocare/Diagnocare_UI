/**
 * Unified member DTO — covers User, Admin, Assistant, Doctor, and Collection Boy.
 * All member types are stored in a single table; `typeUserId` differentiates them.
 */
export interface MemberDto {
  // ── Core identity ─────────────────────────────────────────────────────────
  /**
   * Unified primary key, always populated after normalization.
   * Maps to `user_Id` for user records and `id` for staff records.
   */
  id:       number;
  /** Kept for backward compat — same value as `id` for user records. */
  user_Id?: number;
  /** Role/type — maps to Role.X.id (1=User, 2=Assistant, 3=Admin, 4=Super_Admin, 5=Collection_Boy, 6=Doctor) */
  typeUserId: number;

  /**
   * The additional Doctor capability — "this Super Admin is also a Doctor".
   *
   * Sits BESIDE `typeUserId`, which stays Super Admin: the member keeps every Super
   * Admin permission and gains the doctor ones. Offered on the Super Admin role only;
   * the API normalises it to false for anything else, so never infer a role from it.
   *
   * This is what the "Also a Doctor" checkbox binds to. Setting it here asks the server
   * for the capability — what the member can actually DO comes from their next token.
   */
  isDoctor?: boolean;

  /**
   * Server-computed: is this member a doctor at all — by role (`typeUserId` 6) or by
   * `isDoctor`. Read this for "show the doctor bits"; it saves every caller from
   * re-deriving the OR and getting it wrong in one of the places.
   */
  isDoctorCapable?: boolean;

  // ── Login / account (User / Admin / Assistant) ────────────────────────────
  user_Name?:    string;
  /** Write-only — only sent on edit, never returned. */
  password?:     string;
  loginType?:    number;
  isMfaEnabled?: boolean;

  // ── Personal details (all login-enabled members) ──────────────────────────
  first_Name?:       string;
  last_Name?:        string;
  email?:            string;
  contactPhone?:     number;
  emergencyContact?: number;
  profilePhoto?:     string;

  // ── Doctor-only ───────────────────────────────────────────────────────────
  qualification?:   string;
  position?:        string;
  /** Base64-encoded PNG signature image. */
  signatureBase64?: string;
  /** Alias for signatureBase64 used in some API responses. */
  signatureImage?:  string;

  // ── Employment dates ──────────────────────────────────────────────────────
  /**
   * Join date as **dd-MM-yyyy** (the API's DateOnly format — NOT ISO).
   * User appears in attendance/salary from this month.
   */
  effectiveFrom?:  string | null;
  /**
   * Deactivation date as **dd-MM-yyyy** (the API's DateOnly format — NOT ISO).
   * Never pass this to `new Date()`, which reads it as MM-dd-yyyy; use
   * `parseApiDate` from shared/member-utils.
   */
  deactivatedAt?:  string | null;

  /**
   * Whether the member is currently active, decided server-side so no client has to
   * interpret the date format. Prefer this over `deactivatedAt` — see `isMemberActive`.
   */
  isActive?: boolean;
}
