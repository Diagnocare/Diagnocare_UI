/**
 * How many times a test was run on a patient's collected sample.
 *
 * A result that looks wrong gets checked by running the test again on the same sample.
 * Result rows carry no version, so the repeat overwrites the first values and the finished
 * report shows no sign that anyone doubted it. These types describe the record that keeps
 * the repeat, and the reason for it, from disappearing with the numbers.
 */

/** One run of a test on the collected sample. */
export interface TestRunDto {
  runId: number;
  testRegId: number;
  testCode: string;

  /** 1 for the original run, 2 for the first repeat, and so on. */
  runNo: number;

  /** Why the test was run again. Null on the original run. */
  reason: string | null;

  performedBy: string | null;
  performedAt: string;

  /** True for the run the lab stands behind — the one whose values belong on the report. */
  isAccepted: boolean;

  remark: string | null;

  /**
   * True for the run whose values are actually stored.
   *
   * Results overwrite, so only the newest run's numbers exist. Accepting an earlier run is a
   * statement about which result was right; it does not bring that run's numbers back.
   */
  holdsStoredValues: boolean;
}

/** Every run of one test on one booking. */
export interface TestRunHistoryDto {
  testRegId: number;
  testCode: string;
  testName: string;

  /**
   * How many times the test has been run. 0 means it has never been repeated — not that it
   * was never done. Runs are recorded from the first repeat onwards.
   */
  runCount: number;

  acceptedRunNo: number | null;
  runs: TestRunDto[];
}

/** Run counts for one test, as returned for a whole booking in one call. */
export interface TestRunCountDto {
  testCode: string;
  runCount: number;
  acceptedRunNo: number | null;

  /** The most recent repeat's reason, for a tooltip without opening the history. */
  latestReason: string | null;
}

/** Records that a test was run again on the sample already collected. */
export interface RepeatTestRunDto {
  testRegId: number;
  testCode: string;

  /** Required. A repeat with no reason is the record that tells a later reviewer nothing. */
  reason: string;

  performedBy?: string | null;
  remark?: string | null;
}

/** What came back from marking a run accepted. */
export interface AcceptTestRunResultDto {
  success: boolean;
  message: string;
  acceptedRunNo: number;

  /**
   * True when the accepted run is not the one holding the stored values, so the numbers on
   * the report still belong to a different run and have to be re-entered by hand.
   */
  valuesNeedReEntry: boolean;
}

/** The shape the API returns from Repeat. */
export interface OperationResultDto {
  success: boolean;
  message: string;
  token: string | null;
}
