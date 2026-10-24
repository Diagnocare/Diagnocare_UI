
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
}

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