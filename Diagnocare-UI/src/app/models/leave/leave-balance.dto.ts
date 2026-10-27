/**
 * Paid leave: accumulated balances and the year-end carry-forward.
 *
 * Mirrors Model/Dtos/Leave/LeaveDtos.cs. Two rules shape every field here:
 *
 *  1. Unused leave does not expire at month end — it accumulates, so a month can
 *     cover more absence than its own allocation.
 *  2. The year-end carry-forward is capped at a percentage of the ANNUAL
 *     entitlement (Lab Setup, default 50%), never of the unused balance.
 */

/** One month of the ledger. The opening balance is the previous month's closing balance. */
export interface LeaveMonthRowDTO {
  /** 1 = January … 12 = December. */
  month: number;
  /** e.g. "Jan 2026". */
  monthLabel: string;
  /** Brought in from the previous month; January's is the year's carry-forward. */
  openingBalance: number;
  /** Earned this month — the monthly allocation, or 0 for a month off the payroll. */
  accrued: number;
  /** openingBalance + accrued. */
  available: number;
  absentDays: number;
  halfDays: number;
  /** absentDays + halfDays / 2. */
  leaveUsed: number;
  /** The part of leaveUsed the balance covered. */
  paidLeaveUsed: number;
  /** The part it did not — what payroll deducts for. */
  unpaidLeaveDays: number;
  /** Rolls into the next month. */
  closingBalance: number;
  /** False outside the employee's dates of employment. */
  isAccrualMonth: boolean;
}

/** An employee's paid-leave position for one leave year (January–December). */
export interface LeaveBalanceDTO {
  userId: number;
  fullName: string;
  leaveYear: number;

  /**
   * False when the employee has no salary configuration or a zero monthly
   * allocation — leave tracking is off for them and every figure below is 0.
   */
  isConfigured: boolean;

  /** Paid leave days granted per month. */
  monthlyEntitlement: number;

  /**
   * Monthly allocation × months on the payroll this year (2/month = 24 days).
   * The carry-forward cap is a percentage of THIS.
   */
  annualEntitlement: number;

  /** Entitlement earned so far this year — only this much is spendable yet. */
  accruedToDate: number;

  /** Days carried in from the previous leave year. */
  carryForwardIn: number;

  /** Leave used so far this year, half days counting as 0.5. */
  leaveUsed: number;

  /** accruedToDate − leaveUsed, floored at 0. Excludes the carry-forward. */
  currentUnusedBalance: number;

  /** What can actually be taken now: carryForwardIn + accruedToDate − leaveUsed, floored at 0. */
  availableLeave: number;

  /** Days taken that no balance covered, and which were therefore deducted from salary. */
  unpaidLeaveDays: number;

  /** Last month included in the running totals. */
  asOfMonth: number;
  /** e.g. "Oct 2026". */
  asOfLabel: string;

  /** The lab's Paid Leave Carry Forward (%) from Lab Setup. */
  carryForwardPercent: number;
  /** annualEntitlement × carryForwardPercent / 100. */
  maxCarryForward: number;
  /** MIN(projected unused, maxCarryForward). Indicative — it moves with every leave taken. */
  projectedCarryForward: number;

  months: LeaveMonthRowDTO[];
}

/** One employee's line in a year-end carry-forward run or preview. */
export interface LeaveYearEndEmployeeDTO {
  userId: number;
  fullName: string;
  annualEntitlement: number;
  /** Closing balance of the year. */
  unusedLeave: number;
  /** The ceiling: annualEntitlement × percentage. */
  maxCarryForward: number;
  /** MIN(unusedLeave, maxCarryForward). */
  carriedForwardDays: number;
  /** Unused days above the cap, which lapse. */
  lapsedDays: number;
  /** True when the employee already had a row, so this run left it untouched. */
  alreadyProcessed: boolean;
}

/** Outcome of one leave-year transition. */
export interface LeaveYearEndResultDTO {
  /** The year that closed. */
  closingYear: number;
  /** The year the days were carried into — always closingYear + 1. */
  openingYear: number;
  carryForwardPercent: number;
  /** True when every employee already had a row, so nothing was written. */
  alreadyProcessed: boolean;
  /** True when nothing was written because this was a preview. */
  isPreview: boolean;
  employeesProcessed: number;
  employeesSkipped: number;
  totalDaysCarriedForward: number;
  message: string;
  employees: LeaveYearEndEmployeeDTO[];
}
