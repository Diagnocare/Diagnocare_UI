export interface OtpRequest {
  id: number;
  userId: string;
  channel: 'email' | 'phone' | 'other';
  email?: string;
  contactPhone?: string;
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
  code?: string;
}

export interface OtpCacheEntry {
  encryptedCode: string;
  userId: string;
  channel: string;
  timestamp: number;
  expiresAt: number;
  attempts: number;
  locked: boolean;
  lockedUntil?: number;
}
