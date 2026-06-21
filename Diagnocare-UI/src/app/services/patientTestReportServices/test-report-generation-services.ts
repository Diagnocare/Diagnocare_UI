import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
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
      .get(apiUrl, { responseType: 'text' })
      .pipe(catchError(this.errorHandler));
  }

  private errorHandler(error: HttpErrorResponse): Observable<never> {
    console.error(error);
    return throwError(() => new Error(error.message || 'Server Error'));
  }
}
