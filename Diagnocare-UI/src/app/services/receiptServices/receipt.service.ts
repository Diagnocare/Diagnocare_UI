
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { Receipt, ReceiptCount } from 'src/app/models/receipt/receiptModel';
import { ReceiptCreateDto } from 'src/app/models/receipt/receipt-create.dto';
import { TpaDetails } from 'src/app/models/tpa/tpa-details.model';
import { map } from 'rxjs/operators';


@Injectable({
  providedIn: 'root',
})
export class ReceiptService {
  private apiUrl = getDiagnocareApiUrl() + controllerEndpoints.receipt;

  constructor(private http: HttpClient) {}

  getReceiptCount(searchValue: string): Observable<ReceiptCount> {
    return this.http
      .get<ReceiptCount>(
        `${this.apiUrl}${apiEndpoints.getReceiptCount}?searchValue=${encodeURIComponent(searchValue)}`
      )
      .pipe(catchError(this.handleError));
  }

  getReceiptList(searchValue: string): Observable<Receipt[]> {
    return this.http
      .get<Receipt[]>(
        `${this.apiUrl}${apiEndpoints.getAllList}?searchValue=${encodeURIComponent(searchValue)}`
      )
      .pipe(catchError(this.handleError));
  }

  getReceiptById(receiptId: number): Observable<any> {
    return this.http
      .get<any>(
        `${this.apiUrl}${apiEndpoints.getById}?receiptId=${receiptId}`
      )
      .pipe(catchError(this.handleError));
  }

  /** POST api/receipt/Add — creates a new payment receipt. */
  addReceipt(data: ReceiptCreateDto): Observable<any> {
    return this.http
      .post(`${this.apiUrl}${apiEndpoints.add}`, data)
      .pipe(catchError(this.handleError));
  }

  /**
   * GET api/receipt/GenerateReceiptPdf?receiptId=X
   * Calls backend to generate a receipt PDF and returns the PDF blob for display.
   * Handles both a direct blob response and a base64-encoded JSON response.
   */
  generateReceiptPdf(receiptId: number): Observable<Blob> {
    return this.http
      .get(
        `${this.apiUrl}${apiEndpoints.generateReceiptPdf}?receiptId=${receiptId}`,
        { responseType: 'blob' }
      )
      .pipe(
        map((blob: Blob) => {
          // If backend returns application/json (base64 payload), convert it
          if (blob.type === 'application/json') {
            return blob; // caller will handle via FileReader if needed
          }
          return blob;
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Updates TPA details on an existing TPA receipt.
   * PUT api/receipt/UpdateTpaDetails
   */
  updateTpaDetails(receiptId: number, tpa: TpaDetails): Observable<void> {
    return this.http
      .put<void>(
        `${this.apiUrl}${apiEndpoints.updateTpaDetails}`,
        {
          receiptId,
          tpaName:            tpa.tpaName,
          tpaPolicyNumber:    tpa.tpaPolicyNumber,
          tpaClaimNumber:     tpa.tpaClaimNumber,
          tpaApprovalCode:    tpa.tpaApprovalCode    || null,
          tpaPolicyValidFrom: tpa.tpaPolicyValidFrom || null,
          tpaPolicyValidTo:   tpa.tpaPolicyValidTo   || null,
          tpaPaymentStatus:   tpa.tpaPaymentStatus   || 'Pending',
          tpaSettledDate:     tpa.tpaSettledDate     || null,
        }
      )
      .pipe(catchError(this.handleError));
  }

  /**
   * Issues a refund against an existing receipt.
   * PUT api/receipt/Refund
   */
  refundReceipt(receiptId: number, refundAmount: number, reason?: string): Observable<any> {
    return this.http
      .put<any>(
        `${this.apiUrl}${apiEndpoints.refundReceipt}`,
        { receiptId, refundAmount, reason: reason ?? null }
      )
      .pipe(catchError(this.handleError));
  }

  private handleError(error: HttpErrorResponse) {
    const message = error.error?.message || error.statusText || 'Unknown server error';
    return throwError(() => new Error(`API error: ${message} (status ${error.status})`));
  }
}
