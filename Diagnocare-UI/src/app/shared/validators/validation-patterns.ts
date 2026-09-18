/**
 * validation-patterns.ts
 * ------------------------------------------------------------------
 * Single source of truth for every validation regex used across the app.
 * Reference these constants from AppValidators or Validators.pattern(...)
 * instead of hard-coding regexes inside components.
 */
export const VALIDATION_PATTERNS = {
  /** Mobile / contact number: exactly 10 digits, must NOT start with 0. */
  contactNumber: /^[1-9][0-9]{9}$/,

  /** Letters and spaces only (names). */
  lettersOnly: /^[A-Za-z\s]+$/,

  /** Indian pincode: exactly 6 digits. */
  pincode: /^[0-9]{6}$/,

  /** Generic postal code: 4 to 10 digits (international-friendly). */
  pincodeIntl: /^[0-9]{4,10}$/,

  /** 24-hour time HH:MM (00:00 – 23:59). */
  time24h: /^([01]\d|2[0-3]):[0-5]\d$/,

  /** A single digit 0-9 (OTP boxes). */
  singleDigit: /^[0-9]$/,
} as const;
