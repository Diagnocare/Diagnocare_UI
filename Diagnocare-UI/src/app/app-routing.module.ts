import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

// Guards (functional) + role enum — kept eager; they are tiny and needed to
// evaluate routes up front. Every screen component below is lazy-loaded via
// loadComponent, so each route ships in its own chunk and only downloads when
// visited. This keeps the initial bundle to the framework + shell.
import { authGuard } from './core/guards/auth.guard';
import { licenceGuard } from './core/guards/licence.guard';
import { roleGuard } from './core/guards/role.guard';
import { pinExpiryGuard } from './core/guards/pin-expiry.guard';
import { Role } from './constant/enums';

export const routes: Routes = [
  // Public (no header)
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', title: 'Home',
    loadComponent: () => import('./component/login/home.component').then(m => m.HomeComponent) },
  { path: 'login', title: 'Login',
    loadComponent: () => import('./component/login/login.component').then(m => m.LoginComponent) },
  { path: 'login/callback',
    loadComponent: () => import('./component/login/login.component').then(m => m.LoginComponent) },
  { path: 'forgot-password', title: 'Forgot Password',
    loadComponent: () => import('./component/login/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  // Help / Contact Us — public, accessible to everyone (no auth or role guard)
  { path: 'help', title: 'Help & Contact',
    loadComponent: () => import('./component/help/help.component').then(m => m.HelpComponent) },
  { path: 'register-pathology', title: 'Register Pathology',
    loadComponent: () => import('./component/pathology/register-pathology/register-pathology.component').then(m => m.RegisterPathologyComponent) },
  // Note: there is deliberately no 'extend-license' route. Licence extension is
  // performed in the shared Diagnocare application — this app only reads the licence.

  // Licence expired — accessible even when licence has expired (public, no layout header)
  { path: 'licence-expired', title: 'Licence Expired',
    loadComponent: () => import('./component/pathology/licence-expired/licence-expired.component').then(m => m.LicenceExpiredComponent) },

  // Authenticated (header shown via LayoutComponent)
  {
    path: '',
    loadComponent: () => import('./component/layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard, licenceGuard, pinExpiryGuard],
    children: [
      // Pathology dashboard — Admin / User / Assistant only
      { path: 'pathology', title: 'Pathology',
        loadComponent: () => import('./component/pathology/pathology-home/pathology-home.component').then(m => m.PathologyHomeComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Super_Admin.id)] },

      // Address Manager — Admin+
      { path: 'contacts', title: 'Address Manager',
        loadComponent: () => import('./component/addressManager/contact-list.component').then(m => m.ContactListComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'contacts/add', title: 'Add Contact',
        loadComponent: () => import('./component/addressManager/contact-form.component').then(m => m.ContactFormComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'contacts/edit/:id', title: 'Edit Contact',
        loadComponent: () => import('./component/addressManager/contact-form.component').then(m => m.ContactFormComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'contacts/delete/:id', title: 'Delete Contact',
        loadComponent: () => import('./component/addressManager/contact-delete.component').then(m => m.ContactDeleteComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },

      // Users — Admin+
      { path: 'users', title: 'Staff Management',
        loadComponent: () => import('./component/staff/staff-management.component').then(m => m.StaffManagementComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'users/add', title: 'Add Staff',
        loadComponent: () => import('./component/staff/staff-unified-form.component').then(m => m.StaffUnifiedFormComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'users/edit/:id', title: 'Edit Staff',
        loadComponent: () => import('./component/staff/staff-unified-form.component').then(m => m.StaffUnifiedFormComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },

      // Patients — all lab staff (not Doctor who just views reports)
      { path: 'patients', title: 'Patients',
        loadComponent: () => import('./component/patient/patients-list/patients-list.component').then(m => m.PatientsListComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Super_Admin.id)] },
      { path: 'patients/add', title: 'Add Patient',
        loadComponent: () => import('./component/patient/add-patient/add-patient.component').then(m => m.AddPatientComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Super_Admin.id)] },
      { path: 'patients/stepper', title: 'Add Patient',
        loadComponent: () => import('./component/patient/stepper/stepper.component').then(m => m.StepperComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Super_Admin.id)] },
      { path: 'patients/edit/:id', title: 'Edit Patient',
        loadComponent: () => import('./component/patient/edit-patient/edit-patient.component').then(m => m.EditPatientComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Super_Admin.id)] },

      // Patient Tests — all lab staff + Doctor (read-only for Doctor handled in component)
      { path: 'patient-tests', title: 'Patient Tests',
        loadComponent: () => import('./component/patient-test/patient-test-list/patient-test-list.component').then(m => m.PatientTestListComponent) },
      { path: 'patient-tests/view/:id', title: 'View Test',
        loadComponent: () => import('./component/patient-test/view-test/view-test.component').then(m => m.ViewTestComponent) },
      { path: 'patient-tests/edit/:id', title: 'Edit Test',
        loadComponent: () => import('./component/patient-test/edit-test/edit-test.component').then(m => m.EditTestComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Super_Admin.id)] },

      // Lab Tests — Admin / User / Assistant
      { path: 'manage-tests', title: 'Manage Tests',
        loadComponent: () => import('./component/pathTest/manage-tests/manage-tests.component').then(m => m.ManageTestsComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Super_Admin.id)] },
      { path: 'manage-tests/addTestParameter/:id', title: 'Add Test Parameter',
        loadComponent: () => import('./component/pathTest/add-test-parameter/add-test-parameter').then(m => m.AddTestParameter),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'manage-tests/edit/:id', title: 'Edit Test',
        loadComponent: () => import('./component/pathTest/add-edit-modal/add-edit-modal.component').then(m => m.AddEditModalComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },

      // Summary Reports — container shell with child routes rendered in its <router-outlet>
      {
        path: 'reports',
        loadComponent: () => import('./component/summary-report/summary-report-container.component').then(m => m.SummaryReportContainerComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Doctor.id, Role.Assistant.id, Role.Super_Admin.id)],
        children: [
          // Default redirect to patient-register when no child is specified
          { path: '', redirectTo: 'patient-register', pathMatch: 'full' },

          // Time-series chart report (uses BaseReportComponent)
          { path: 'patient-register', title: 'Patient Register',
            loadComponent: () => import('./component/summary-report/reports/patient-register.component').then(m => m.PatientRegisterComponent) },

          // Tabular reports (use TableReportComponent)
          { path: 'referrer-collection', title: 'Referrer Collection',
            loadComponent: () => import('./component/summary-report/reports/referrer-collection.component').then(m => m.ReferrerCollectionComponent) },
          // Legacy routes — redirect to merged report so old bookmarks still work
          { path: 'doctor-wise-collection', redirectTo: 'referrer-collection' },
          { path: 'panel-company-wise', redirectTo: 'referrer-collection' },
          { path: 'collection-boys-wise', redirectTo: 'referrer-collection' },
          { path: 'reporting-doctor-wise', title: 'Reporting Doctor Wise',
            loadComponent: () => import('./component/summary-report/reports/reporting-doctor-wise.component').then(m => m.ReportingDoctorWiseComponent),
            canActivate: [roleGuard(Role.Admin.id, Role.Doctor.id, Role.Assistant.id, Role.Super_Admin.id)] },
          { path: 'discount-authority-wise', title: 'Discount Authority Wise',
            loadComponent: () => import('./component/summary-report/reports/discount-authority-wise.component').then(m => m.DiscountAuthorityWiseComponent) },
          { path: 'patient-history-wise', title: 'Patient History Wise',
            loadComponent: () => import('./component/summary-report/reports/patient-history-wise.component').then(m => m.PatientHistoryWiseComponent),
            canActivate: [roleGuard(Role.Admin.id, Role.Doctor.id, Role.Assistant.id, Role.Super_Admin.id)] },
          { path: 'worksheet', title: 'Worksheet Report',
            loadComponent: () => import('./component/summary-report/reports/worksheet-report.component').then(m => m.WorksheetReportComponent) },
          { path: 'register-reports', title: 'Register Reports',
            loadComponent: () => import('./component/summary-report/reports/register-reports.component').then(m => m.RegisterReportsComponent) },
          { path: 'patient-diagnosis', title: 'Patient Diagnosis Report',
            loadComponent: () => import('./component/summary-report/reports/patient-diagnosis-report.component').then(m => m.PatientDiagnosisReportComponent),
            canActivate: [roleGuard(Role.Admin.id, Role.Doctor.id, Role.Assistant.id, Role.Super_Admin.id)] },
          { path: 'pndt-test', title: 'PNDT Test Report',
            loadComponent: () => import('./component/summary-report/reports/pndt-test-report.component').then(m => m.PndtTestReportComponent) },
          { path: 'master-test-list', title: 'Master Test List',
            loadComponent: () => import('./component/summary-report/reports/master-test-list.component').then(m => m.MasterTestListComponent) },
          { path: 'rate-list', title: 'Rate List',
            loadComponent: () => import('./component/summary-report/reports/rate-list.component').then(m => m.RateListComponent) },
          { path: 'address-manager', title: 'Address Manager Report',
            loadComponent: () => import('./component/summary-report/reports/address-manager-report.component').then(m => m.AddressManagerReportComponent) },
          { path: 'tpa-report', title: 'TPA Report',
            loadComponent: () => import('./component/summary-report/reports/tpa-report.component').then(m => m.TpaReportComponent) },
        ]
      },

      // Templates — Super Admin only
      { path: 'template', title: 'Report Templates',
        loadComponent: () => import('./component/template/template.component').then(m => m.TemplateComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      // Lab Setup & Profile — Admin+
      { path: 'lab-setup', title: 'Lab Setup',
        loadComponent: () => import('./component/lab-setup/lab-setup.component').then(m => m.LabSetupComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'lab-profile', title: 'Lab Profile',
        loadComponent: () => import('./component/lab-profile/lab-profile.component').then(m => m.LabProfileComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },

      // Attendance / Salary / Holidays — Admin+
      { path: 'attendance', title: 'Attendance',
        loadComponent: () => import('./component/attendance/attendance.component').then(m => m.AttendanceComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'salary', title: 'Salary',
        loadComponent: () => import('./component/salary/salary.component').then(m => m.SalaryComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'holidays', title: 'Holiday Calendar',
        loadComponent: () => import('./component/holiday/holiday.component').then(m => m.HolidayComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },

      // Visit Schedule — Admin manages, all staff see their own
      { path: 'visit-schedule', title: 'Visit Schedule',
        loadComponent: () => import('./component/visit-schedule/visit-schedule.component').then(m => m.VisitScheduleComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)] },
      { path: 'my-visits', title: 'My Visits Today',
        loadComponent: () => import('./component/my-visits/my-visits.component').then(m => m.MyVisitsComponent) },

      // ── User Panel — self-service views for non-admin staff ──────────────────
      // (User, Assistant, Collection Boy, Doctor). Read-only versions of the
      // admin Attendance / Holiday / Visit / Salary modules, scoped to the user.

      // My Attendance — read-only self-service view (doctors, collection boys, lab staff)
      { path: 'my-attendance', title: 'My Attendance',
        loadComponent: () => import('./component/my-attendance/my-attendance.component').then(m => m.MyAttendanceComponent),
        canActivate: [roleGuard(Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id, Role.Super_Admin.id)] },

      // My Holidays — reuses HolidayComponent, which renders read-only for non-admins
      { path: 'my-holidays', title: 'Holiday Calendar',
        loadComponent: () => import('./component/holiday/holiday.component').then(m => m.HolidayComponent),
        canActivate: [roleGuard(Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id, Role.Super_Admin.id)] },

      // My Salary — read-only own salary summary & payment history
      { path: 'my-salary', title: 'My Salary',
        loadComponent: () => import('./component/my-salary/my-salary.component').then(m => m.MySalaryComponent),
        canActivate: [roleGuard(Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id, Role.Super_Admin.id)] },

      // Attendance Requests — ONE shared surface for every authenticated role.
      // The components branch on TokenService.isAdmin(): users see/manage their own
      // requests; admins see all requests and can approve/reject. Order matters:
      // 'new' must precede the ':id' param routes.
      { path: 'attendance-requests', title: 'Attendance Requests',
        loadComponent: () => import('./component/attendance-request/requests-list/requests-list.component').then(m => m.RequestsListComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id, Role.Super_Admin.id)] },
      { path: 'attendance-requests/new', title: 'New Attendance Request',
        loadComponent: () => import('./component/attendance-request/request-form/request-form.component').then(m => m.RequestFormComponent),
        canActivate: [roleGuard(Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id, Role.Super_Admin.id)] },
      { path: 'attendance-requests/:id/edit', title: 'Edit Attendance Request',
        loadComponent: () => import('./component/attendance-request/request-form/request-form.component').then(m => m.RequestFormComponent),
        canActivate: [roleGuard(Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id, Role.Super_Admin.id)] },
      { path: 'attendance-requests/:id', title: 'Attendance Request',
        loadComponent: () => import('./component/attendance-request/request-detail/request-detail.component').then(m => m.RequestDetailComponent),
        canActivate: [roleGuard(Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id, Role.Super_Admin.id)] },

      // Account / Header pages
      { path: 'profile', title: 'Profile',
        loadComponent: () => import('./component/header/profile/profile.component').then(m => m.ProfileComponent) },
      { path: 'settings', title: 'Settings',
        loadComponent: () => import('./component/header/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'change-password', title: 'Change Password',
        loadComponent: () => import('./component/header/change-password/change-password.component').then(m => m.ChangePasswordComponent) },
      // Authenticator App merged into Settings — keep old link/bookmark working.
      { path: 'setup-mfa', redirectTo: 'settings', pathMatch: 'full' },
      // PIN change — also reachable as forced flow when PIN has expired (?reason=expired)
      { path: 'change-pin', title: 'Change PIN',
        loadComponent: () => import('./component/header/change-pin/change-pin.component').then(m => m.ChangePinComponent) },

      // Receipt
      { path: 'receipt/:id', title: 'Receipt',
        loadComponent: () => import('./component/receipt/bill-receipt').then(m => m.BillReceipt) },
      { path: 'receipt', title: 'Receipt', pathMatch: 'full',
        loadComponent: () => import('./component/receipt/bill-receipt').then(m => m.BillReceipt) },
    ]
  },

  // Fallback
  { path: '**', redirectTo: 'login' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
