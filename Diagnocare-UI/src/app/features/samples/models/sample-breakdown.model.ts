/**
 * How a booking's tests distribute across the samples that have to be collected.
 *
 * The shape answers one question the rest of the app could not: a patient gives one tube and
 * several tests are run off it, and until now every screen treated each booked test as its
 * own independent thing — five blood tests read as five collections.
 *
 * Derived on the server from the protocol library on every request, never stored, so it says
 * what the booking needs *now*: an admin who re-links a protocol changes this answer.
 */

/** One test inside a sample group, and the protocol that put it there. */
export interface SampleTestDto {
  testRegId: number;
  testCode: string;
  testName: string;

  /** The protocol that placed this test on this sample. Null for an unlinked test. */
  protocolCode: string | null;
  protocolName: string | null;

  /** The link's note, where the lab wrote one — "second draw, 2 hours after the first". */
  note: string | null;
}

/**
 * One specimen: a distinct sample type and container, and every test run off it.
 *
 * This is the unit staff handle — the tube. `testCount` is the number this whole module
 * exists to produce.
 */
export interface SampleGroupDto {
  /** Normalised sample type and container. A stable list key, not shown to anyone. */
  sampleKey: string;

  sampleType: string;
  containerType: string | null;
  sampleQuantity: string | null;

  fastingRequired: boolean;
  /** The longest fast any protocol on this sample demands, not the first. */
  fastingHours: number | null;

  /** Distinct tests run off this sample. */
  testCount: number;

  /**
   * Collections this sample needs. Equal to `testCount` normally, and greater when one test
   * repeats the same draw — a tolerance test is one test and several draws.
   */
  drawCount: number;

  tests: SampleTestDto[];
}

/** The whole breakdown for a booking, or for a basket of test codes. */
export interface SampleBreakdownDto {
  /** The booking, or 0 when asked for a basket of codes. */
  testRegId: number;

  /** How many samples must be collected — the tube count. */
  sampleCount: number;

  /** Distinct tests that landed in a group. Excludes tests with no protocol. */
  testCount: number;

  /** True when the booking was cancelled. The API refuses those, so this is defensive. */
  isCancelled: boolean;

  samples: SampleGroupDto[];

  /**
   * Tests nobody has linked a protocol to. The tube count is incomplete while these exist,
   * and the panel says so rather than quietly under-reporting.
   */
  testsWithoutProtocol: SampleTestDto[];
}

/** A breakdown that says nothing, used when a request fails or nothing was asked for. */
export function emptySampleBreakdown(): SampleBreakdownDto {
  return {
    testRegId: 0,
    sampleCount: 0,
    testCount: 0,
    isCancelled: false,
    samples: [],
    testsWithoutProtocol: [],
  };
}
