/** Mirrors the API's DiscountApprovalItemDto (camelCase over the wire). */
export interface DiscountApprovalItem {
  receiptId:          number;
  patientTestId:      number;
  patientId:          string;
  patientName:        string;
  /** Comma-separated test codes. */
  testIds:            string;
  /** 'Active' | 'Cancelled' */
  bookingStatus:      string;
  testAmount:         number;
  requestedDiscount:  number;
  limitAtRequest:     number;
  requestedNetAmount: number;
  /** Net if rejected — discount capped at the limit. */
  netAmountAtLimit:   number;
  grantedDiscount:    number;
  reason:             string | null;
  requestedById:      number | null;
  requestedByName:    string;
  requestedAt:        string | null;
  status:             'Pending' | 'Approved' | 'Rejected';
  reviewedByName:     string | null;
  reviewedAt:         string | null;
  reviewRemark:       string | null;
}
