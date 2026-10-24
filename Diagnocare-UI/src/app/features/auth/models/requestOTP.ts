/**
 * @deprecated Prefer VerifyOtpRequest from otp-request.dto.ts.
 * requestId is no longer required — TOTP validation is stateless (no DB lookup).
 */
export interface requestOTP {
  /** @deprecated Not used for stateless TOTP validation. */
  requestId?: number;
  userId: string;
  code:   string;
}
