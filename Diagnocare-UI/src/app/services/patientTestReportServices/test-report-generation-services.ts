import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';

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
export interface ReportShareLink {
  /** Short link for messages (…/r/Ab3kP9xQ2m); the full QR link if a short one could not be made. */
  url: string;
  /** The full QR verification link — same report, same token. */
  longUrl?: string;
  reportNumber: string;
}

@Injectable({
  providedIn: 'root',
})
export class TestReportGenerationServices {
  private url: string;

  constructor(private httpClient: HttpClient) {
    this.url = getDiagnocareApiUrl() + controllerEndpoints.patientTestReportGeneration;
  }

  /**
   * Calls the backend ViewReport endpoint and returns the raw HTML string.
   *
   * The backend returns a standalone HTML document — the caller is responsible
   * for opening it in a new tab (e.g. via a Blob URL).
   *
   * @param pathBranch  Optional pathology branch name passed as a query param.
   */
  generateTestReport(patientTestId: number, testCode: string, pathBranch?: string): Observable<string> {
    let apiUrl = `${this.url}${apiEndpoints.generateTestReportPDF}?patientTestId=${patientTestId}&testCode=${testCode}`;
    if (pathBranch) {
      apiUrl += `&pathBranch=${encodeURIComponent(pathBranch)}`;
    }
    return this.httpClient
      .get(apiUrl, { responseType: 'text' });
  }

  /**
   * Downloads the report as a PDF.
   *
   * The backend renders a real, full-A4 PDF (headless Chromium) and streams the
   * file back as a Blob, which the caller saves via an anchor download.
   *
   * @param pathBranch  Optional pathology branch name passed as a query param.
   */
  /**
   * Smart Health Report for a whole booking (every test on it): health score,
   * health-area scores, personalised summary and roadmap. Returns a standalone
   * HTML page; the caller opens it in a new tab like the lab report. The page's
   * own "Print / Save as PDF" button produces the PDF.
   */
  generateSmartReport(patientTestId: number): Observable<string> {
    const apiUrl =
      `${getDiagnocareApiUrl()}${controllerEndpoints.smartReport}${apiEndpoints.generateSmartReport}` +
      `?patientTestId=${patientTestId}`;
    return this.httpClient.get(apiUrl, { responseType: 'text' });
  }

  downloadTestReport(
    patientTestId: number,
    testCode: string,
    pathBranch?: string
  ): Observable<Blob> {
    let apiUrl =
      `${this.url}${apiEndpoints.generateTestReportPDF}` +
      `?patientTestId=${patientTestId}&testCode=${testCode}&format=pdf`;
    if (pathBranch) {
      apiUrl += `&pathBranch=${encodeURIComponent(pathBranch)}`;
    }
    return this.httpClient
      .get(apiUrl, { responseType: 'blob' });
  }

  /**
   * The patient-facing link for a report — the same verified URL the printed QR
   * carries. Used to send the report over WhatsApp as a link instead of a file.
   * Staff-only on the backend; the link itself opens without a login.
   */
  getReportShareLink(patientTestId: number, testCode: string): Observable<ReportShareLink> {
    const apiUrl = `${this.url}${apiEndpoints.reportShareLink}`
      + `?patientTestId=${patientTestId}&testCode=${encodeURIComponent(testCode)}`;
    return this.httpClient.get<ReportShareLink>(apiUrl);
  }

}
