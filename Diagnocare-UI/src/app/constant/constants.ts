import { get } from "@okta/okta-auth-js";
import { ReportConfig } from "../models/summaryReport/summaryReportModel";

/** Default country dialling code used across patient forms. Update here to change globally. */
export const DEFAULT_DIALING_CODE = '+91';

export const controllerEndpoints = {
  header: 'api/header/',
  login: 'api/login/',
  otp: 'api/Otp/',
  mfa: 'api/Mfa/',
  address: 'api/addressManager/',
  collectionBoy: 'api/collectionBoys/',
  doctor: 'api/doctors/',
  patient: 'api/patient/',
  patientReport: 'api/PatientReport/',
  patientTestReportGeneration: 'api/TestReportGeneration/',
  pathology: 'api/pathology/',
  test: 'api/test/',
  user: 'api/user/',
  receipt: 'api/receipt/',
  summaryReport:'api/summaryReport/',
  pathologyTest:'api/pathologyTest/',
  template:   'api/template/',
  attendance: 'api/attendance/',
  salary:     'api/salary/',
  holiday:       'api/holiday/',
  visitSchedule: 'api/visitSchedule/',
};

export const apiEndpoints = {
  getPublicInfo: 'GetPublicInfo',
  extendLicense: 'ExtendLicense',
  uploadImage: 'addImage',
  generateOTP:"generate-otp",
  resendOtp:"resend-otp",
  cancelOtp:"cancel-otp",
  verifyOtp: "verify-otp",
  verify:    "Verify",         // unified endpoint — VerifyAuthRequest
  resetPassword: 'ForgotPassword',
  validateOldPassword:"ValidateOldPassword",
  getPathologyExpiryDate:"GetPathologyExpiryDate",
  getSerialNPatientId:"GetSerialNPatientId",
  searchPatients:"SearchPatients",
  getDistinctReferredBy:"GetDistinctReferredBy",
  getAllStateCityList:"GetAllStateCityList",
  profileImage:"ProfileImage",
  uploadProfileImage:"UploadProfileImage",
  updateGroupDetails:"UpdateGroupDetails",
  getReceiptCount:"GetReceiptCount",
  updatePathologyTest:"UpdatePathologyTest",
  generateTestReportPDF:"GenerateTestReportPDF",
  updateAuthType:"UpdateAuthType",
  updateUserEmail:"UpdateUserEmail",
  updateUserPhone:"UpdateUserPhone",
  sendProfileOtp:"SendProfileOtp",
  verifyProfileOtp:"VerifyProfileOtp",
  refreshToken:"RefreshToken",
  generateJWTToken: "GenerateJWTToken",
  authCredentialsEndpoint: 'GetBasicAuthCredentials',
  getAllList: 'GetAllList',
  getById: 'GetById',
  add: 'Add',
  update: 'Update',
  delete: 'Delete',
  patientReport: 'PatientReport',
  getUserDetails:'GetUserDetails',
  getUserIdByContact:'GetUserIdByContact',
  isDuplicateEmail:'IsDuplicateEmail',
  isDuplicateContact:'IsDuplicateContact',
  checkUserName:'CheckUserName',
  registerUser:'RegisterUser',
  getuserlist:'GetUserList',
  getAllGroupList:"GetAllGroupList",
  getAllSubGroupList:"GetAllSubGroupList",
  getTestList:"GetTestList",
  getPathTest:"GetPathologyTest",
  getTestParameter:"GetTestParameter",
  addGroupWithSubgroupsAndTests:"AddGroupWithSubgroupsAndTests",
  testParameterManipulation:"TestParameterManipulation",
  getSavedTestReport:"GetSavedTestReport",
  dropTest:"Delete",
  getTemplates:"GetTemplates",
  previewTemplate:"PreviewTemplate",
  downloadTemplate:"DownloadTemplate",
  getWeeklyAttendance:  'GetWeekly',
  getMonthly: 'GetMonthly',
  getMyWeeklyAttendance: 'GetMyWeekly',
  getMyMonthly:          'GetMyMonthly',
  generateSalary:      'Generate',
  generateReceiptPdf: 'GenerateReceiptPdf',
  getHolidaysByYear: 'GetHolidayCalendar',
  getPathologyDefault:   'GetPathologyDefault',
  setDefaultTemplate:   'SetDefaultTemplate',
  addPayment:    'AddPayment',
  addTestWithReceipt: 'AddTestWithReceipt',
  getSalaryConfig:          'GetConfig',
  saveSalaryConfig:         'SaveConfig',
  calculatePayableSalary:   'CalculatePayableSalary',
  /** Maps to DB column token_expiry_in_minutes — stores the PIN grace buffer duration */
  updateGraceBuffer:        'UpdateGraceBuffer',
  getMFAStatus:             'status',          // GET  api/Mfa/status
  setupMFA:                 'setup',           // POST api/Mfa/setup
  confirmMfaSetup:          'confirm-setup',   // POST api/Mfa/confirm-setup
  verifyTotpLogin:          'Verify',          // POST api/Otp/Verify  (authType=Mfa)
  disableMFA:               'disable',         // POST api/Mfa/disable
  cancelTest:               'CancelTest',        // PUT   api/patient/CancelTest
  removeTests:              'RemoveTests',       // PATCH api/patient/RemoveTests
  refundReceipt:            'Refund',            // PUT   api/receipt/Refund
  updateTpaDetails:         'UpdateTpaDetails',  // PUT   api/receipt/UpdateTpaDetails
  clearSession:             'ClearSession',      // POST  api/login/ClearSession
  logout:                   'Logout',            // POST  api/login/Logout
  ping:                     'ping',              // GET   api/header/ping  (session health-check)
};

export const loginFormProperty={
   userId:"User Id",
   pathId:"Pathology Id",
   password:"Password",
   code:"OTP Code"
}
export type PathologyFormKeys = keyof typeof loginFormProperty;

export const validationMessages = {
  required: (key: PathologyFormKeys) =>
    `${loginFormProperty[key]} is required`,
  email: (key: PathologyFormKeys) =>
    `${loginFormProperty[key]} must be valid email Id`,
  minLength: (key: PathologyFormKeys, length: number) =>
    `${loginFormProperty[key]} must be at least ${length} characters`,
  maxLength: (key: PathologyFormKeys, length: number) =>
    `${loginFormProperty[key]} must not exceed ${length} characters`,
  pattern: (key: PathologyFormKeys, rule: string) =>
    `${loginFormProperty[key]} must be ${rule}`,
  stringOnly: (key: PathologyFormKeys) =>
    `${loginFormProperty[key]} must contain only string, No number allowed`,
  noFutureDate:(key:PathologyFormKeys)=>`${loginFormProperty[key]} must not be future date`
};

// Tab order for Add Patient form
   export const tabOrderAdd = [
     'patient_Salutation',
     'patient_Name',
     'patient_DOB',
     'patient_Age',
     'patient_Age_Group',
     'patient_Gender',
     '',
     '',
     'patient_Marital_Status',
     '',
     'relation',
     'relative_Name',
     'patient_Contact',
     'patient_Email',
     'patient_Address',
     'test_Name',
     'urgent_Report',
     'test_Amount',
     'referred_By_Type',
     'referred_By',
     'sampling_Done',
     'collected_Outside',
     'area',
     'collected_By',
     'remark',
     'discount',
     'net_Amount',
     'payment_Type',
     'payment_Mode',
     'amount_Paid',
     'amount_Pending'
   ]

   // Tab order for Edit Patient form (customize as needed)
   export const tabOrderEdit = [
     'patient_Salutation',
     'patient_Name',
     'patient_DOB',
     'patient_Age',
     'patient_Age_Group',
     'patient_Gender',
     '',
     '',
     'patient_Marital_Status',
     '',
     'relation',
     'relative_Name',
     'patient_Contact',
     'patient_Email',
     'patient_Address',
     'test_Name',
     'urgent_Report',
     'test_Amount',
     'referred_By_Type',
     'referred_By',
     'sampling_Done',
     'collected_Outside',
     'area',
     'collected_By',
     'remark',
     'discount',
     'net_Amount',
     'payment_Type',
     'payment_Mode',
     'amount_Paid',
     'amount_Pending'
   ]

// ── Profile / account dropdown ──────────────────────────────────────────────
// To add a new profile menu item, just add an entry here.
// The route must already exist in app-routing.module.ts.
export const profileMenu = {
  profile:        { id: 'profile',        label: 'My Profile',      route: 'profile',         icon: 'user' },
  settings:       { id: 'settings',       label: 'Settings',        route: 'settings',        icon: 'cog' },
  changePassword: { id: 'changePassword', label: 'Change Password', route: 'change-password', icon: 'lock' },
  setupMfa:       { id: 'setupMfa',       label: 'Authenticator App', route: 'setup-mfa',     icon: 'mobile' },
};

export const labOperationMenu = {
    patientDetails: { id: 'patientDetails', label: 'Patient Details',        route: `patients`,      icon: 'fa-users' },
    receiptBills:   { id: 'receiptBills',   label: 'Receipt Bills',           route: `receipt`,       icon: 'fa-receipt' },
    patientReport:  { id: 'patientReport',  label: 'Patient Report',          route: `patient-tests`, icon: 'fa-flask' },
    pathTest:       { id: 'pathTest',       label: 'Master Test details',     route: `manage-tests`,  icon: 'fa-vials' },
    contact:        { id: 'contact',        label: 'Contact Address Manager', route: `contacts`,      icon: 'fa-map-marker-alt' },
};

export const labSetupMenu = {
    labProfile: { id: 'labProfile', label: 'Lab Profile',        route: 'lab-profile', icon: 'fa-hospital-alt', description: 'Logo, motto, legal details, report branding & more' },
    labConfig:  { id: 'labConfig',  label: 'Lab Configuration',  route: 'lab-setup',   icon: 'fa-sliders-h',    description: 'Sampling locations, areas & more' },
}
/**
 * Admin Panel navigation items.
 * Items with `superAdminOnly: true` are visible only to Super Admins.
 * All other items are visible to both Admin and Super Admin.
 */
export const adminOptions: Record<string, { id: string; label: string; route: string; icon?: string; superAdminOnly?: boolean }> = {
  userDetails:   { id: 'userDetails',   label: 'User details',      route: 'users',           icon: 'fa-user-cog' },
  attendance:    { id: 'attendance',    label: 'Attendance',         route: 'attendance',      icon: 'fa-calendar-check' },
  salary:        { id: 'salary',        label: 'Salary',             route: 'salary',          icon: 'fa-money-bill-wave' },
  holidays:      { id: 'holidays',      label: 'Holiday Calendar',   route: 'holidays',        icon: 'fa-calendar-alt' },
  // doctor:        { id: 'doctor',        label: 'Doctor',             route: 'doctors',         icon: 'fa-user-md' },
  // collectionBoy: { id: 'collectionBoy', label: 'Collection Boy',     route: 'collection-boys', icon: 'fa-motorcycle' },
  // Super Admin only — template management
  visitSchedule: { id: 'visitSchedule', label: 'Visit Schedule',      route: 'visit-schedule',  icon: 'fa-calendar-check' },
  template:      { id: 'template',      label: 'Template',           route: 'template',        icon: 'fa-file-alt', superAdminOnly: true },
};

export const summaryReportMenu: { [key: string]: { id: string; label: string; icon: string } } = {
  patientRegister:        { id: 'patient-register',        label: 'Patient Register',               icon: 'fa-users'        },
  referrerCollection:     { id: 'referrer-collection',     label: 'Referrer Collection',            icon: 'fa-users-cog'    },
  discountAuthorityWise:  { id: 'discount-authority-wise', label: 'Discount Authority Wise',        icon: 'fa-percent'      },
  patientHistoryWise:     { id: 'patient-history-wise',    label: 'Patient History Wise',           icon: 'fa-history'      },
  worksheetReport:        { id: 'worksheet',               label: 'Worksheet Report',               icon: 'fa-tasks'        },
  registerReports:        { id: 'register-reports',        label: 'Register Reports',               icon: 'fa-book'         },
  patientDiagnosisReport: { id: 'patient-diagnosis',       label: 'Patient Diagnosis Report',       icon: 'fa-heartbeat'    },
  pndtTestReport:         { id: 'pndt-test',               label: 'PNDT Test Report',               icon: 'fa-flask'        },
  masterTestList:         { id: 'master-test-list',        label: 'Master Test List',               icon: 'fa-database'     },
  rateList:               { id: 'rate-list',               label: 'Rate List',                      icon: 'fa-tag'          },
  addressManagerReport:   { id: 'address-manager',         label: 'Address Manager Report',         icon: 'fa-map-marker'   },
  tpaReport:              { id: 'tpa-report',              label: 'TPA Report',                     icon: 'fa-link'         },
};

export const summaryReportApiEndpoints: { [key: string]: string } = {
  patientRegister:      'patient-registrations',
  // Legacy individual endpoints (kept for backward compatibility / output-to-file)
  doctorWiseCollection: 'doctor-wise-collection',
  panelCompanyWise:     'panel-company-wise',
  collectionBoysWise:   'collection-boys-wise',
  // Merged referrer report
  referrerCollection:   'referrer-collection',
  discountAuthorityWise: 'discount-authority-wise',
  patientHistoryWise:   'patient-history-wise',
  worksheetReport:      'worksheet-report',
  receiptRegister:      'receipt-register',
  refundRegister:       'refund-register',
  billRegister:         'bill-register',
  patientDiagnosisReport: 'patient-diagnosis-report',
  pndtTestReport:       'pndt-test-report',
  masterTestList:       'master-test-list',
  rateList:             'rate-list',
  addressManagerReport: 'address-manager-report',
  tpaReport:            'tpa-report',
};

// All reports return { currentYear: [{period, count}], previousYear: [{period, count}] }
// so configs are simplified — no per-report columns needed.
export const reportConfigs: { [key: string]: ReportConfig } = {
  patientRegister:        { id: 'patientRegister',        label: 'Patient Register',               icon: 'fa-users',        endpoint: summaryReportApiEndpoints['patientRegister'],        defaultChartType: 'bar', digitInfo: '1.0-0' },
  referrerCollection:     { id: 'referrerCollection',     label: 'Referrer Collection',            icon: 'fa-users-cog',    endpoint: summaryReportApiEndpoints['referrerCollection'],     defaultChartType: 'bar', digitInfo: '1.2-2' },
  discountAuthorityWise:  { id: 'discountAuthorityWise',  label: 'Discount Authority Wise report', icon: 'fa-percent',      endpoint: summaryReportApiEndpoints['discountAuthorityWise'],  defaultChartType: 'doughnut', digitInfo: '1.2-2' },
  patientHistoryWise:     { id: 'patientHistoryWise',     label: 'Patient history wise',           icon: 'fa-history',      endpoint: summaryReportApiEndpoints['patientHistoryWise'],     defaultChartType: 'line', digitInfo: '1.2-2' },
  worksheetReport:        { id: 'worksheetReport',        label: 'Worksheet report',               icon: 'fa-tasks',        endpoint: summaryReportApiEndpoints['worksheetReport'],        defaultChartType: 'bar', digitInfo: '1.2-2' },
  registerReports:        { id: 'registerReports',        label: 'Register Reports',               icon: 'fa-book',         endpoint: summaryReportApiEndpoints['billRegister'],           defaultChartType: 'bar', digitInfo: '1.2-2' },
  // ── Individual register configs — used by table-report inside register-reports tabs ──
  billRegister:           { id: 'billRegister',           label: 'Bill Register',                  icon: 'fa-list',         endpoint: summaryReportApiEndpoints['billRegister'],           defaultChartType: 'bar',      digitInfo: '1.2-2' },
  receiptRegister:        { id: 'receiptRegister',        label: 'Receipt Register',               icon: 'fa-receipt',      endpoint: summaryReportApiEndpoints['receiptRegister'],        defaultChartType: 'doughnut', digitInfo: '1.2-2' },
  refundRegister:         { id: 'refundRegister',         label: 'Refund Register',                icon: 'fa-undo',         endpoint: summaryReportApiEndpoints['refundRegister'],         defaultChartType: 'bar',      digitInfo: '1.0-0' },
  patientDiagnosisReport: { id: 'patientDiagnosisReport', label: 'Patient Diagnosis Report',       icon: 'fa-heartbeat',    endpoint: summaryReportApiEndpoints['patientDiagnosisReport'], defaultChartType: 'pie', digitInfo: '1.2-2' },
  pndtTestReport:         { id: 'pndtTestReport',         label: 'PNDT Test Report',               icon: 'fa-flask-empty',  endpoint: summaryReportApiEndpoints['pndtTestReport'],         defaultChartType: 'bar', digitInfo: '1.2-2' },
  masterTestList:         { id: 'masterTestList',         label: 'Master Test List',               icon: 'fa-database',     endpoint: summaryReportApiEndpoints['masterTestList'],         defaultChartType: 'bar', digitInfo: '1.2-2', noDateFilter: true, noChart: true },
  rateList:               { id: 'rateList',               label: 'Rate List',                      icon: 'fa-tag',          endpoint: summaryReportApiEndpoints['rateList'],               defaultChartType: 'bar', digitInfo: '1.2-2', noDateFilter: true, noChart: true },
  addressManagerReport:   { id: 'addressManagerReport',   label: 'Address Manager Report',         icon: 'fa-map-marker',   endpoint: summaryReportApiEndpoints['addressManagerReport'],   defaultChartType: 'bar', digitInfo: '1.2-2', noDateFilter: true },
  tpaReport:              { id: 'tpaReport',              label: 'TPA report',                     icon: 'fa-link',         endpoint: summaryReportApiEndpoints['tpaReport'],              defaultChartType: 'bar', digitInfo: '1.2-2' },
};

export const chartDisplayOptions: { value: string; label: string; icon: string }[] = [
  { value: 'bar',      label: 'Bar',      icon: 'fa-chart-bar'   },
  { value: 'line',     label: 'Line',     icon: 'fa-chart-line'  },
  { value: 'area',     label: 'Area',     icon: 'fa-chart-area'  },
  { value: 'pie',      label: 'Pie',      icon: 'fa-chart-pie'   },
  { value: 'doughnut', label: 'Doughnut', icon: 'fa-circle-notch'},
];

// Distinct color palette for charts (Tableau / D3 inspired) to improve bar comparison
export const CHART_COLORS = [
  '#1f77b4', // muted blue
  '#ff7f0e', // safety orange
  '#2ca02c', // cooked asparagus green
  '#d62728', // brick red
  '#9467bd', // muted purple
  '#8c564b', // chestnut brown
  '#e377c2', // raspberry
  '#7f7f7f', // middle grey
  '#bcbd22', // curry yellow-green
  '#17becf', // blue-teal
  '#393b79', // dark indigo
  '#637939', // olive
  '#8c6d31', // brown-yellow
  '#843c39', // maroon
  '#7b4173'  // deep magenta
];