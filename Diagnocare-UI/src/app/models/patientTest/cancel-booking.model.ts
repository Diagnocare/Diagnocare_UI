import { patientTest } from 'src/app/models/patientTest/patientTestModel';

/** One test-code row derived from a PatientTest booking. */
export interface TestCodeRow {
  /** Individual test code, e.g. "CBC". */
  code:           string;
  /** Unique key: `${booking.patient_Test_Id}:${code}` */
  key:            string;
  /** Parent PatientTest. */
  booking:        patientTest;
  /**
   * This test's share of the booking's net_Amount (after proportional discount).
   * Used as the "Net Price" column.
   */
  pricePerCode:   number;
  /** Refundable amount = proportion × amount_Paid. */
  refundPerCode:  number;
  /** Raw catalog price before any discount (null when prices unavailable). */
  catalogPrice:   number | null;
}

/** All codes belonging to one booking, grouped for display. */
export interface BookingGroup {
  booking:       patientTest;
  rows:          TestCodeRow[];
  /** Count of selected codes for this booking. */
  selectedCount: number;
  /** Proportional refund = (selectedCount / rows.length) * amount_Paid. */
  refundForGroup: number;
}

/** Emitted when user confirms cancellation. */
export interface CancelConfirmPayload {
  /** One entry per affected booking (each booking whose codes were fully/partially selected). */
  bookingCancels: {
    booking:      patientTest;
    selectedCodes: string[];
    /** Proportional refund amount to issue against this booking's receipt. */
    refundAmount: number;
  }[];
  reason:               string | null;
  totalEligibleRefund:  number;
}
