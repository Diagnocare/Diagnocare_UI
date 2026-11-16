import { Role, RoleId } from './enums';
import { ModuleAccess } from '../models/auth/module-access.model';

export const MODULE_ACCESS: Record<RoleId, ModuleAccess> = {
  [Role.Admin.id]: {
    home: true,
    labOps: true,
    summaryReports: true,
    // Lab Setup (Lab Profile + Lab Configuration) is Super Admin only, matching
    // the API. Admin no longer sees the dropdown at all.
    labSetup: false,
    adminPanel: true,
    patientsLink: false,
    patientTestsLink: false,
    // Admin is a salaried staff member too. Payroll moved to Super Admin only, so
    // without the User Panel an Admin would have no route to their own payslips at
    // all — the admin Salary module used to be their only way in.
    myVisits: true,
    myAttendance: true,
    mySalary: true,
    // Admin reaches the holiday calendar through the Admin Panel, so it is not
    // duplicated in the User Panel.
    myHolidays: false,
    userPanel: true,
    // Admin raises corrections for themselves; the Super Admin reviews them.
    attendanceRequests: true,
    myPickups: false,
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
    // Super Admin works entirely out of the Admin Panel: it already carries the
    // all-staff Attendance, Salary, Holiday and Visit Schedule modules, each of
    // which shows their own records alongside everyone else's. A second panel
    // duplicating those as "My …" links would be redundant, so the User Panel is
    // off and the four item flags below are false to match.
    //
    // The /my-* routes still accept Super Admin, so nothing breaks if one is
    // opened directly — they simply are not advertised in the nav.
    myVisits: false,
    myAttendance: false,
    mySalary: false,
    myHolidays: false,
    userPanel: false,
    attendanceRequests: true, // reviews everyone's, and can raise their own
    myPickups: false,
    landingRoute: '/pathology',
  },
  [Role.Receptionist.id]: {
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
    myPickups: false,
    landingRoute: '/pathology',
  },
  [Role.Assistant.id]: {
    home: true,
    labOps: true,
    summaryReports: true,
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
    myPickups: false,
    landingRoute: '/pathology',
  },
  [Role.Collection_Boy.id]: {
    home: true,
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
    myPickups: true,
    // Their day is the pickup list, so they open on it.
    landingRoute: '/pathology',
  },
  [Role.Doctor.id]: {
    home: true,
    labOps: false,
    summaryReports: true,
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
    myPickups: false,
    landingRoute: '/pathology',
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
  myPickups:        false,
  landingRoute:     '/pathology',
};

/**
 * The nav flags the DOCTOR capability adds, for someone whose role is something else.
 *
 * A Super Admin can additionally be a doctor (one account, both jobs — see
 * `TokenService.isDoctor`). Their access is then the union of the two, which in practice
 * is a very short list, because Super Admin already grants nearly everything a doctor
 * can reach:
 *
 *   patientTestsLink  – the doctor's own route to the test-report list. Super Admin
 *                       reaches the same screen through labOps, so this changes nothing
 *                       for them in the nav; it is listed because it is genuinely part
 *                       of the capability and must apply to any other role that is ever
 *                       given it.
 *   summaryReports    – already true for Super Admin, listed for the same reason.
 *
 * Everything NOT listed here is left exactly as the role had it. In particular the
 * self-service User Panel flags (myVisits / myAttendance / mySalary / myHolidays /
 * userPanel) are deliberately absent: those are not doctor features, and a Super Admin
 * has them off on purpose because the Admin Panel already carries the same modules for
 * all staff. Turning them on would hand the owner a second copy of four screens they
 * already have — the duplicate menu entries this is meant to avoid.
 *
 * The doctor-specific sidebar item that a doctor-capable Super Admin genuinely gains is
 * "Reports to verify", which AppShellComponent.buildNav() adds from `isDoctor()`
 * directly — it is one link, not a section of them, so it needs no flag here.
 */
const DOCTOR_CAPABILITY_FLAGS = ['patientTestsLink', 'summaryReports'] as const satisfies
  readonly (keyof ModuleAccess)[];

/**
 * The access a user actually has: their role's row, plus the Doctor capability's flags
 * when they hold it.
 *
 * Use this instead of indexing MODULE_ACCESS directly, so a doctor-capable Super Admin
 * is never shown the plain Super Admin menu. Purely additive — a flag the role already
 * has stays on, and nothing the role has is ever switched off, so a role's own access
 * cannot be reduced by also being a doctor.
 *
 * `isDoctor` is the capability as the server reported it in the JWT, not a checkbox
 * value; the API enforces the same matrix regardless of what this returns.
 */
export function resolveModuleAccess(roleId: RoleId | null, isDoctor = false): ModuleAccess {
  const base = roleId !== null ? (MODULE_ACCESS[roleId] ?? DEFAULT_ACCESS) : DEFAULT_ACCESS;
  if (!isDoctor) return base;

  const merged = { ...base };
  for (const flag of DOCTOR_CAPABILITY_FLAGS) merged[flag] = true;
  return merged;
}
