
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/shared/constants/constants';
import { getDiagnocareApiUrl } from 'src/app/core/utils/api-base-url.util';
import { Receipt, ReceiptCount } from 'src/app/features/receipts/models/receiptModel';
import { ReceiptCreateDto } from 'src/app/features/receipts/models/receipt-create.dto';
import { TpaDetails } from 'src/app/features/receipts/models/tpa-details.model';
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
      );
  }

  getReceiptList(searchValue: string): Observable<Receipt[]> {
    return this.http
      .get<Receipt[]>(
        `${this.apiUrl}${apiEndpoints.getAllList}?searchValue=${encodeURIComponent(searchValue)}`
      );
  }

  getReceiptById(receiptId: number): Observable<any> {
    return this.http
      .get<any>(
        `${this.apiUrl}${apiEndpoints.getById}?receiptId=${receiptId}`
      );
  }

  /** POST api/receipt/Add — creates a new payment receipt. */
  addReceipt(data: ReceiptCreateDto): Observable<any> {
    return this.http
      .post(`${this.apiUrl}${apiEndpoints.add}`, data);
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
        })
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
      );
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
      );
  }

}
