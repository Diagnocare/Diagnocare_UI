import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, shareReplay, catchError } from 'rxjs/operators';

import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  RejectSampleDto,
  ResolveSampleRejectionDto,
  SampleRejectionHistoryDto,
  SampleRejectionReasonDto,
  SampleRejectionSummaryDto,
} from 'src/app/models/sample-rejection/sample-rejection.model';
import { OperationResultDto } from 'src/app/models/test-run/test-run.model';

/**
 * Records and reads collected samples that could not be used.
 *
 * The reason list comes from the API rather than being written out here, so the two cannot
 * drift: a reason the picker offers but the server refuses is a dead end at the bench. It
 * is fetched once per session and shared, because it is a fixed list that will not change
 * between two clicks.
 */
@Injectable({
  providedIn: 'root',
})
export class SampleRejectionService {
  private readonly baseUrl: string;
  private reasons$: Observable<SampleRejectionReasonDto[]> | null = null;

  constructor(private httpClient: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.sampleRejection;
  }

  /** The standard reasons, grouped by cause. Cached for the session. */
  getReasons(): Observable<SampleRejectionReasonDto[]> {
    if (!this.reasons$) {
      this.reasons$ = this.httpClient
        .get<SampleRejectionReasonDto[]>(`${this.baseUrl}${apiEndpoints.getSampleRejectionReasons}`)
        .pipe(
          map(list => list ?? []),
          // A failed fetch must not be cached as an empty list for the rest of the session —
          // the next attempt should be able to succeed.
          catchError(() => {
            this.reasons$ = null;
            return of([] as SampleRejectionReasonDto[]);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.reasons$;
  }

  /** Every rejection recorded against one test on one booking. */
  getHistory(testRegId: number, testCode: string): Observable<SampleRejectionHistoryDto> {
    const url =
      `${this.baseUrl}${apiEndpoints.getSampleRejectionHistory}` +
      `?testRegId=${testRegId}&testCode=${encodeURIComponent(testCode)}`;
    return this.httpClient.get<SampleRejectionHistoryDto>(url);
  }

  /**
   * The rejection state of every test on a booking.
   *
   * One call for the whole booking, so the detail overlay can flag each test without a
   * request per row.
   */
  getBookingSummary(testRegId: number): Observable<SampleRejectionSummaryDto[]> {
    const url = `${this.baseUrl}${apiEndpoints.getSampleRejectionBookingSummary}?testRegId=${testRegId}`;
    return this.httpClient.get<SampleRejectionSummaryDto[]>(url).pipe(map(list => list ?? []));
  }

  /** Records that a collected sample could not be used. */
  reject(request: RejectSampleDto): Observable<OperationResultDto> {
    return this.httpClient.post<OperationResultDto>(
      `${this.baseUrl}${apiEndpoints.rejectSample}`, request);
  }

  /** Closes a rejection — a fresh sample arrived, or it was recorded in error. */
  resolve(request: ResolveSampleRejectionDto): Observable<OperationResultDto> {
    return this.httpClient.post<OperationResultDto>(
      `${this.baseUrl}${apiEndpoints.resolveSampleRejection}`, request);
  }
}
