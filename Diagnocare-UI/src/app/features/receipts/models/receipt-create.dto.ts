/** DTO matching backend AddReceiptDTO — used when creating a new payment receipt. */
export interface ReceiptCreateDto {
  patientTestId: number;
  testAmount?: number;
  discount?: number;
  netAmount?: number;
  paymentType: string;
  amountPaid: number;
  amountPending: number;
  paymentMode: string;
  // TPA fields — only sent when paymentMode === 'TPA'
  tpaName?: string;
  tpaPolicyNumber?: string;
  tpaClaimNumber?: string;
  tpaApprovalCode?: string;
  tpaPolicyValidFrom?: string;  // ISO date string
  tpaPolicyValidTo?: string;    // ISO date string
  /**
   * Why the discount is being given. Required by the API when `discount` is above
   * the lab's max discount — that discount then goes to a Super Admin for approval.
   */
  discountReason?: string;
}
