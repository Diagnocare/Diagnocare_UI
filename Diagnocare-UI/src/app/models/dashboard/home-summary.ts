/**
 * Response of GET api/Dashboard/GetHomeSummary. Matches the API's HomeSummaryDto.
 *
 * Everything the home dashboard's hero draws, in one response: the KPI tiles, the
 * Live Activity rows and the week sparkline. The counts are all about the same day
 * and all at the grain their label claims, so the row adds up —
 * `testsBooked === reportsDone + testsPending`.
 */
export interface HomeSummary {
  /** dd-MM-yyyy — the day these figures describe. */
  date: string;
  /** Patients registered that day. People, not visits. */
  patientsToday: number;
  /** Individual tests booked that day — a three-test visit counts three. */
  testsBooked: number;
  /** Of those tests, how many already have results. */
  reportsDone: number;
  /** Of those tests, how many are still waiting for results. */
  testsPending: number;
  /**
   * Net collection for the day (receipts less refunds), or null when the signed-in
   * role may not see report data — the tile then shows a dash.
   */
  revenueToday: number | null;
  /** The day's three most recent bookings, newest first. */
  recentActivity: HomeActivity[];
  /** Monday–Sunday registration counts for the week containing the day. */
  weekRegistrations: HomeWeekDay[];
}

/** One row of the Live Activity card. */
export interface HomeActivity {
  patientId: string;
  patientName: string;
  /** Pending | Partial | Completed — across that booking's own tests. */
  status: string;
}

/** One bar of the week sparkline. */
export interface HomeWeekDay {
  /** dd-MM-yyyy. */
  date: string;
  /** Mon … Sun. */
  label: string;
  count: number;
  /** True for days that have not happened yet — drawn flat and faded. */
  future: boolean;
}
