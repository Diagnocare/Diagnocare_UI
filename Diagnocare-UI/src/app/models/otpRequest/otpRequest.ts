
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