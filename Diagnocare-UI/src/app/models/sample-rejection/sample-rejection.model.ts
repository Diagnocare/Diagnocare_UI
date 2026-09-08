/**
 * Collected samples that could not be used, and why.
 *
 * The protocol library already says when a sample must be refused
 * (`TestProtocolDto.rejectionCriteria`); these types are the record that it happened — so
 * the next person to open the booking sees the test is waiting on a fresh sample rather
 * than wondering why no result has appeared.
 */

/** Why a sample was refused, at the level a lab reviews it. Matches the API enum. */
export enum SampleRejectionCategory {
  /** The sample itself is unusable — haemolysed, clotted, too little, contaminated. */
  CollectionQuality = 0,
  /** The sample may be fine, but the protocol was not followed — wrong tube, unlabelled. */
  ProtocolNotFollowed = 1,
  /** Neither of the above. Requires a note. */
  Other = 2,
}

/** Where a rejection has got to. Matches the API enum. */
export enum SampleRejectionStatus {
  /** Rejected; a fresh sample is still needed. */
  AwaitingRecollection = 0,
  /** A fresh sample has been collected and the test can proceed. */
  Recollected = 1,
  /** Recorded in error, and withdrawn. */
  Withdrawn = 2,
}

/** One standard reason, as offered in the picker. Served by the API, never hard-coded here. */
export interface SampleRejectionReasonDto {
  code: string;
  label: string;
  category: SampleRejectionCategory;
  categoryLabel: string;
}

/** A rejected sample, as shown on the test it stopped. */
export interface SampleRejectionDto {
  rejectionId: number;
  testRegId: number;
  testCode: string;
  testName: string;

  category: SampleRejectionCategory;
  categoryLabel: string;

  reasonCode: string;
  /** The reason as worded when it was recorded, not as the catalogue reads today. */
  reasonLabel: string;

  notes: string | null;

  rejectedAt: string;
  rejectedBy: string | null;

  status: SampleRejectionStatus;
  statusLabel: string;

  /** True while a fresh sample is still needed. What makes this row a job rather than history. */
  isOpen: boolean;

  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

/** Every rejection recorded against one test on one booking, newest first. */
export interface SampleRejectionHistoryDto {
  testRegId: number;
  testCode: string;
  testName: string;

  rejectionCount: number;

  /** The rejection still waiting on a fresh sample, if there is one. */
  openRejection: SampleRejectionDto | null;

  rejections: SampleRejectionDto[];
}

/** The rejection state of one test, as returned for a whole booking in one call. */
export interface SampleRejectionSummaryDto {
  testCode: string;
  rejectionCount: number;

  /** True while this test is waiting on a fresh sample. */
  hasOpenRejection: boolean;

  latestReasonLabel: string | null;
  latestCategoryLabel: string | null;
  latestRejectedAt: string | null;
}

/** Records that a collected sample could not be used. */
export interface RejectSampleDto {
  testRegId: number;
  testCode: string;

  /** A code from the standard list. Anything else is refused by the API. */
  reasonCode: string;

  /** What the operator saw. Required when the reason is OTHER. */
  notes?: string | null;

  rejectedBy?: string | null;
}

/** Closes a rejection — a fresh sample arrived, or it was recorded in error. */
export interface ResolveSampleRejectionDto {
  rejectionId: number;
  status: SampleRejectionStatus;
  note?: string | null;
  resolvedBy?: string | null;
}

/** The code the API treats as "nothing in the list fits" — the one that demands a note. */
export const OTHER_REASON_CODE = 'OTHER';
