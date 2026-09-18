import { patientTest } from '../models/patientTest/patientTestModel';
import { PatientListDto } from '../models/patient/patient-list.dto';

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
  | 'Payment Not Needed';

/** Minimal receipt shape needed to derive a payment label. */
export interface PaymentReceiptLike {
  amount_Paid?: number | null;
  amount_Pending?: number | null;
  payment_Status?: string | null;
}

/** Minimal booking shape needed to derive a payment label. */
export interface PaymentContext {
  booking_Status?: string | null;
  bill_Reciept?: PaymentReceiptLike | null;
}

/**
 * Determines if a patient has any pending or partial tests.
 * Used to decide whether patient status should be "Completed" or not.
 *
 * @param tests Array of patient tests
 * @returns true if at least one test is not completed
 */
export function hasPendingTests(tests: patientTest[] | null | undefined): boolean {
  if (!tests || !Array.isArray(tests)) return false;

  return tests.some(test => {
    // Skip cancelled bookings
    if ((test.booking_Status || '').toLowerCase() === 'cancelled') {
      return false;
    }

    const status = (test.is_Report_Generated || '').toLowerCase();
    return status !== 'completed';
  });
}

/**
 * Calculates the patient's overall status based on their test statuses.
 * Rules:
 *   - If no active tests (all cancelled or no tests): "Completed"
 *   - If all active tests are completed: "Completed"
 *   - If some tests are completed and some are pending/partial: "Partial"
 *   - If all tests are pending: "Pending"
 *
 * @param tests Array of patient tests
 * @returns The calculated patient status
 */
export function calculatePatientStatus(tests: patientTest[] | null | undefined): PatientStatus {
  if (!tests || !Array.isArray(tests) || tests.length === 0) {
    return 'Completed';
  }

  // Filter out cancelled bookings
  const activeTests = tests.filter(test => {
    const bookingStatus = (test.booking_Status || '').toLowerCase();
    return bookingStatus !== 'cancelled';
  });

  // If no active tests, patient is completed
  if (activeTests.length === 0) {
    return 'Completed';
  }

  const testStatuses = activeTests.map(test => {
    const status = (test.is_Report_Generated || '').toLowerCase();
    // Normalize to proper case
    if (status === 'completed') return 'Completed' as TestStatus;
    if (status === 'pending') return 'Pending' as TestStatus;
    if (status === 'partial') return 'Partial' as TestStatus;
    return 'Pending' as TestStatus; // default
  });

  const hasCompleted = testStatuses.includes('Completed');
  const hasPending = testStatuses.includes('Pending');
  const hasPartial = testStatuses.includes('Partial');

  // All completed
  if (!hasPending && !hasPartial) {
    return 'Completed';
  }

  // Mix of statuses or some partial
  if (hasCompleted || hasPartial) {
    return 'Partial';
  }

  // All pending
  return 'Pending';
}

/**
 * Filters patients to show only those with active (non-completed) status.
 * Hides completed patients from the main list view.
 *
 * @param patients Array of patient list DTOs
 * @returns Filtered array containing only Partial and Pending patients
 */
export function filterActivePatients(patients: PatientListDto[]): PatientListDto[] {
  if (!patients || !Array.isArray(patients)) return [];

  return patients.filter(patient => {
    const status = (patient.status || '').toLowerCase();
    return status !== 'completed';
  });
}

/**
 * Filters patients to show only those with completed status.
 * Used when accessing archived/completed reports.
 *
 * @param patients Array of patient list DTOs
 * @returns Filtered array containing only Completed patients
 */
export function filterCompletedPatients(patients: PatientListDto[]): PatientListDto[] {
  if (!patients || !Array.isArray(patients)) return [];

  return patients.filter(patient => {
    const status = (patient.status || '').toLowerCase();
    return status === 'completed';
  });
}

/**
 * Determines if a completed patient has a report available for download.
 * A completed patient has a report available if they have at least one test with a completed report.
 *
 * @param patient Patient data with test information
 * @returns true if report is available for download
 */
export function isReportAvailable(patient: PatientListDto | patientTest): boolean {
  if (!patient) return false;

  // For PatientListDto
  if ('lstPatientTests' in patient) {
    const tests = patient.lstPatientTests;
    if (!tests || !Array.isArray(tests)) return false;
    return tests.some(test => {
      const status = (test.is_Report_Generated || '').toLowerCase();
      const bookingStatus = (test.booking_Status || '').toLowerCase();
      return status === 'completed' && bookingStatus !== 'cancelled';
    });
  }

  // For patientTest
  const status = (patient.is_Report_Generated || '').toLowerCase();
  const bookingStatus = (patient.booking_Status || '').toLowerCase();
  return status === 'completed' && bookingStatus !== 'cancelled';
}

/**
 * Gets a human-readable label for patient status with optional detail.
 * Useful for UI display and logging.
 *
 * @param status The patient status
 * @returns Display label
 */
export function getStatusLabel(status: PatientStatus | string): string {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return 'Completed';
    case 'partial':
      return 'Partial';
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown';
  }
}

/**
 * Gets the CSS class for styling a status badge.
 * Maps status to Bootstrap/Tailwind class names.
 *
 * @param status The patient status
 * @returns CSS class name
 */
export function getStatusClass(status: PatientStatus | string): string {
  switch ((status || '').toLowerCase()) {
    case 'completed':
      return 'status-completed badge-success';
    case 'partial':
      return 'status-partial badge-warning';
    case 'pending':
      return 'status-pending badge-danger';
    default:
      return 'badge-secondary';
  }
}

/**
 * Checks if a status transition is valid.
 * Prevents invalid state transitions.
 *
 * @param fromStatus Current status
 * @param toStatus Target status
 * @returns true if transition is valid
 */
export function isValidStatusTransition(fromStatus: PatientStatus, toStatus: PatientStatus): boolean {
  // Any status can transition to Completed (when all tests complete/cancel)
  if (toStatus === 'Completed') return true;

  // Can transition from Pending to Partial (when some tests complete)
  if (fromStatus === 'Pending' && toStatus === 'Partial') return true;

  // Can transition from Partial to Pending (edge case: when tests are re-opened)
  if (fromStatus === 'Partial' && toStatus === 'Pending') return true;

  // No transition to Pending from Completed (invalid)
  // No transition to Pending from Partial (use other methods)
  return false;
}

/**
 * Resolves the payment status label for a booking, applying cancellation rules.
 *
 * Rules:
 *   - Cancelled booking with any amount paid   → 'Payment Settled'
 *       (money was collected; any refund is handled separately — no further
 *        payment is required from the patient, so "Partial" no longer applies)
 *   - Cancelled booking with nothing paid      → 'Payment Not Needed'
 *       (cancellation voids the payment requirement entirely)
 *   - Active booking with an explicit backend payment_Status → that value
 *   - Active booking, no explicit status       → derived from amount_Pending
 *       (pending > 0 → 'Partial', otherwise 'Paid')
 *   - No receipt at all                         → 'Pending'
 *
 * Reusable across patient list views, test-list cards, and reporting screens.
 *
 * @param test Booking-like object with booking_Status and bill_Reciept
 * @returns The payment status label to display
 */
export function resolvePaymentStatus(test: PaymentContext | null | undefined): PaymentDisplayStatus {
  const cancelled = (test?.booking_Status || '').toLowerCase() === 'cancelled';
  const receipt = test?.bill_Reciept ?? null;
  const amountPaid = receipt?.amount_Paid ?? 0;

  if (cancelled) {
    return amountPaid > 0 ? 'Payment Settled' : 'Payment Not Needed';
  }

  if (!receipt) return 'Pending';

  // Trust an explicit backend-provided status when present.
  const raw = (receipt.payment_Status || '').trim();
  if (raw === 'Payment Settled' || raw === 'Payment Not Needed') return raw;
  if (raw === 'Paid' || raw === 'Partial' || raw === 'Pending') return raw as PaymentDisplayStatus;

  // Fallback: derive from the pending balance.
  return (receipt.amount_Pending ?? 0) > 0 ? 'Partial' : 'Paid';
}

/**
 * Full badge label including the "Payment :" prefix for active bookings.
 * Cancelled labels are already self-descriptive ("Payment Settled" /
 * "Payment Not Needed") so they are returned as-is without a prefix.
 */
export function getPaymentBadgeLabel(test: PaymentContext | null | undefined): string {
  const status = resolvePaymentStatus(test);
  return status.startsWith('Payment ') ? status : `Payment : ${status}`;
}

/**
 * CSS badge class for a payment status label.
 *
 * @param status A PaymentDisplayStatus (or the owning booking)
 */
export function getPaymentStatusClass(status: PaymentDisplayStatus | PaymentContext | null | undefined): string {
  const value: string = typeof status === 'string' ? status : resolvePaymentStatus(status);
  switch (value) {
    case 'Paid':
    case 'Payment Settled':    return 'badge-success';
    case 'Payment Not Needed': return 'badge-secondary';
    case 'Partial':            return 'badge-warning';
    default:                   return 'badge-danger';   // Pending
  }
}
