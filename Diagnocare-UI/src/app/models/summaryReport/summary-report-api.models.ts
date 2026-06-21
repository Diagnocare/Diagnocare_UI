// ── Shared ────────────────────────────────────────────────────────────────────

export interface DateRangeParams {
  period?: string;
  year?: string;      // calendar year, e.g. '2025'
  chartType?: string; // informational — not used by backend
  fromDate?: string;  // yyyy-MM-dd  (legacy; Year takes precedence)
  toDate?: string;    // yyyy-MM-dd  (legacy; Year takes precedence)
  /** Extra fields merged verbatim into the request body (e.g. { institutionType: 7 }). */
  extra?: Record<string, any>;
}

// ── Collection summary (doctor-wise, reporting-doctor, panel-company,
//    collection-boys, TPA) ────────────────────────────────────────────────────

export interface CollectionSummaryItemDto {
  name: string;
  totalPatients: number;
  totalTestAmount: number;
  totalDiscount: number;
  totalNetCollection: number;
  totalAmountPaid: number;
  totalAmountPending: number;
}

export interface CollectionSummaryReportDto {
  fromDate: string | null;
  toDate: string | null;
  data: CollectionSummaryItemDto[];
  grandTotalNetCollection: number;
  grandTotalAmountPaid: number;
  grandTotalAmountPending: number;
}

// ── Doctor-wise collection ─────────────────────────────────────────────────────

export interface DoctorCollectionItemDto {
  doctorName: string;
  totalPatients: number;
  totalTestAmount: number;
  totalDiscount: number;
  totalNetCollection: number;
  totalAmountPaid: number;
  totalAmountPending: number;
}

export interface DoctorWiseCollectionDto {
  fromDate: string | null;
  toDate: string | null;
  data: DoctorCollectionItemDto[];
  grandTotalNetCollection: number;
  grandTotalAmountPaid: number;
  grandTotalAmountPending: number;
}

// ── Discount authority ────────────────────────────────────────────────────────

export interface DiscountAuthorityItemDto {
  authorityName: string;
  totalPatients: number;
  totalTestAmount: number;
  totalDiscount: number;
  totalNetCollection: number;
  totalAmountPaid: number;
  totalAmountPending: number;
}

export interface DiscountAuthorityReportDto {
  fromDate: string | null;
  toDate: string | null;
  data: DiscountAuthorityItemDto[];
  grandTotalDiscount: number;
  grandTotalNetCollection: number;
  grandTotalAmountPaid: number;
  grandTotalAmountPending: number;
}

// ── Receipt / Refund register ─────────────────────────────────────────────────

export interface ReceiptRegisterItemDto {
  receiptId: number;
  patientTestId: number;
  patientId: string;
  patientName: string;
  patientContact: string;
  referredBy: string;
  testAmount: number | null;
  discount: number | null;
  netAmount: number | null;
  amountPaid: number;
  amountPending: number;
  paymentType: string;
  paymentMode: string;
  date: string;
}

/** Summary-only — no row data. */
export interface ReceiptRegisterDto {
  fromDate: string | null;
  toDate: string | null;
  totalTestAmount: number;
  totalDiscount: number;
  totalNetAmount: number;
  totalAmountPaid: number;
  totalAmountPending: number;
  totalRecords: number;
}

/** Summary-only — no row data. */
export interface RefundRegisterDto {
  fromDate: string | null;
  toDate: string | null;
  totalRefundAmount: number;
  totalRecords: number;
}

// ── Bill register ─────────────────────────────────────────────────────────────

export interface BillRegisterItemDto {
  patientTestId: number;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientAge: string;
  patientContact: string;
  testIds: string;
  referredBy: string;
  referredByType: string;
  testAmount: number | null;
  discount: number | null;
  netAmount: number | null;
  amountPaid: number;
  amountPending: number;
  paymentStatus: string;
  registrationDate: string;
}

/** Summary-only — no row data. */
export interface BillRegisterDto {
  fromDate: string | null;
  toDate: string | null;
  grandTotalTestAmount: number;
  grandTotalDiscount: number;
  grandTotalNetAmount: number;
  grandTotalAmountPaid: number;
  grandTotalAmountPending: number;
  totalRecords: number;
}

// ── Patient history ───────────────────────────────────────────────────────────

export interface PatientHistoryTestItemDto {
  patientTestId: number;
  testIds: string;
  referredBy: string;
  referredByType: string;
  collectedBy: string;
  urgentReport: boolean;
  reportStatus: string;
  registrationDate: string;
  netAmount: number | null;
  amountPaid: number;
  amountPending: number;
  paymentStatus: string;
}

export interface PatientHistoryRecordDto {
  patientId: string;
  patientName: string;
  patientGender: string;
  patientAge: string;
  patientContact: string;
  tests: PatientHistoryTestItemDto[];
  totalNetCollection: number;
  totalAmountPaid: number;
  totalAmountPending: number;
}

export interface PatientHistoryReportDto {
  fromDate: string | null;
  toDate: string | null;
  data: PatientHistoryRecordDto[];
  totalRecords: number;
}

// ── Worksheet ─────────────────────────────────────────────────────────────────

export interface WorksheetItemDto {
  patientTestId: number;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientAge: string;
  testIds: string;
  urgentReport: boolean;
  referredBy: string;
  collectedBy: string;
  area: string;
  reportStatus: string;
  registrationDate: string;
  netAmount: number | null;
  paymentStatus: string;
}

export interface WorksheetReportDto {
  fromDate: string | null;
  toDate: string | null;
  data: WorksheetItemDto[];
  totalRecords: number;
}

// ── Patient diagnosis ─────────────────────────────────────────────────────────

export interface PatientDiagnosisItemDto {
  patientTestId: number;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientAge: string;
  patientContact: string;
  testIds: string;
  referredBy: string;
  referredByType: string;
  urgentReport: boolean;
  reportStatus: string;
  registrationDate: string;
}

export interface PatientDiagnosisReportDto {
  fromDate: string | null;
  toDate: string | null;
  data: PatientDiagnosisItemDto[];
  totalRecords: number;
}

// ── PNDT test ─────────────────────────────────────────────────────────────────

export interface PndtTestItemDto {
  patientTestId: number;
  patientId: string;
  patientName: string;
  patientGender: string;
  patientAge: string;
  patientContact: string;
  testIds: string;
  referredBy: string;
  registrationDate: string;
}

export interface PndtTestReportDto {
  fromDate: string | null;
  toDate: string | null;
  data: PndtTestItemDto[];
  totalRecords: number;
}

// ── Master test list ──────────────────────────────────────────────────────────

export interface MasterTestItemDto {
  testRegId: string;
  testCode: string;
  testName: string;
  price: number;
  groupId: string;
  subGroupId: string;
  parameterCount: number;
}

export interface MasterTestListDto {
  data: MasterTestItemDto[];
  totalTests: number;
}

// ── Rate list ─────────────────────────────────────────────────────────────────

export interface RateListItemDto {
  testCode: string;
  testName: string;
  price: number;
  groupId: string;
  groupName: string;
  subGroupId: string;
  subGroupName: string;
}

export interface RateListDto {
  data: RateListItemDto[];
  totalTests: number;
}

// ── Referrer Collection (merged: Doctor + Collection Boy + Panel) ─────────────

export interface ReferrerCollectionItemDto {
  name: string;
  /** "Doctor", "Collection Boy", "Hospital", "Clinic", "Laboratory", "DiagnosticCenter", "Pharmacy", "Other" */
  referrerType: string;
  commissionPct: number | null;
  totalPatients: number;
  totalTestAmount: number;
  totalDiscount: number;
  totalNetCollection: number;
  totalAmountPaid: number;
  totalAmountPending: number;
  commissionAmount: number | null;
}

export interface ReferrerCollectionReportDto {
  fromDate: string | null;
  toDate: string | null;
  data: ReferrerCollectionItemDto[];
  grandTotalNetCollection: number;
  grandTotalAmountPaid: number;
  grandTotalAmountPending: number;
  grandTotalCommission: number;
}

// ── Address manager report ────────────────────────────────────────────────────

/** Full row — used only for CSV export (output-to-file). */
export interface AddressManagerReportItemDto {
  id: number;
  name: string;
  institutionType: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  city: string;
  state: string;
  pinCode: string;
  isActive: boolean;
}

/** Full row list — used only for CSV export. */
export interface AddressManagerReportDto {
  data: AddressManagerReportItemDto[];
  totalRecords: number;
}

/** One row per institution type — used by the summary UI report. */
export interface AddressManagerSummaryItemDto {
  institutionType: string;
  count: number;
  active: number;
  inactive: number;
}

/** Summary-only — groups contacts by institution type with active/inactive counts. */
export interface AddressManagerSummaryDto {
  data: AddressManagerSummaryItemDto[];
  totalRecords: number;
  totalActive: number;
  totalInactive: number;
}

