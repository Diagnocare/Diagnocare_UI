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

// ── Payment mode ──────────────────────────────────────────────────────────────

/**
 * How the money physically reached the employee.
 *
 * Not to be confused with `PaymentFor`, which says which salary COMPONENT the
 * money came out of. Numeric values match the backend SalaryPaymentMode enum.
 */
export enum PaymentMode {
  Cash         = 1,
  UPI          = 2,
  BankTransfer = 3,
  Cheque       = 4,
  Card         = 5,
  Other        = 6,
}

export const PaymentModeLabels: Record<PaymentMode, string> = {
  [PaymentMode.Cash]:         'Cash',
  [PaymentMode.UPI]:          'UPI',
  [PaymentMode.BankTransfer]: 'Bank Transfer',
  [PaymentMode.Cheque]:       'Cheque',
  [PaymentMode.Card]:         'Card',
  [PaymentMode.Other]:        'Other',
};

/** Font Awesome icon per payment mode, used on the mode picker and history badges. */
export const PaymentModeIcons: Record<PaymentMode, string> = {
  [PaymentMode.Cash]:         'fa-money-bill-wave',
  [PaymentMode.UPI]:          'fa-mobile-alt',
  [PaymentMode.BankTransfer]: 'fa-university',
  [PaymentMode.Cheque]:       'fa-money-check',
  [PaymentMode.Card]:         'fa-credit-card',
  [PaymentMode.Other]:        'fa-ellipsis-h',
};

/**
 * Modes that move money through a traceable channel, so the API insists on a
 * transaction / reference number. Cash and Other have nothing to quote.
 */
export const MODES_REQUIRING_REFERENCE: ReadonlyArray<PaymentMode> = [
  PaymentMode.UPI,
  PaymentMode.BankTransfer,
  PaymentMode.Cheque,
  PaymentMode.Card,
];

// ── Payment status ────────────────────────────────────────────────────────────

/**
 * Clearing state of a recorded payment. Informational only — the backend counts
 * every recorded payment towards paid/pending whatever its status, so this never
 * moves the payroll figures. To reverse money, edit or delete the payment.
 */
export enum PaymentStatus {
  Completed = 1,
  Pending   = 2,
  Failed    = 3,
}

export const PaymentStatusLabels: Record<PaymentStatus, string> = {
  [PaymentStatus.Completed]: 'Completed',
  [PaymentStatus.Pending]:   'Pending',
  [PaymentStatus.Failed]:    'Failed',
};

// ── Shared payment detail fields ──────────────────────────────────────────────

/**
 * The "how it was paid" fields every payment request carries. Mirrors the
 * backend SalaryPaymentDetailsDto.
 *
 * The proof screenshot is not here: it is uploaded separately once the payment
 * row exists, via SalaryService.uploadPaymentProof.
 */
export interface PaymentDetailsFields {
  paymentDate:           string;
  /** 1 = Cash (default) … 6 = Other. */
  paymentMode:           PaymentMode;
  /** Bank / UPI transaction number, cheque number, etc. Required for non-cash modes. */
  transactionReference?: string | null;
  /** Free-text notes. */
  remarks?:              string | null;
  /** 1 = Completed (default), 2 = Pending, 3 = Failed. */
  paymentStatus:         PaymentStatus;
  /** Legacy free-text reference note — kept so older callers keep working. */
  reference?:            string | null;
}

/** Request body for POST api/salary/PayAllComponents. */
export interface PayAllComponentsDTO extends PaymentDetailsFields {
  salaryId:     number;
  paymentMonth: string;
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

  // ── How the payment was made ────────────────────────────────────────────
  /** 1 = Cash … 6 = Other. */
  paymentMode?:          PaymentMode | number;
  /** "Cash" | "UPI" | "Bank Transfer" | "Cheque" | "Card" | "Other" */
  paymentModeName?:      string;
  /** Bank / UPI transaction number, cheque number, etc. */
  transactionReference?: string | null;
  /** Free-text notes. Falls back to `reference` for rows recorded before remarks existed. */
  remarks?:              string | null;
  /** 1 = Completed, 2 = Pending, 3 = Failed. */
  paymentStatus?:        PaymentStatus | number;
  /** "Completed" | "Pending" | "Failed" */
  paymentStatusName?:    string;

  // ── Payment proof ───────────────────────────────────────────────────────
  // Metadata only — fetch the file itself from GetPaymentProof when asked.
  hasPaymentProof?:   boolean;
  proofFileName?:     string | null;
  proofContentType?:  string | null;
  proofFileSize?:     number | null;
}

export interface AddPaymentDTO extends PaymentDetailsFields {
  salaryId:      number;
  paymentAmount: number;
  /** Month being paid — YYYY-MM format (e.g. 2026-05) */
  paymentMonth:  string;
  /** Numeric: 1 = BaseSalary, 2 = TravelAllowance, 3 = OtherAllowance. Not sent for Full payments. */
  paymentFor?:   PaymentFor;
  /** Whether this is a full settlement or a partial installment. */
  paymentType:   PaymentType;
}

// ── Payment history (all months, one employee) ────────────────────────────────

/** One salary period's block inside an employee's payment history. */
export interface PaymentHistoryMonthDTO {
  /** "YYYY-MM" */
  month:            string;
  /** "September 2026" */
  monthLabel:       string;
  netPayableSalary: number;
  totalPaid:        number;
  pendingAmount:    number;
  isFullyPaid:      boolean;
  payments:         PartialPaymentDTO[];
}

/** Response from GET api/salary/GetPaymentHistory?userId= */
export interface PaymentHistoryDTO {
  salaryId:         number;
  userId:           number;
  userName?:        string;
  fullName?:        string;
  totalPaidAllTime: number;
  paymentCount:     number;
  months:           PaymentHistoryMonthDTO[];
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
  /**
   * Contract PF, computed on the FULL base salary. Display-only.
   * Never use this to work out what is payable, or what a payment may be —
   * use `adjustedPfAmount` and the `*Cap` / `*Pending` fields instead.
   */
  pfAmount?:             number;
  /** PF percentage applied to the base salary (0-100). */
  pfPercentage?:         number;
  travelAllowance?:      number;
  otherAllowance?:       number;
  grossSalary?:          number;
  /**
   * Contract net salary: baseSalary + travelAllowance + otherAllowance − pfAmount.
   * Fixed per employee — it does NOT move with the month's attendance, so it is
   * never the right figure to compare against paid/pending.
   */
  netSalary?:            number;

  // ── Month-scoped, leave-adjusted figures — use these for money owed ────────
  /** Salary withheld for leave taken beyond the monthly allowance. */
  leaveDeductionAmount?:  number;
  /** baseSalary − leaveDeductionAmount. */
  payableBaseSalary?:     number;
  /** PF actually withheld this month, computed on payableBaseSalary. */
  adjustedPfAmount?:      number;
  /** payableBaseSalary − adjustedPfAmount + travelAllowance + otherAllowance. */
  netPayableSalary?:      number;
  absentDays?:            number;
  halfDays?:              number;
  allowedLeavesPerMonth?: number;

  totalPaid?:            number;
  /** netPayableSalary − totalPaid. */
  pendingAmount?:        number;
  paymentCount?:         number;
  isFullyPaid:           boolean;

  // ── Per-component caps and balances (server-authoritative) ────────────────
  // The API validates every payment against these exact values, so they must be
  // used as-is rather than recomputed from baseSalary/pfAmount on the client.
  /** payableBaseSalary − adjustedPfAmount. */
  baseSalaryCap?:          number;
  baseSalaryPaid?:         number;
  baseSalaryPending?:      number;
  travelAllowancePaid?:    number;
  travelAllowancePending?: number;
  otherAllowancePaid?:     number;
  otherAllowancePending?:  number;

  payments:              PartialPaymentDTO[];
  /** Derived on the frontend from isFullyPaid + totalPaid. */
  status?:               SalaryStatus;
}

/** Top-level response from GET api/salary/GetMonthly?year=&month= */
export interface MonthlySalaryResponseDTO {
  /** ISO month string e.g. "2026-05" */
  month:           string;
  totalEmployees?: number;
  /** Sum of contract netSalary — ignores leave deductions. Reference only. */
  totalNetSalary?: number;
  /** Sum of netPayableSalary — the figure that reconciles with paid + pending. */
  totalNetPayable?: number;
  totalPaid?:      number;
  totalPending?:   number;
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
  /** "BaseSalary" | "TravelAllowance" | "OtherAllowance" — the salary component paid. */
  paymentSourceName:  string;
  /** "Full" | "Partial" */
  paymentType?:       string;

  // ── How the payment was made ────────────────────────────────────────────
  /** 1 = Cash … 6 = Other. */
  paymentMode?:          PaymentMode | number;
  /** "Cash" | "UPI" | "Bank Transfer" | "Cheque" | "Card" | "Other" */
  paymentModeName?:      string;
  /** Bank / UPI transaction number, cheque number, etc. */
  transactionReference?: string | null;
  /** Free-text notes. */
  remarks?:              string | null;
  /** 1 = Completed, 2 = Pending, 3 = Failed. */
  paymentStatus?:        PaymentStatus | number;
  /** "Completed" | "Pending" | "Failed" */
  paymentStatusName?:    string;
  /** True when a screenshot / receipt is attached — fetch it from GetMyPaymentProof. */
  hasPaymentProof?:      boolean;
  proofFileName?:        string | null;
  proofContentType?:     string | null;
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
  travelAllowance?:      number;
  otherAllowance?:       number;
  /**
   * PF withheld for THIS month, charged on payableBaseSalary — not the contract
   * pfAmount on the salary record, which is charged on the full base salary.
   * These differ by (deductionAmount x pf%) whenever leave was deducted.
   */
  pfAmount?:             number;
  /** payableBaseSalary − pfAmount + travelAllowance + otherAllowance */
  netPayableSalary?:     number;
}
