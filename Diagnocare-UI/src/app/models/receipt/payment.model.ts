/** Result state of a single calculation. */
export interface PaymentCalcResult {
  state:      'idle' | 'balance' | 'return' | 'complete';
  difference: number;
}

/**
 * What the operator settled on, handed back to a caller that saves the payment
 * as part of its own record rather than as a receipt of its own.
 *
 * Field names match the form controls every payment-carrying form in the app
 * already uses (payment_Type, payment_Mode, amount_Paid, amount_Pending), so a
 * caller usually only has to patch its form with these four values.
 */
export interface PaymentModalResult {
  paymentType: string;
  paymentMode: string;
  amountPaid: number;
  amountPending: number;
  /** Cash handed over, when the operator filled it in. Null otherwise. */
  cashGiven: number | null;
  /** Change to give back. 0 when not applicable. */
  changeDue: number;
}
