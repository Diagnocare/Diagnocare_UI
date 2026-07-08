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
   * True for non-admin staff (User, Assistant, Collection Boy, Doctor) who get the
   * self-service "User Panel" dropdown grouping My Attendance, Holidays, My Visits & My Salary.
   */
  userPanel:        boolean;
  /** Route to navigate to immediately after a successful login. */
  landingRoute:     string;
}

export const MODULE_ACCESS: Record<RoleId, ModuleAccess> = {
  [Role.Super_Admin.id]: {
    home:             true,
    labOps:           true,
    summaryReports:   true,
    labSetup:         true,
    adminPanel:       true,
    patientsLink:     false,
    patientTestsLink: false,
    myVisits:         false,
    myAttendance:     false,   // Admins see all staff via the full Attendance module
    userPanel:        false,   // Admins use the full Admin Panel instead
    landingRoute:     '/pathology',
  },
  [Role.Admin.id]: {
    home:             true,
    labOps:           true,
    summaryReports:   true,
    labSetup:         true,
    adminPanel:       true,
    patientsLink:     false,
    patientTestsLink: false,
    myVisits:         false,
    myAttendance:     false,   // Admins see all staff via the full Attendance module
    userPanel:        false,   // Admins use the full Admin Panel instead
    landingRoute:     '/pathology',
  },
  [Role.User.id]: {
    home:             true,
    labOps:           true,
    summaryReports:   false,
    labSetup:         false,
    adminPanel:       false,
    patientsLink:     false,
    patientTestsLink: false,
    myVisits:         true,
    myAttendance:     true,    // staff members can view their own attendance
    userPanel:        true,     // self-service User Panel dropdown
    landingRoute:     '/patients',
  },
  [Role.Assistant.id]: {
    home:             true,
    labOps:           true,
    summaryReports:   true,     // Assistants can view the Summary Reports
    labSetup:         false,
    adminPanel:       false,
    patientsLink:     false,
    patientTestsLink: false,
    myVisits:         true,
    myAttendance:     true,    // staff members can view their own attendance
    userPanel:        true,     // self-service User Panel dropdown
    landingRoute:     '/patients',
  },
  [Role.Collection_Boy.id]: {
    home:             false,
    labOps:           false,
    summaryReports:   false,
    labSetup:         false,
    adminPanel:       false,
    patientsLink:     true,
    patientTestsLink: false,
    myVisits:         true,
    myAttendance:     true,    // collection boys can view their own attendance
    userPanel:        true,     // self-service User Panel dropdown
    landingRoute:     '/patients',
  },
  [Role.Doctor.id]: {
    home:             false,
    labOps:           false,
    summaryReports:   false,
    labSetup:         false,
    adminPanel:       false,
    patientsLink:     false,
    patientTestsLink: true,
    myVisits:         true,
    myAttendance:     true,    // doctors can view their own attendance
    userPanel:        true,     // self-service User Panel dropdown
    landingRoute:     '/patient-tests',
  },
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
  userPanel:        false,
  landingRoute:     '/pathology',
};
