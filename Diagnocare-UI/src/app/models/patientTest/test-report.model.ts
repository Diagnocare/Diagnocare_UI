/**
 * @deprecated The backend now returns raw HTML directly from ViewReport.
 * This interface is kept only so existing references compile during migration.
 * New code should use the `string` overload of generateTestReport.
 */
export interface TestReportResponse {
  isTemplateReport: boolean;
  htmlContent: string;
  cssStyles?: string;
  pdfBase64: string;
  fileName: string;
  patientName: string;
  testCode: string;
  reportDate: string;
  templateName: string;
}

/** Response of GET TestReportGeneration/ShareLink. */
/** Link to a booking's Smart Health Report, plus its score for the message. */
export interface SmartReportShareLink {
  url: string;
  longUrl?: string;
  reportNumber: string;
  score?: number;
  band?: string;
}

export interface ReportShareLink {
  /** Short link for messages (…/r/Ab3kP9xQ2m); the full QR link if a short one could not be made. */
  url: string;
  /** The full QR verification link — same report, same token. */
  longUrl?: string;
  reportNumber: string;
}
