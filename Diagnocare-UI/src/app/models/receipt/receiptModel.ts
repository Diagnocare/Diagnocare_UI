export interface Receipt {
  receiptId:     number;
  patientTestId: number;
  netAmount:     number;
  amountPaid:    number;
  amountPending: number;
  paymentType:   string;
  paymentMode:   string;
  createdDate:   string;
  // Refund fields (populated after a refund is issued)
  isRefunded:    boolean;
  refundAmount:  number | null;
  refundedAt:    string | null;
  refundReason:  string | null;
  /** Booking lifecycle: "Active" | "Cancelled" — from the parent PatientTest. */
  bookingStatus: string;
  // TPA fields — populated only when paymentMode === 'TPA'
  tpaName:            string | null;
  tpaPolicyNumber:    string | null;
  tpaClaimNumber:     string | null;
  tpaApprovalCode:    string | null;
  tpaPolicyValidFrom: string | null;
  tpaPolicyValidTo:   string | null;
  /** "Pending" | "Approved" | "Settled" */
  tpaPaymentStatus:   string | null;
  tpaSettledDate:     string | null;
}

/**
 * Receipts for a single patientTestId, grouped together for display.
 * Derived client-side by grouping the flat Receipt[] from the API.
 */
export interface ReceiptGroup {
  patientTestId: number;
  receipts:      Receipt[];
  /** Net amount billed for this test (from first receipt record). */
  netAmount:     number;
  /** Sum of all amountPaid across every receipt in this group. */
  totalPaid:     number;
  /** Remaining balance = netAmount − totalPaid (min 0). */
  remaining:     number;
  /** 'Paid' | 'Partial' | 'Pending' — derived from remaining vs totalPaid. */
  paymentStatus: string;
  /** True when the underlying PatientTest booking has been cancelled. */
  isCancelled: boolean;
  /** Sum of all refundAmount for refunded receipts in this group. */
  totalRefunded: number;
}

export interface ReceiptCount {
  searchTerm:    string;
  receiptCount:  number;
}