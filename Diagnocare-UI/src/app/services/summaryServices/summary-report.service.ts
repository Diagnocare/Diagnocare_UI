import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { SummaryReportResponse } from 'src/app/models/summaryReport/summaryReportModel';
import { summaryReportApiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { DateRangeParams } from 'src/app/models/summaryReport/summary-report-api.models';

@Injectable({ providedIn: 'root' })
export class SummaryReportService {

  private readonly baseUrl = getDiagnocareApiUrl() + controllerEndpoints.summaryReport;

  constructor(private http: HttpClient) {}

  // ── Used by BaseReportComponent (patient-registrations) ───────────────────────

  /**
   * Sends { Period, Year? } and expects the time-series response shape
   * { data: [{ year, periods: [{ period, count }] }] }.
   * Used only by patientRegister (the one report that IS a time-series chart).
   */
  getReportData(reportId: string, periodType: string = 'Month', year?: string): Observable<SummaryReportResponse> {
    const endpoint = summaryReportApiEndpoints[reportId];
    if (!endpoint) throw new Error(`Unknown report endpoint for: ${reportId}`);

    const body: any = { Period: periodType };
    if (year) body.Year = year;

    return this.http.post<SummaryReportResponse>(`${this.baseUrl}${endpoint}`, body);
  }

  // ── Used by TableReportComponent (all other reports) ─────────────────────────

  /**
   * Loads any tabular report.
   * For date-range reports: sends { period?, fromDate?, toDate? }.
   * For static catalogues (masterTestList, rateList, addressManagerReport): sends {}.
   * Always returns Observable<any> so the component can type-assert as needed.
   */
  getTableReport(reportId: string, params: DateRangeParams = {}): Observable<any> {
    const endpoint = summaryReportApiEndpoints[reportId];
    if (!endpoint) throw new Error(`Unknown report endpoint for: ${reportId}`);

    // Static catalogue endpoints — no date filter needed
    const staticReports = new Set(['masterTestList', 'rateList', 'addressManagerReport']);
    const base = staticReports.has(reportId) ? {} : this.buildDateBody(params);
    const body = params.extra ? { ...base, ...params.extra } : base;

    return this.http.post<any>(`${this.baseUrl}${endpoint}`, body);
  }

  // ── Helper ────────────────────────────────────────────────────────────────────

  private buildDateBody(params: DateRangeParams): object {
    const body: any = {};
    if (params.period)   body.Period   = params.period;
    if (params.year)     body.Year     = Number(params.year);
    if (params.chartType) body.ChartType = params.chartType;
    // Legacy explicit date range (lower priority than Year)
    if (!params.year) {
      if (params.fromDate) body.FromDate = params.fromDate;
      if (params.toDate)   body.ToDate   = params.toDate;
    }
    return body;
  }
}
