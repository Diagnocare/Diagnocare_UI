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
}
