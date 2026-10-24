import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { controllerEndpoints } from 'src/app/constant/constants';

/**
 * Sample collection labels — the barcode stickers that go on the tubes, one per
 * booked test.
 *
 * The API returns them as an HTML document sized to 50 × 25 mm label stock, which
 * the browser prints. It cannot simply be opened with `window.open(labelUrl)`:
 * that endpoint requires a Bearer token, and a token held by an HTTP interceptor
 * does not travel with a plain navigation — the new tab would show a 401. So the
 * HTML is fetched through HttpClient (which does attach the token) and opened
 * from a blob instead.
 */
@Injectable({ providedIn: 'root' })
export class SampleLabelService {
  private readonly labelUrl: string;

  constructor(private httpClient: HttpClient) {
    this.labelUrl = getDiagnocareApiUrl() + controllerEndpoints.sampleLabel;
  }

  /**
   * The printable label document for a booking.
   *
   * @param testRegId Booking / registration id.
   * @param copies    Copies of EACH test's label, for a test filling more than one tube.
   * @param testCode  Print one test's label only — for replacing a single spoiled sticker.
   * @param autoPrint Open the print dialog once the page loads. Default true.
   */
  getLabelHtml(
    testRegId: number,
    copies: number = 1,
    testCode?: string,
    autoPrint: boolean = true,
  ): Observable<string> {
    let params = new HttpParams()
      .set('copies', String(copies))
      .set('autoPrint', String(autoPrint));

    if (testCode) {
      params = params.set('testCode', testCode);
    }

    // responseType 'text': this endpoint returns an HTML document, not JSON.
    return this.httpClient.get(`${this.labelUrl}${testRegId}`, {
      params,
      responseType: 'text',
    });
  }

  /**
   * Fetches the labels and opens them in a new tab, where the print dialog opens
   * by itself.
   *
   * A blob URL rather than `document.write`: a blob document goes through a normal
   * load, so the `load` listener the API embeds actually fires and triggers the
   * dialog. A written document has usually finished loading by the time the write
   * completes, and the print would never happen.
   *
   * Returns false when the browser blocked the pop-up, so the caller can tell the
   * operator to allow pop-ups rather than leaving them wondering where the labels
   * went.
   */
  printLabels(
    testRegId: number,
    copies: number = 1,
    testCode?: string,
  ): Observable<boolean> {
    return new Observable<boolean>(subscriber => {
      const sub = this.getLabelHtml(testRegId, copies, testCode, true).subscribe({
        next: html => {
          const blob = new Blob([html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');

          if (!win) {
            URL.revokeObjectURL(url);
            subscriber.next(false);
            subscriber.complete();
            return;
          }

          // Revoke on a delay, not immediately: the tab is still loading from
          // this URL, and revoking too early leaves a blank window. 60s is far
          // more than a local blob needs and costs only a little memory.
          setTimeout(() => URL.revokeObjectURL(url), 60_000);

          subscriber.next(true);
          subscriber.complete();
        },
        error: err => subscriber.error(err),
      });

      return () => sub.unsubscribe();
    });
  }
}
