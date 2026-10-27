// ── OTP channel ────────────────────────────────────────────────────────────────

/**
 * Communication channels supported by the backend CommunicationController.
 * The backend generates a stateless TOTP and dispatches it via the chosen channel.
 */
export type OtpChannel = 'phone' | 'email' | 'other';

export const OtpChannelLabels: Record<OtpChannel, string> = {
  phone: 'Mobile (SMS)',
  email: 'Email',
  other: 'Other',
};

// ── Send OTP ───────────────────────────────────────────────────────────────────

/**
 * POST api/login/SendOtp
 *
 * Backend behaviour (no database used):
 *  1. Derives TOTP = truncate6( HMAC-SHA256( serverSecret + userId, floor(now / 30) ) )
 *  2. Dispatches the code via the CommunicationController to `channel`
 *  3. Returns success — nothing is persisted
 */
export interface SendOtpRequest {
  userId:   string;
  /** Target channel. The code is always delivered to the address on file. */
  channel:  OtpChannel;
  /** What the code will be redeemed for. Defaults to a login on the server. */
  purpose?: 'login' | 'reset';
}

// ── Verify OTP ─────────────────────────────────────────────────────────────────

/**
 * POST api/login/VerifyOtp
 *
 * Backend behaviour (no database used):
 *  1. Re-derives TOTP for the current window ± 1 window (handles minor clock drift)
 *  2. Compares with the submitted `code` — no DB lookup required
 *  3. Returns { success, message, token? }
 */
export interface VerifyOtpRequest {
  userId: string;
  code:   string;
}

// ── Unified verify ─────────────────────────────────────────────────────────────

/**
 * POST api/login/Verify
 *
 * Single endpoint for all verification flows.
 * Mirrors the backend VerifyAuthRequest model.
 */
export interface VerifyAuthRequest {
  /** 1 = Mobile, 2 = Email, 3 = AuthenticationApp, 4 = Other */
  authType: number;
  /** Username for MFA; Redis string key for OTP. */
  userId:   string;
  /** 'login' (default) returns a session token; 'reset' returns a single-use password-reset token. */
  purpose?: 'login' | 'reset';
  /** Six-digit TOTP string (MFA) or numeric OTP as string (Email / Phone). */
  code:     string;
}
