/** Short-lived token issued by GET api/Feedback/Token. */
export interface FeedbackTokenDto {
  token: string;
  expiresInSeconds: number;
  expiresAtUtc: string;
}
