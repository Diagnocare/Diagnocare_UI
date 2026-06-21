/**
 * Shared mock data used across all spec files.
 * Keeps test data consistent and easy to update in one place.
 */

import { Receipt } from 'src/app/models/receipt/receiptModel';
import { PatientCreateDto } from 'src/app/models/patient/patient-create.dto';

// ── Receipt mocks ─────────────────────────────────────────────────────────────

/** Two receipts for the SAME test (patientTestId = 101) — partial payments */
export const MOCK_RECEIPTS_SAME_TEST: Receipt[] = [
  {
    receiptId:     2,           // intentionally out-of-order to test sorting
    patientTestId: 101,
    netAmount:     1000,
    amountPaid:    300,
    amountPending: 200,         // per-receipt pending (not cumulative)
    paymentType:   'Partial',
    paymentMode:   'UPI',
    createdDate:   '2024-01-20T10:00:00',
  },
  {
    receiptId:     1,
    patientTestId: 101,
    netAmount:     1000,
    amountPaid:    500,
    amountPending: 500,
    paymentType:   'Partial',
    paymentMode:   'Cash',
    createdDate:   '2024-01-15T09:00:00',
  },
];

/** Single receipt — fully paid */
export const MOCK_RECEIPT_FULLY_PAID: Receipt = {
  receiptId:     10,
  patientTestId: 200,
  netAmount:     750,
  amountPaid:    750,
  amountPending: 0,
  paymentType:   'Full',
  paymentMode:   'Cash',
  createdDate:   '2024-02-01T08:00:00',
};

/** Single receipt — netAmount is null (backend omits it) */
export const MOCK_RECEIPT_NULL_NET: Receipt = {
  receiptId:     20,
  patientTestId: 300,
  netAmount:     null as any,   // API sends null
  amountPaid:    400,
  amountPending: 600,           // → derived net = 400 + 600 = 1000
  paymentType:   'Partial',
  paymentMode:   'Online',
  createdDate:   '2024-03-10T11:00:00',
};

/** Receipts for TWO different tests — for multi-group tests */
export const MOCK_RECEIPTS_TWO_TESTS: Receipt[] = [
  {
    receiptId:     5,
    patientTestId: 401,
    netAmount:     500,
    amountPaid:    500,
    amountPending: 0,
    paymentType:   'Full',
    paymentMode:   'Cash',
    createdDate:   '2024-04-01T09:00:00',
  },
  {
    receiptId:     6,
    patientTestId: 402,
    netAmount:     800,
    amountPaid:    200,
    amountPending: 600,
    paymentType:   'Partial',
    paymentMode:   'UPI',
    createdDate:   '2024-04-05T10:00:00',
  },
];

// ── User / auth mocks ─────────────────────────────────────────────────────────

export const MOCK_USER = {
  id:       1,
  userId:   'testUser',
  userName: 'Test User',
  role:     'Admin',
  token:    'mock-jwt-token',
};

export const MOCK_OTP_RESPONSE = { success: true, message: 'OTP sent' };

// ── Patient mocks ─────────────────────────────────────────────────────────────

export const MOCK_PATIENT_ID = 'P-001';

export const MOCK_PATIENT_EDIT = {
  patient_Id:             MOCK_PATIENT_ID,
  patient_Name:           'Mr. Test Patient',
  patient_Age:            35,
  patient_Gender:         'Male',
  patient_Contact:        '+91-9876543210',
  patient_Address:        '123 Test Street',
  patient_Email:          'test@example.com',
  patient_Marital_Status: 'Single',
  patient_DOB:            '1989-01-01',
  patient_Age_Group:      'Adult',
  relation:               'Self',
  relative_Name:          '',
};

export const MOCK_KEY_VALUE_PAIR = { key: '1', value: 'P-001' };

export const MOCK_SEARCH_RESULT = {
  data:       [MOCK_PATIENT_EDIT],
  totalCount: 1,
  pageNumber: 1,
  pageSize:   10,
};

// ── Pathology mocks ───────────────────────────────────────────────────────────

export const MOCK_PATHOLOGY = {
  path_Id:      1,
  path_Name:    'City Lab',
  path_Branch:  'Main Branch',
  path_Address: '456 Lab Road',
  path_Contact: '+91-9000000000',
};

export const MOCK_PATHOLOGY_PUBLIC_INFO_REGISTERED = {
  isRegistered:   true,
  path_Name:      'City Lab',
  path_Branch:    'Main Branch',
  path_Address1:  '456 Lab Road',
  path_City:      'Mumbai',
  path_State:     'Maharashtra',
  path_Country:   'India',
  path_ContactNo: '9000000000',
  path_Email:     'lab@citylab.com',
  license_Type:   'License',
  date_of_Expiry: '2027-01-01',
};

export const MOCK_PATHOLOGY_PUBLIC_INFO_UNREGISTERED = {
  isRegistered: false,
};

export const MOCK_EXTEND_LICENSE_RESPONSE = {
  success:        true,
  licenseKey:     'EXT-LIC-XYZ-9999',
  date_of_Expiry: '2027-12-31',
};

export const MOCK_REGISTER_RESPONSE = {
  success:    true,
  licenseKey: 'REG-LIC-ABCD-1234',
  pathologyId: '1',
};

// ── PathTest / group mocks ────────────────────────────────────────────────────

export const MOCK_GROUP_RAW = {
  groupSubgroupCode: 'G001',
  groupSubGroupName: 'Haematology',
  price:             0,
  parentGroupId:     null,
  templateId:        null,
};

export const MOCK_SUBGROUP_RAW = {
  groupSubgroupCode: 'SG001',
  groupSubGroupName: 'CBC',
  price:             150,
  parentGroupId:     'G001',
  templateId:        null,
};

export const MOCK_TEST_LIST = [
  { testId: 'T001', testName: 'Haemoglobin', price: 50 },
  { testId: 'T002', testName: 'WBC Count',   price: 60 },
];
