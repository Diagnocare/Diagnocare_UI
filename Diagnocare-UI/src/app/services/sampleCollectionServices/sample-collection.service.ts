import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { SKIP_ERROR_TOAST_HEADER } from 'src/app/core/interceptors/error.interceptor';
import { CollectionActionResponse, Pickup } from 'src/app/models/sampleCollection/sample-collection.model';

/**
 * api/SampleCollection — getting a sample from a collection boy to the bench.
 *
 *   assign()        front desk / admin  (LabOperations)
 *   myPickups()     collection boy      (his own list)
 *   markCollected() collection boy      ("I have the sample")
 *   markReceived()  technician / admin  ("the lab has it" — TestResultEntry)
 */
@Injectable({ providedIn: 'root' })
export class SampleCollectionService {
  private readonly baseUrl = getDiagnocareApiUrl() + 'api/SampleCollection/';

  /**
   * The actions carry a specific, readable refusal ("not collected yet",
   * "already collected") which the calling screen shows itself — so the
   * interceptor's generic error toast is switched off for them.
   */
  private readonly quiet = { headers: new HttpHeaders({ [SKIP_ERROR_TOAST_HEADER]: '1' }) };

  constructor(private http: HttpClient) {}

  assign(testRegId: number, collectionBoyId: number): Observable<CollectionActionResponse> {
    return this.http.post<CollectionActionResponse>(this.baseUrl + 'Assign', { testRegId, collectionBoyId }, this.quiet);
  }

  myPickups(recentDays = 1): Observable<Pickup[]> {
    const params = new HttpParams().set('recentDays', String(recentDays));
    return this.http.get<Pickup[]>(this.baseUrl + 'MyPickups', { params });
  }

  markCollected(testRegId: number): Observable<CollectionActionResponse> {
    return this.http.post<CollectionActionResponse>(this.baseUrl + 'MarkCollected', { testRegId }, this.quiet);
  }

  markReceived(testRegId: number): Observable<CollectionActionResponse> {
    return this.http.post<CollectionActionResponse>(this.baseUrl + 'MarkReceived', { testRegId }, this.quiet);
  }
}
