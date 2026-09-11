import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { ReportPrintStatusDto, SetReportPrintedDto } from 'src/app/models/report-print-status/report-print-status.model';

/**
 * Reads and toggles the manual "printed" flag on a report.
 *
 * Lives next to TestReportService (same PatientReport controller) rather than
 * inside it, so the print-status surface can be reused from screens that don't
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
   * The printed flag for every test code on a booking, in one call — so the
   * detail overlay can badge each test without a request per row.
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
}
