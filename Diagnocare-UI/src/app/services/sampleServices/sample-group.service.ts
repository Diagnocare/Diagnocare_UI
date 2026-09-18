import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  SampleBreakdownDto,
  emptySampleBreakdown,
} from 'src/app/models/sample/sample-breakdown.model';

/**
 * Reads the sample breakdown — how many samples a set of tests needs, and how many tests
 * are run off each.
 *
 * Its own service rather than another method on PathTestService: the question is about the
 * specimen, not about the test catalogue, and the two have different consumers. The booking
 * screen asks by test code while the basket is still changing; the history screens ask by
 * booking id, after the fact.
 */
@Injectable({
  providedIn: 'root',
})
export class SampleGroupService {
  private readonly baseUrl: string;

  constructor(private httpClient: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.sample;
  }

  /**
   * The breakdown for an existing booking.
   *
   * A cancelled booking answers 409 rather than a tube count, because a tube count reads as
   * an instruction to draw. Callers get the error and should say why, not show zero samples.
   */
  getForBooking(testRegId: number): Observable<SampleBreakdownDto> {
    const url = `${this.baseUrl}${apiEndpoints.getSampleBreakdownForBooking}${testRegId}`;
    return this.httpClient
      .get<SampleBreakdownDto>(url)
      .pipe(map(b => b ?? emptySampleBreakdown()));
  }

  /**
   * The breakdown for a basket of test codes, before a booking exists.
   *
   * One request for the whole basket — the booking screen calls this every time the
   * selection changes, so one call per test would be one call per keystroke of a search.
   */
  getForTestCodes(testCodes: string[]): Observable<SampleBreakdownDto> {
    const codes = (testCodes ?? []).filter(c => !!c && c.trim().length > 0).map(c => c.trim());
    const url = `${this.baseUrl}${apiEndpoints.getSampleBreakdownByCodes}`;
    return this.httpClient
      .post<SampleBreakdownDto>(url, codes)
      .pipe(map(b => b ?? emptySampleBreakdown()));
  }
}
