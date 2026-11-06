/** Minimal receipt shape needed to derive a payment label. */
export interface PaymentReceiptLike {
  amount_Paid?: number | null;
  amount_Pending?: number | null;
  payment_Status?: string | null;
  /** 'NotRequired' | 'Pending' | 'Approved' | 'Rejected' */
  discount_Approval_Status?: string | null;
}

/** Minimal booking shape needed to derive a payment label. */
export interface PaymentContext {
  booking_Status?: string | null;
  bill_Reciept?: PaymentReceiptLike | null;
}

/**
 * Patient Status Utility Module
 * Provides reusable functions for managing patient and test statuses across the application.
 * Ensures consistent status calculation and filtering logic.
 */

export type PatientStatus = 'Pending' | 'Partial' | 'Completed';

export type TestStatus = 'Pending' | 'Partial' | 'Completed';

/**
 * Payment status values shown in the UI.
 *   Active bookings:   'Pending' | 'Partial' | 'Paid'
 *   Cancelled bookings:'Payment Settled' | 'Payment Not Needed'
 *
 * Once a booking is cancelled the "Partial" label is no longer meaningful, so it
 * is replaced by one of the two cancellation labels (see resolvePaymentStatus).
 */
export type PaymentDisplayStatus =
  | 'Pending'
  | 'Partial'
  | 'Paid'
  | 'Payment Settled'
  | 'Payment Not Needed'
  /** Discount over the lab limit is waiting for a Super Admin — payment is held. */
  | 'Awaiting Approval';
