/**
 * Describes which nav sections a role can see and where they land after login.
 *
 * Section flags:
 *  home             – Pathology dashboard home link
 *  labOps           – Full "Lab Operations" dropdown (patients, tests, receipts, etc.)
 *  summaryReports   – "Reports" dropdown (statistical / summary reports).
 *                     Granted to every role except User; kept in step with the
 *                     API's ReportViewers policy and the /reports route guard,
 *                     which must list the same roles or the dropdown appears and
 *                     then every entry in it lands on Access Denied.
 *  labSetup         – "Lab Setup" dropdown (lab profile, sampling locations, etc.).
 *                     Super Admin only; kept in step with the API and the
 *                     /lab-setup and /lab-profile route guards.
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
  /**
   * "My Pickups" nav link — the collection boy's list of samples to collect and
   * hand over to the lab. Collection Boy only, matching the API's
   * CollectionBoyOnly policy on api/SampleCollection/MyPickups.
   */
  myPickups:        boolean;
  /** Route to navigate to immediately after a successful login. */
  landingRoute:     string;
}
