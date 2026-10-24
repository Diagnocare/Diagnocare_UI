import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  AcceptTestRunResultDto,
  OperationResultDto,
  RepeatTestRunDto,
  TestRunCountDto,
  TestRunHistoryDto,
} from 'src/app/models/test-run/test-run.model';

/**
 * Reads and records how many times a test has been run on a patient's collected sample.
 *
 * Its own service rather than more methods on TestReportService: that one is about the
 * values, this one is about the conduct of the test, and mixing them is how "save the
 * result" and "record that we doubted the result" end up sharing error handling they should
 * not share.
 */
@Injectable({
  providedIn: 'root',
})
export class TestRunService {
  private readonly baseUrl: string;

  constructor(private httpClient: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.testRun;
  }

  /** The run history for one test on one booking. */
  getHistory(testRegId: number, testCode: string): Observable<TestRunHistoryDto> {
    const url =
      `${this.baseUrl}${apiEndpoints.getTestRunHistory}` +
      `?testRegId=${testRegId}&testCode=${encodeURIComponent(testCode)}`;
    return this.httpClient.get<TestRunHistoryDto>(url);
  }

  /**
   * Run counts for every test on a booking.
   *
   * One call for the whole booking, so the detail overlay can badge each test without a
   * request per row — a booking with a dozen tests would otherwise fire a dozen.
   */
  getBookingCounts(testRegId: number): Observable<TestRunCountDto[]> {
    const url = `${this.baseUrl}${apiEndpoints.getTestRunBookingCounts}?testRegId=${testRegId}`;
    return this.httpClient.get<TestRunCountDto[]>(url).pipe(map(list => list ?? []));
  }

  /** Records that the test was run again on the sample already collected. */
  repeat(request: RepeatTestRunDto): Observable<OperationResultDto> {
    return this.httpClient.post<OperationResultDto>(
      `${this.baseUrl}${apiEndpoints.repeatTestRun}`, request);
  }

  /**
   * Marks which run the lab stands behind.
   *
   * The response's `valuesNeedReEntry` says whether the stored numbers match the run just
   * accepted. Callers must surface it: accepting an older run changes the record, not the
   * result, and a screen that stays silent implies a restore that did not happen.
   */
  accept(runId: number): Observable<AcceptTestRunResultDto> {
    return this.httpClient.post<AcceptTestRunResultDto>(
      `${this.baseUrl}${apiEndpoints.acceptTestRun}`, { runId });
  }
}
