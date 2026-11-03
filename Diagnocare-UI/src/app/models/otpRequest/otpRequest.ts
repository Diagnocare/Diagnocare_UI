
export interface OtpRequest {
  userId: string;
  channel: 'email' | 'phone' | 'other';
  /** What the code will be redeemed for. Defaults to a login on the server. */
  purpose?: 'login' | 'reset';
}

export interface OtpVerificationRequest {
  id: number;
  userId: string;
  code: string;
}

export interface OtpResponse {
  success: boolean;
  message: string;
  token?: string;
  /**
   * Machine-readable error code on failure — matches Diagnocare_API ErrorCodes.
   * 'EMAIL_SEND_FAILED' means the verification email never left the server, so no
   * code is on its way and the OTP entry screen must not be shown.
   */
  code?: OtpErrorCode | string;
}

/** Failure codes the OTP endpoints return in {@link OtpResponse.code}. */
export type OtpErrorCode =
  | 'EMAIL_SEND_FAILED'
  | 'OTP_SEND_FAILED'
  | 'OTP_STORE_FAILED'
  | 'OTP_RATE_LIMITED'
  | 'ACCOUNT_LOCKED'
  | 'UNEXPECTED_ERROR';

export interface OtpCacheEntry {
  encryptedCode: string;
  userId: string;
  channel: string;
  timestamp: number;
  expiresAt: number;
  attempts: number; // wrong attempt counter
  locked: boolean;
  lockedUntil?: number;
}