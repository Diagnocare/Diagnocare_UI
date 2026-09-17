import { WorkQueue } from 'src/app/utilities/work-queue.util';

/**
 * One unit of work: a single test inside a single booking.
 *
 * Mirrors WorklistItemDto on the API. The grain is deliberately the test and not
 * the booking — a three-test booking is three jobs that finish at different
 * times, so a row per booking would either hide progress or claim work is done
 * when two thirds of it is still on an analyser.
 */
export interface WorklistItem {
  /** The booking. Shown to users as the order number. */
  testRegId: number;
  testCode: string;
  testName: string;

  patientId: string;
  patientName: string;

  /**
   * Carried on every row because reference ranges for haemoglobin, creatinine
   * and most hormones differ by both. Seeing "47 / M" beside the range is what
   * lets a technician catch a wrong-patient entry before it reaches a report.
   */
  patientAge: string;
  patientGender: string;

  /** Which queue this is in. Resolved server-side so every screen agrees. */
  queue: WorkQueue;

  /** Set only in needs-attention: what is blocking, in the user's words. */
  blockedReason?: string | null;

  parameterCount: number;
  savedResultCount: number;

  urgent: boolean;
  bookedAt?: string | null;
  samplingDoneAt?: string | null;

  verifiedAt?: string | null;
  verifiedBy?: string | null;

  /** Set only in the 'returned' queue: why a verifier sent these results back. */
  returnedReason?: string | null;
  returnedBy?: string | null;
  returnedAt?: string | null;

  referredBy?: string;
  bookingStatus?: string;

  /** Unpaid | Part-paid | Paid. Never "Pending" — that word means results here. */
  paymentStatus?: string;
}

/** How many items are in one queue. Drives the tiles. */
export interface WorklistCount {
  queue: WorkQueue;
  count: number;
}

/**
 * A page of one queue plus the counts for all of them.
 *
 * The counts arrive with the page rather than from a second call: the tiles are
 * the screen's only navigation, so a count that lagged behind the list would
 * send someone to a queue that has already emptied.
 */
export interface WorklistPage {
  items: WorklistItem[];
  counts: WorklistCount[];
  totalItems: number;
  pageNumber: number;
  pageSize: number;
}

/** Query for one worklist page. Every field optional — the default is "this week's work". */
export interface WorklistQuery {
  queue?: WorkQueue | null;
  from?: string | null;
  to?: string | null;
  searchTerm?: string | null;
  pageNumber?: number;
  pageSize?: number;
}

/**
 * Records a collection against the whole booking — one draw covers every test
 * on the visit, so this is asked once and moves all of them.
 */
export interface MarkSampleCollectedRequest {
  testRegId: number;
  /** One of the lab's sampling locations. Blank is refused by the API. */
  samplingDoneAt: string;
}

export interface VerifyRequest {
  testRegId: number;
  testCode: string;
  comment?: string | null;
}

/** Pulls an already-issued report back. The counterpart to a pre-sign-off rejection. */
export interface RecallReportRequest {
  testRegId: number;
  testCode: string;
  /** Required. A report that reached a patient was withdrawn — that needs saying. */
  reason: string;
}

export interface ReturnForReentryRequest {
  testRegId: number;
  testCode: string;
  /** Required by the API. Sending work back without a reason is how it comes straight back. */
  reason: string;
}
