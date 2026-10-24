export interface JwtPayload {
  sub: string;         // userName
  role: string;        // UserTypeId — either key name ("Super_Admin") or numeric string ("4")
  aud: string;
  email?: string;
  exp: number;
  jti?: string;
  /** Numeric user ID — added by TokenProvider so members can resolve their own visits. */
  uid?: string;
}