/**
 * How a single (testRegId, testCode) report has left the lab — printed on paper,
 * sent to the patient on WhatsApp, or neither. Matches the API's
 * ReportPrintStatusDto; a report with no row comes back with everything false.
 *
 * The Smart Health Report shares this shape under the reserved code "INSIGHTS"
 * (SMART_REPORT_TEST_CODE below), the same key its share link already uses.
 */
export interface ReportPrintStatusDto {
  testRegId: number;
  testCode: string;
  isPrinted: boolean;
  /** When the flag was last switched on. Null when never marked printed. */
  printedAt: string | null;
  /** Who last changed this row, if it has ever been toggled. */
  printedBy: string | null;
  /** An operator has confirmed at least one WhatsApp send of this report. */
  sentOnWhatsApp: boolean;
  /** The MOST RECENT confirmed send — unlike printedAt, which is the first print. */
  whatsAppSentAt: string | null;
  /** Confirmed sends so far. Above 1 means the report was re-sent. */
  whatsAppSentCount: number;
  /** Number the last send went to, international form without "+" ("919876543210"). */
  whatsAppSentTo: string | null;
}

/** Request body for toggling a report's printed flag. */
export interface SetReportPrintedDto {
  testRegId: number;
  testCode: string;
  isPrinted: boolean;
}

/**
 * Request body for recording a confirmed WhatsApp send.
 *
 * There is no "sent / not sent" flag on purpose: this records a send that
 * happened. Not calling it is how "not sent" is expressed, so an abandoned or
 * declined send needs no request at all.
 */
export interface MarkReportSentOnWhatsAppDto {
  testRegId: number;
  testCode: string;
  /** The number it went to, in any format the patient screens store. Normalised server-side. */
  whatsAppNumber?: string | null;
}

/**
 * Reserved test code the Smart Health Report's token, share link and delivery
 * status all key on. Mirrors the API's SmartReportLink.TokenCode — no real lab
 * test may use it.
 */
export const SMART_REPORT_TEST_CODE = 'INSIGHTS';
