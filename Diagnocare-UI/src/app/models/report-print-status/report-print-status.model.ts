/**
 * Manual "has this report been printed?" flag for a single (testRegId, testCode)
 * report — matches the API's ReportPrintStatusDto. There is no automatic detection
 * of the browser's print dialog, so this is a deliberate staff toggle, not a hit
 * counter.
 */
export interface ReportPrintStatusDto {
  testRegId: number;
  testCode: string;
  isPrinted: boolean;
  /** When the flag was last switched on. Null when never marked printed. */
  printedAt: string | null;
  /** Who last changed this row, if it has ever been toggled. */
  printedBy: string | null;
}

/** Request body for toggling a report's printed flag. */
export interface SetReportPrintedDto {
  testRegId: number;
  testCode: string;
  isPrinted: boolean;
}
