// ── Salary status ─────────────────────────────────────────────────────────────

export enum SalaryStatus {
  Pending       = 'Pending',
  PartiallyPaid = 'PartiallyPaid',
  Paid          = 'Paid',
}

// ── Payment type ──────────────────────────────────────────────────────────────

/**
 * Whether the payment settles the full outstanding balance or is a partial installment.
 * String values match the backend PaymentType enum.
 */
export enum PaymentType {
  Partial = 'Partial',
  Full    = 'Full',
}

// ── Payment source ────────────────────────────────────────────────────────────

/**
 * Which salary component a payment is being made against.
 * Numeric values match the backend PaymentSource enum:
 *   1 = BaseSalary, 2 = TravelAllowance, 3 = OtherAllowance
 */
export enum PaymentFor {
  BaseSalary      = 1,
  TravelAllowance = 2,
  OtherAllowance  = 3,
  /**
   * UI-only sentinel for "settle every component at once", offered on Full
   * payments. It is NEVER sent as a payment source or persisted — selecting it
   * routes the save to PayAllComponents, which writes one real row per
   * component (each with its own source of 1/2/3).
   */
  AllComponents   = 99,
}

export const PaymentForLabels: Record<PaymentFor, string> = {
  [PaymentFor.BaseSalary]:      'Base Salary',
  [PaymentFor.TravelAllowance]: 'Travel Allowance',
  [PaymentFor.OtherAllowance]:  'Other Allowance',
  [PaymentFor.AllComponents]:   'All Components',
};

/** Request body for POST api/salary/PayAllComponents. */
export interface PayAllComponentsDTO {
  salaryId:     number;
  paymentMonth: string;
  paymentDate:  string;
  reference?:   string | null;
}

// ── Salary config (per user, persisted setting) ───────────────────────────────

export interface UserSalaryConfigDTO {
  configId:                 number;
  userId:                   number;
  fullName:                 string;
  baseSalary:               number;
  pfPercentage:             number;
  /** Computed: baseSalary × pfPercentage / 100 (PF applies to base only). */
  pfAmount?:                number;
  travelAllowance?:         number;
  otherAllowance?:          number;
  /** Computed: baseSalary + travelAllowance + otherAllowance − pfAmount. */
  netSalary?:               number;
  effectiveDate?:           string;  // 'YYYY-MM-DD' — retained for backend compatibility
  /** Number of paid leaves allowed per calendar month without salary deduction. */
  allowedLeavesPerMonth?:   number;
  /** 0 = Fixed, 1 = Percentage of revenue. */
  salaryType?:              number;
  revenuePercentage?:       number | null;
}

export interface SaveSalaryConfigDTO {
  userId:                   number;
  baseSalary:               number;
  pfPercentage:             number;
  travelAllowance?:         number;
  otherAllowance?:          number;
  effectiveDate?:           string;  // 'YYYY-MM-DD' — retained for backend compatibility
  /** Number of paid leaves allowed per calendar month without salary deduction. */
  allowedLeavesPerMonth?:   number;
  /** 0 = Fixed, 1 = Percentage of revenue. */
  salaryType:               number;
  revenuePercentage?:       number | null;
}

// ── Partial payment ───────────────────────────────────────────────────────────

export interface PartialPaymentDTO {
  paymentId:          number;
  salaryId:           number;
  paymentAmount:      number;          // API field: paymentAmount
  paymentMonth:       string;          // e.g. "2026-05"
  paymentDate:        string;          // ISO datetime "2026-05-15T00:00:00"
  reference?:         string | null;
  /** Numeric: 1 = BaseSalary, 2 = TravelAllowance, 3 = OtherAllowance */
  paymentSource:      PaymentFor | number;
  paymentSourceName?: string;          // e.g. "BaseSalary"
  /** 'Partial' | 'Full' — whether this settled the full outstanding balance. */
  paymentType?:       PaymentType | string;
  createdDate:        string;
}

export interface AddPaymentDTO {
  salaryId:      number;
  paymentAmount: number;
  /** Month being paid — YYYY-MM format (e.g. 2026-05) */
  paymentMonth:  string;
  paymentDate:   string;
  /** Optional reference / note */
  reference?:    string;
  /** Numeric: 1 = BaseSalary, 2 = TravelAllowance, 3 = OtherAllowance. Not sent for Full payments. */
  paymentFor?:   PaymentFor;
  /** Whether this is a full settlement or a partial installment. */
  paymentType:   PaymentType;
}

// ── Monthly salary record ─────────────────────────────────────────────────────

/** Salary record for one employee — matches actual API response. */
export interface SalaryRecordDTO {
  salaryId:              number;
  userId:                number;
  userName:              string;
  fullName:              string;
  typeUserId:            number;
  deactivatedAt?:        string | null;
  baseSalary:            number;
  pfAmount?:             number;
  travelAllowance?:      number;
  otherAllowance?:       number;
  grossSalary?:          number;
  /** baseSalary + travelAllowance + otherAllowance − pfAmount */
  netSalary?:            number;
  totalPaid?:            number;
  pendingAmount?:        number;
  paymentCount?:         number;
  isFullyPaid:           boolean;
  baseSalaryPaid?:       number;
  travelAllowancePaid?:  number;
  otherAllowancePaid?:   number;
  payments:              PartialPaymentDTO[];
  /** Derived on the frontend from isFullyPaid + totalPaid. */
  status?:               SalaryStatus;
}

/** Top-level response from GET api/salary/GetMonthly?year=&month= */
export interface MonthlySalaryResponseDTO {
  /** ISO month string e.g. "2026-05" */
  month:           string;
  totalEmployees?: number;
  totalNetSalary?: number;
  totalPaid?:      number;
  // totalPending?:   number;
  fullyPaidCount?: number;
  pendingCount?:   number;
  employees:       SalaryRecordDTO[];
}

export interface GenerateSalaryDTO {
  month: number;
  year:  number;
}

// ── Self-service salary summary (My Salary) ───────────────────────────────────

/** One month's summary line inside the self-service salary view. */
export interface MonthlySalarySummaryDTO {
  /** "YYYY-MM" */
  month:                string;
  /** Fixed net salary from salary config (no leave adjustment). */
  netSalary:            number;
  /** Actual amount owed for this month after leave deductions. */
  netPayableSalary:     number;
  /** Salary deducted for excess leaves this month. */
  leaveDeductionAmount: number;
  totalPaid:            number;
  /** netPayableSalary − totalPaid */
  pendingAmount:        number;
  paymentCount:         number;
}

/** One actual salary payment transaction (self-service My Payments view). */
export interface SalaryPaymentDTO {
  paymentId:          number;
  salaryId:           number;
  /** "YYYY-MM" — the salary month this payment applies to. */
  paymentMonth:       string;
  /** ISO datetime the payment was made. */
  paymentDate:        string;
  paymentAmount:      number;
  reference?:         string | null;
  /** 1 = BaseSalary, 2 = TravelAllowance, 3 = OtherAllowance */
  paymentSource:      number;
  /** "BaseSalary" | "TravelAllowance" | "OtherAllowance" — shown as the payment mode. */
  paymentSourceName:  string;
  /** "Full" | "Partial" */
  paymentType?:       string;
}

/** Response from GET api/salary/GetMySalary — the logged-in user's own summary. */
export interface UserSalarySummaryDTO {
  salaryId:         number;
  userId:           number;
  userName:         string;
  fullName:         string;
  baseSalary:       number;
  netSalary:        number;
  monthlySummaries: MonthlySalarySummaryDTO[];
}

// ── Payable salary calculation result ────────────────────────────────────────

/** Response from GET api/salary/CalculatePayableSalary */
export interface CalculatePayableSalaryDTO {
  userId:                number;
  userName:              string;
  fullName:              string;
  year:                  number;
  month:                 number;
  monthLabel:            string;
  baseSalary:            number;
  allowedLeavesPerMonth: number;
  totalDaysInMonth:      number;
  absentDays:            number;
  halfDays:              number;
  /** absentDays + halfDays × 0.5 */
  effectiveAbsentDays:   number;
  /** effectiveAbsentDays − allowedLeavesPerMonth (min 0) */
  extraAbsentDays:       number;
  /** baseSalary / totalDaysInMonth */
  perDayBaseSalary:      number;
  /** extraAbsentDays × perDayBaseSalary */
  deductionAmount:       number;
  /** baseSalary − deductionAmount */
  payableBaseSalary:     number;
}
