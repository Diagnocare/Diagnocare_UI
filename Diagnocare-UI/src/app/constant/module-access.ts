import { Role, RoleId } from './enums';

/**
 * Describes which nav sections a role can see and where they land after login.
 *
 * Section flags:
 *  home             – Pathology dashboard home link
 *  labOps           – Full "Lab Operations" dropdown (patients, tests, receipts, etc.)
 *  summaryReports   – "Reports" dropdown (statistical / summary reports)
 *  labSetup         – "Lab Setup" dropdown (lab profile, sampling locations, etc.)
 *  adminPanel       – "Admin Panel" dropdown (users, attendance, salary, etc.)
 *  patientsLink     – Single "Patients" nav link (for Collection Boys with limited access)
 *  patientTestsLink – Single "My Reports" nav link (for Doctors reviewing test results)
 *  myVisits         – Single "My Visits" nav link (for members who receive field-visit assignments)
 *  userPanel        – "User Panel" dropdown (self-service: attendance, holidays, visits, salary)
 *                     for non-admin staff (User, Assistant, Collection Boy, Doctor)
 */
export interface ModuleAccess {
  home:             boolean;
  labOps:           boolean;
  summaryReports:   boolean;
  labSetup:         boolean;
  adminPanel:       boolean;
  patientsLink:     boolean;
  patientTestsLink: boolean;
  myVisits:         boolean;
  /** True for non-admin staff who can view their own attendance (read-only). */
  myAttendance:     boolean;
  /**
   * True for anyone who can read their own payslip and payment history.
   * Includes Admin: salary administration is Super Admin only, so /my-salary is
   * an Admin's only route to their own pay.
   */
  mySalary:         boolean;
  /** True for staff who see the read-only holiday calendar in the User Panel. */
  myHolidays:       boolean;
  /**
   * True for anyone who gets the self-service "User Panel" dropdown. The
   * dropdown is a container only — which of My Attendance / My Visits /
   * My Salary / Holiday Calendar appear inside it is decided by the four flags
   * above, so a role can be given the panel for a single item without being
   * shown links it would be denied. Admin is exactly that case.
   */
  userPanel:        boolean;
  /** Attendance correction requests — shared view: staff raise/track, admins review. */
  attendanceRequests: boolean;
  /** Route to navigate to immediately after a successful login. */
  landingRoute:     string;
}

export const MODULE_ACCESS: Record<RoleId, ModuleAccess> = {
  [Role.Admin.id]: {
    home: true,
    labOps: true,
    summaryReports: true,
    labSetup: true,
    adminPanel: true,
    patientsLink: false,
    patientTestsLink: false,
    // Admin is a salaried staff member too. Payroll moved to Super Admin only, so
    // without the User Panel an Admin would have no route to their own payslips at
    // all — the admin Salary module used to be their only way in.
    myVisits: true,
    myAttendance: true,
    userPanel: true,
    attendanceRequests: true, // Admins review/approve requests
    landingRoute: '/pathology',
  },
  [Role.Super_Admin.id]: {
    home: true,
    labOps: true,
    summaryReports: true,
    labSetup: true,
    adminPanel: true,
    patientsLink: false,
    patientTestsLink: false,
    // Super Admin is a staff member too and has attendance, visits and a salary
    // record like anyone else. Previously myVisits/myAttendance were true while
    // userPanel was false, so those links had no dropdown to render into and were
    // simply unreachable. Turning the panel on makes the flags coherent.
    myVisits: true,
    myAttendance: true,
    userPanel: true,
    attendanceRequests: true, // reviews everyone's, and can raise their own
    landingRoute: '/pathology',
  },
  [Role.User.id]: {
    home: true,
    labOps: true,
    summaryReports: false,
    labSetup: false,
    adminPanel: false,
    patientsLink: false,
    patientTestsLink: false,
    myVisits: true,
    myAttendance: true, // staff members can view their own attendance
    mySalary: true,
    myHolidays: true,
    userPanel: true, // self-service User Panel dropdown
    attendanceRequests: true, // staff can raise/track their own requests
    landingRoute: '/patients',
  },
  [Role.Assistant.id]: {
    home: true,
    labOps: true,
    // Summary reports expose per-referrer revenue, discount patterns and the full
    // rate card. That is management information, not bench work — a lab assistant
    // needs the worklist, not the commercials. Matches the ReportViewers policy.
    summaryReports: false,
    labSetup: false,
    adminPanel: false,
    patientsLink: false,
    patientTestsLink: false,
    myVisits: true,
    myAttendance: true, // staff members can view their own attendance
    mySalary: true,
    myHolidays: true,
    userPanel: true, // self-service User Panel dropdown
    attendanceRequests: true, // staff can raise/track their own requests
    landingRoute: '/patients',
  },
  [Role.Collection_Boy.id]: {
    home: false,
    labOps: false,
    summaryReports: false,
    labSetup: false,
    adminPanel: false,
    patientsLink: true,
    patientTestsLink: false,
    myVisits: true,
    myAttendance: true, // collection boys can view their own attendance
    mySalary: true,
    myHolidays: true,
    userPanel: true, // self-service User Panel dropdown
    attendanceRequests: true, // collection boys can raise/track their own requests
    landingRoute: '/patients',
  },
  [Role.Doctor.id]: {
    home: false,
    labOps: false,
    summaryReports: false,
    labSetup: false,
    adminPanel: false,
    patientsLink: false,
    patientTestsLink: true,
    myVisits: true,
    myAttendance: true, // doctors can view their own attendance
    mySalary: true,
    myHolidays: true,
    userPanel: true, // self-service User Panel dropdown
    attendanceRequests: true, // doctors can raise/track their own requests
    landingRoute: '/patient-tests',
  }
};

/** Fallback when role is unknown or not yet set. */
export const DEFAULT_ACCESS: ModuleAccess = {
  home:             false,
  labOps:           false,
  summaryReports:   false,
  labSetup:         false,
  adminPanel:       false,
  patientsLink:     false,
  patientTestsLink: false,
  myVisits:         false,
  myAttendance:     false,
  mySalary:         false,
  myHolidays:       false,
  userPanel:        false,
  attendanceRequests: false,
  landingRoute:     '/pathology',
};
