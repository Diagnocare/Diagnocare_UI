export interface JwtPayload {
  sub: string;         // userName
  /**
   * The user's roles — either key name ("Super_Admin") or numeric string ("4").
   *
   * An ARRAY when the account carries more than one role claim, which happens for a
   * Super Admin who also holds the Doctor capability: the API issues that capability as
   * a second `role` claim so its existing role-based policies keep working untouched.
   * The PRIMARY role is always first. Read it through `TokenService.getUserRole()`
   * rather than touching this field — a `parseInt` on an array quietly yields NaN.
   */
  role: string | string[];
  aud: string;
  email?: string;
  exp: number;
  jti?: string;
  /** Numeric user ID — added by TokenProvider so members can resolve their own visits. */
  uid?: string;
  /**
   * "true" when this user is a doctor — by role, or by the additional Doctor capability
   * a Super Admin can hold. Single-valued on purpose, so nothing has to reason about the
   * shape of `role` to answer "show doctor features". Absent means no.
   */
  isdoc?: string;
}