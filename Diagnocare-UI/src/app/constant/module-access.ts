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
    myVisits:         false,   // Admins manage the schedule, they don't receive assignments
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
    myVisits:         false,   // Admins manage the schedule, they don't receive assignments
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
    myVisits:         true,    // staff members can be assigned field visits
    landingRoute:     '/patients',
  },
  [Role.Assistant.id]: {
    home:             true,
    labOps:           true,
    summaryReports:   false,
    labSetup:         false,
    adminPanel:       false,
    patientsLink:     false,
    patientTestsLink: false,
    myVisits:         true,    // staff members can be assigned field visits
    landingRoute:     '/patients',
  },
  [Role.Collection_Boy.id]: {
    home:             false,
    labOps:           false,
    summaryReports:   false,
    labSetup:         false,
    adminPanel:       false,
    patientsLink:     true,    // see patient list for sample collection
    patientTestsLink: false,
    myVisits:         true,    // collection boys are commonly assigned field visits
    landingRoute:     '/patients',
  },
  [Role.Doctor.id]: {
    home:             false,
    labOps:           false,
    summaryReports:   false,
    labSetup:         false,
    adminPanel:       false,
    patientsLink:     false,
    patientTestsLink: true,    // view patient test reports
    myVisits:         true,    // doctors can be assigned field visits
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
  landingRoute:     '/pathology',
};
