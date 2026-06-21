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
  /** ISO date (YYYY-MM-DD). User appears in attendance/salary from this month. */
  effectiveFrom?:  string | null;
  /** ISO date (YYYY-MM-DD). Set to deactivate; hides user from attendance/salary. */
  deactivatedAt?:  string | null;
}
