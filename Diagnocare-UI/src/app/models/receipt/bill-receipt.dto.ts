/**
 * Shape of bill_Reciept as returned by the backend GET endpoints
 * (patientTest list, etc.).  Field names match the C# serialised response
 * exactly — snake_Case as sent by the API.
 *
 * ⚠  This is a READ model only.  For creating/updating receipts use ReceiptCreateDto.
 */
export interface BillReceiptDto {
  receipt_Id:     number;
  test_Amount:    number | null;
  discount:       number | null;
  net_Amount:     number | null;
  payment_Type:   string;           // "Full" | "Partial"
  amount_Paid:    number;
  amount_Pending: number;
  payment_Mode:   string;           // "Cash" | "Online" | …
  payment_Status: string;           // "Paid" | "Partial" | "Pending"
  // Refund fields
  is_Refunded:    boolean;
  refund_Amount:  number | null;
  refunded_At:    string | null;
  refund_Reason:  string | null;
}
