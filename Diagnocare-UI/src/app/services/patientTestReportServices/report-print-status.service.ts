import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  MarkReportSentOnWhatsAppDto,
  ReportPrintStatusDto,
  SetReportPrintedDto,
} from 'src/app/models/report-print-status/report-print-status.model';

/**
 * Reads and updates how a report has left the lab — printed, or sent to the
 * patient on WhatsApp.
 *
 * Lives next to TestReportService (same PatientReport controller) rather than
 * inside it, so the delivery-status surface can be reused from screens that don't
 * otherwise need the rest of that service.
 */
@Injectable({
  providedIn: 'root',
})
export class ReportPrintStatusService {
  private readonly baseUrl: string;

  constructor(private httpClient: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.patientReport;
  }

  /**
   * The printed and sent-on-WhatsApp flags for every test code on a booking, in
   * one call — so the detail overlay can badge each test without a request per
   * row. The Smart Report's own row comes back under SMART_REPORT_TEST_CODE.
   */
  getBookingSummary(testRegId: number): Observable<ReportPrintStatusDto[]> {
    const url = `${this.baseUrl}${apiEndpoints.getPrintStatuses}?patientTestId=${testRegId}`;
    return this.httpClient.get<ReportPrintStatusDto[]>(url).pipe(map(list => list ?? []));
  }

  /** Manually marks one report printed or not-printed. */
  setPrinted(request: SetReportPrintedDto): Observable<ReportPrintStatusDto> {
    const url = `${this.baseUrl}${apiEndpoints.setPrinted}`;
    return this.httpClient.put<ReportPrintStatusDto>(url, request);
  }

  /**
   * Records that a report was successfully sent on WhatsApp, and returns the
   * report's updated status.
   *
   * Call this ONLY once the operator has confirmed the message actually went.
   * wa.me hands off to WhatsApp on another origin and reports nothing back, so
   * opening the chat is not evidence of a send and must not reach here.
   *
   * Safe to call again for a report already sent: the server bumps that one row's
   * count instead of writing a second.
   */
  markSentOnWhatsApp(request: MarkReportSentOnWhatsAppDto): Observable<ReportPrintStatusDto> {
    const url = `${this.baseUrl}${apiEndpoints.markSentOnWhatsApp}`;
    return this.httpClient.put<ReportPrintStatusDto>(url, request);
  }
}
