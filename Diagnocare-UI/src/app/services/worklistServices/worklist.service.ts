import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import {
  WorklistPage,
  WorklistQuery,
  VerifyRequest,
  ReturnForReentryRequest,
  MarkSampleCollectedRequest,
  RecallReportRequest,
} from 'src/app/models/worklist/worklist.models';

/**
 * The lab's outstanding work.
 *
 * Every other clinical service here is reached through a patient — find the
 * person, then the booking, then the test. This one asks for the work directly
 * and returns the patient as a field on the row, which is the inversion the
 * whole worklist rests on.
 */
@Injectable({ providedIn: 'root' })
export class WorklistService {
  private readonly baseUrl: string;

  constructor(private httpClient: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.worklist;
  }

  /**
   * One queue's items plus the counts for every queue.
   *
   * Omitting `queue` returns items from all queues — that is what the search box
   * uses, because somebody looking up a patient does not know which queue their
   * work is sitting in, and being told "not found" when it is one tile away is
   * the sort of thing that sends people back to paper.
   */
  getWorklist(query: WorklistQuery = {}): Observable<WorklistPage> {
    let params = new HttpParams();

    if (query.queue)       params = params.set('queue', query.queue);
    if (query.from)        params = params.set('from', query.from);
    if (query.to)          params = params.set('to', query.to);
    if (query.searchTerm)  params = params.set('searchTerm', query.searchTerm);
    params = params.set('pageNumber', String(query.pageNumber ?? 1));
    params = params.set('pageSize', String(query.pageSize ?? 50));

    return this.httpClient.get<WorklistPage>(this.baseUrl + apiEndpoints.getWorklist, { params });
  }

  /**
   * Records where a booking's sample was collected, moving every test on it from
   * "to collect" to "awaiting results".
   */
  markSampleCollected(
    request: MarkSampleCollectedRequest,
  ): Observable<{ collected: boolean; samplingDoneAt: string }> {
    return this.httpClient.post<{ collected: boolean; samplingDoneAt: string }>(
      this.baseUrl + apiEndpoints.markSampleCollected, request);
  }

  /**
   * Signs off a test's results — the action that issues the report.
   *
   * The verifier is taken from the auth token server-side, so nothing here
   * carries a user name: a sign-off the client could attribute to anyone would
   * not be worth recording.
   */
  verify(request: VerifyRequest): Observable<{ verified: boolean; verifiedBy: string; verifiedAt: string }> {
    return this.httpClient.post<{ verified: boolean; verifiedBy: string; verifiedAt: string }>(
      this.baseUrl + apiEndpoints.verifyReport, request);
  }

  /** Withdraws a sign-off and sends the test back to the bench. */
  returnForReentry(request: ReturnForReentryRequest): Observable<{ returned: boolean }> {
    return this.httpClient.post<{ returned: boolean }>(
      this.baseUrl + apiEndpoints.returnForReentry, request);
  }

  /** Pulls an already-issued report back and sends the test to the bench. */
  recallReport(request: RecallReportRequest): Observable<{ recalled: boolean }> {
    return this.httpClient.post<{ recalled: boolean }>(
      this.baseUrl + apiEndpoints.recallReport, request);
  }

  /** Whether a test is signed off — decides between "Verify & issue" and "Print". */
  isVerified(testRegId: number, testCode: string): Observable<{ verified: boolean }> {
    const params = new HttpParams()
      .set('testRegId', String(testRegId))
      .set('testCode', testCode);

    return this.httpClient.get<{ verified: boolean }>(
      this.baseUrl + apiEndpoints.isVerified, { params });
  }
}
