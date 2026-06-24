import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LayoutComponent } from './component/layout/layout.component';
import { authGuard } from './core/guards/auth.guard';
import { licenceGuard } from './core/guards/licence.guard';

// Auth / Public
import { LoginComponent } from './component/login/login.component';
import { ForgotPasswordComponent } from './component/login/forgot-password.component';
import { HomeComponent } from './component/login/home.component';

// Pathology
import { PathologyHomeComponent } from './component/pathology/pathology-home/pathology-home.component';

// Address Manager
import { ContactListComponent } from './component/addressManager/contact-list.component';
import { ContactFormComponent } from './component/addressManager/contact-form.component';
import { ContactDeleteComponent } from './component/addressManager/contact-delete.component';

// Staff Management (unified: Users + Collection Boys + Doctors)


// Patients
import { PatientsListComponent } from './component/patient/patients-list/patients-list.component';
import { AddPatientComponent } from './component/patient/add-patient/add-patient.component';
import { EditPatientComponent } from './component/patient/edit-patient/edit-patient.component';
import { StepperComponent } from './component/patient/stepper/stepper.component';

// Patient Tests
import { PatientTestListComponent } from './component/patient-test/patient-test-list/patient-test-list.component';
import { ViewTestComponent } from './component/patient-test/view-test/view-test.component';
import { EditTestComponent } from './component/patient-test/edit-test/edit-test.component';

// Lab Tests (Path Tests)
import { ManageTestsComponent } from './component/pathTest/manage-tests/manage-tests.component';
import { AddEditModalComponent } from './component/pathTest/add-edit-modal/add-edit-modal.component';

// Reports
import { SummaryReportContainerComponent } from './component/summary-report/summary-report-container.component';
import { RegisterReportsComponent } from './component/summary-report/reports/register-reports.component';
import { CollectionBoysWiseComponent } from './component/summary-report/reports/collection-boys-wise.component';
import { DiscountAuthorityWiseComponent } from './component/summary-report/reports/discount-authority-wise.component';
import { DoctorWiseCollectionComponent } from './component/summary-report/reports/doctor-wise-collection.component';
import { ReferrerCollectionComponent } from './component/summary-report/reports/referrer-collection.component';
import { MasterTestListComponent } from './component/summary-report/reports/master-test-list.component';
import { PanelCompanyWiseComponent } from './component/summary-report/reports/panel-company-wise.component';
import { PatientDiagnosisReportComponent } from './component/summary-report/reports/patient-diagnosis-report.component';
import { PatientHistoryWiseComponent } from './component/summary-report/reports/patient-history-wise.component';
import { PatientRegisterComponent } from './component/summary-report/reports/patient-register.component';
import { PndtTestReportComponent } from './component/summary-report/reports/pndt-test-report.component';
import { RateListComponent } from './component/summary-report/reports/rate-list.component';
import { ReceiptRegisterComponent } from './component/summary-report/reports/receipt-register.component';
import { RefundRegisterComponent } from './component/summary-report/reports/refund-register.component';
import { ReportingDoctorWiseComponent } from './component/summary-report/reports/reporting-doctor-wise.component';
import { TpaReportComponent } from './component/summary-report/reports/tpa-report.component';
import { WorksheetReportComponent } from './component/summary-report/reports/worksheet-report.component';
import { AddressManagerReportComponent } from './component/summary-report/reports/address-manager-report.component';

// Header / Account
import { ProfileComponent } from './component/header/profile/profile.component';
import { SettingsComponent } from './component/header/settings/settings.component';
import { ChangePasswordComponent } from './component/header/change-password/change-password.component';
import { SetupMfaComponent } from './component/header/setup-mfa/setup-mfa.component';

// Receipt
import { BillReceipt } from './component/receipt/bill-receipt';

// Licence Expired
import { LicenceExpiredComponent } from './component/pathology/licence-expired/licence-expired.component';
import { AddTestParameter } from './component/pathTest/add-test-parameter/add-test-parameter';

// Template
import { TemplateComponent } from './component/template/template.component';
import { ReportTemplateDesignerComponent } from './component/report-template-designer/report-template-designer.component';

// Lab Setup
import { LabSetupComponent } from './component/lab-setup/lab-setup.component';

// Lab Profile
import { LabProfileComponent } from './component/lab-profile/lab-profile.component';

// Extend Licence (public)
import { ExtendLicenseComponent } from './component/pathology/extend-license/extend-license.component';

// Attendance
import { AttendanceComponent } from './component/attendance/attendance.component';

// Salary
import { SalaryComponent } from './component/salary/salary.component';

// Holidays
import { HolidayComponent } from './component/holiday/holiday.component';

// Visit Schedule
import { VisitScheduleComponent } from './component/visit-schedule/visit-schedule.component';
import { MyVisitsComponent }      from './component/my-visits/my-visits.component';

// My Attendance (self-service read-only view for non-admin staff)
import { MyAttendanceComponent } from './component/my-attendance/my-attendance.component';

// Role guard
import { roleGuard } from './core/guards/role.guard';
import { Role } from './constant/enums';
import { pinExpiryGuard } from './core/guards/pin-expiry.guard';
import { ChangePinComponent } from './component/header/change-pin/change-pin.component';
import { RegisterPathologyComponent } from './component/pathology/register-pathology/register-pathology.component';
import { StaffManagementComponent } from './component/staff/staff-management.component';
import { StaffUnifiedFormComponent } from './component/staff/staff-unified-form.component';

export const routes: Routes = [
  // Public (no header)
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', title: 'Home', component: HomeComponent },
  { path: 'login', title: 'Login', component: LoginComponent },
  { path: 'login/callback', component: LoginComponent },
  { path: 'forgot-password', title: 'Forgot Password', component: ForgotPasswordComponent },
  { path: 'register-pathology', title: 'Register Pathology', component: RegisterPathologyComponent },
  { path: 'extend-license',     title: 'Extend Licence',     component: ExtendLicenseComponent, canActivate: [roleGuard(Role.Super_Admin.id)] },

  // Licence expired — accessible even when licence has expired (public, no layout header)
  { path: 'licence-expired', title: 'Licence Expired', component: LicenceExpiredComponent },

  // Authenticated (header shown via LayoutComponent)
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard, licenceGuard, pinExpiryGuard],
    children: [
      // Pathology dashboard — Admin / User / Assistant only
      { path: 'pathology', title: 'Pathology', component: PathologyHomeComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.User.id, Role.Assistant.id)] },

      // Address Manager — Admin+
      { path: 'contacts',              title: 'Address Manager', component: ContactListComponent,   canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'contacts/add',          title: 'Add Contact',     component: ContactFormComponent,   canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'contacts/edit/:id',     title: 'Edit Contact',    component: ContactFormComponent,   canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'contacts/delete/:id',   title: 'Delete Contact',  component: ContactDeleteComponent, canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },

      // Users — Admin+
      { path: 'users',          title: 'Staff Management', component: StaffManagementComponent,  canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'users/add',      title: 'Add Staff',        component: StaffUnifiedFormComponent, canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'users/edit/:id', title: 'Edit Staff',       component: StaffUnifiedFormComponent, canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },

      // Patients — all lab staff (not Doctor who just views reports)
      { path: 'patients',           title: 'Patients',   component: PatientsListComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.User.id, Role.Assistant.id, Role.Collection_Boy.id)] },
      { path: 'patients/add',       title: 'Add Patient',  component: AddPatientComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.User.id, Role.Assistant.id)] },
      { path: 'patients/stepper',   title: 'Add Patient',  component: StepperComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.User.id, Role.Assistant.id)] },
      { path: 'patients/edit/:id',  title: 'Edit Patient', component: EditPatientComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.User.id, Role.Assistant.id)] },

      // Patient Tests — all lab staff + Doctor (read-only for Doctor handled in component)
      { path: 'patient-tests',          title: 'Patient Tests', component: PatientTestListComponent },
      { path: 'patient-tests/view/:id', title: 'View Test',     component: ViewTestComponent },
      { path: 'patient-tests/edit/:id', title: 'Edit Test',     component: EditTestComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.User.id, Role.Assistant.id)] },

      // Lab Tests — Admin / User / Assistant
      { path: 'manage-tests',                    title: 'Manage Tests',      component: ManageTestsComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.User.id, Role.Assistant.id)] },
      { path: 'manage-tests/addTestParameter/:id', title: 'Add Test Parameter', component: AddTestParameter,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'manage-tests/edit/:id',           title: 'Edit Test',         component: AddEditModalComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },

      // Summary Reports — container shell with child routes rendered in its <router-outlet>
      {
        path: 'reports', component: SummaryReportContainerComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.Doctor.id)],
        children: [
          // Default redirect to patient-register when no child is specified
          { path: '', redirectTo: 'patient-register', pathMatch: 'full' },

          // Time-series chart report (uses BaseReportComponent)
          { path: 'patient-register',      title: 'Patient Register',         component: PatientRegisterComponent },

          // Tabular reports (use TableReportComponent)
          { path: 'referrer-collection',     title: 'Referrer Collection',       component: ReferrerCollectionComponent },
          // Legacy routes — redirect to merged report so old bookmarks still work
          { path: 'doctor-wise-collection',  redirectTo: 'referrer-collection' },
          { path: 'panel-company-wise',      redirectTo: 'referrer-collection' },
          { path: 'collection-boys-wise',    redirectTo: 'referrer-collection' },
          { path: 'reporting-doctor-wise',   title: 'Reporting Doctor Wise',     component: ReportingDoctorWiseComponent,
            canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.Doctor.id)] },
          { path: 'discount-authority-wise', title: 'Discount Authority Wise',   component: DiscountAuthorityWiseComponent },
          { path: 'patient-history-wise',    title: 'Patient History Wise',      component: PatientHistoryWiseComponent,
            canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.Doctor.id)] },
          { path: 'worksheet',               title: 'Worksheet Report',          component: WorksheetReportComponent },
          { path: 'register-reports',        title: 'Register Reports',          component: RegisterReportsComponent },
          { path: 'patient-diagnosis',       title: 'Patient Diagnosis Report',  component: PatientDiagnosisReportComponent,
            canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id, Role.Doctor.id)] },
          { path: 'pndt-test',               title: 'PNDT Test Report',          component: PndtTestReportComponent },
          { path: 'master-test-list',        title: 'Master Test List',          component: MasterTestListComponent },
          { path: 'rate-list',               title: 'Rate List',                 component: RateListComponent },
          { path: 'address-manager',         title: 'Address Manager Report',    component: AddressManagerReportComponent },
          { path: 'tpa-report',              title: 'TPA Report',                component: TpaReportComponent },
        ]
      },

      // Templates — Super Admin only
      { path: 'template',              title: 'Report Templates',  component: TemplateComponent,               canActivate: [roleGuard(Role.Super_Admin.id)] },
      { path: 'template-designer',     title: 'Template Designer', component: ReportTemplateDesignerComponent, canActivate: [roleGuard(Role.Super_Admin.id)] },
      { path: 'template-designer/:id', title: 'Template Designer', component: ReportTemplateDesignerComponent, canActivate: [roleGuard(Role.Super_Admin.id)] },

      // Lab Setup & Profile — Admin+
      { path: 'lab-setup',   title: 'Lab Setup',    component: LabSetupComponent,   canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'lab-profile', title: 'Lab Profile',  component: LabProfileComponent, canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },

      // Attendance / Salary / Holidays — Admin+
      { path: 'attendance', title: 'Attendance',        component: AttendanceComponent, canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'salary',     title: 'Salary',            component: SalaryComponent,     canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'holidays',   title: 'Holiday Calendar',  component: HolidayComponent,    canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },

      // Visit Schedule — Admin manages, all staff see their own
      { path: 'visit-schedule', title: 'Visit Schedule', component: VisitScheduleComponent,
        canActivate: [roleGuard(Role.Super_Admin.id, Role.Admin.id)] },
      { path: 'my-visits', title: 'My Visits Today', component: MyVisitsComponent },

      // My Attendance — read-only self-service view (doctors, collection boys, lab staff)
      { path: 'my-attendance', title: 'My Attendance', component: MyAttendanceComponent,
        canActivate: [roleGuard(Role.User.id, Role.Assistant.id, Role.Collection_Boy.id, Role.Doctor.id)] },

      // Account / Header pages
      { path: 'profile', title: 'Profile', component: ProfileComponent },
      { path: 'settings', title: 'Settings', component: SettingsComponent },
      { path: 'change-password', title: 'Change Password', component: ChangePasswordComponent },
      { path: 'setup-mfa', title: 'Authenticator App', component: SetupMfaComponent },
      // PIN change — also reachable as forced flow when PIN has expired (?reason=expired)
      { path: 'change-pin', title: 'Change PIN', component: ChangePinComponent },

      // Receipt
      { path: 'receipt/:id', title: 'Receipt', component: BillReceipt },
      { path: 'receipt', title: 'Receipt', component: BillReceipt, pathMatch: 'full' },
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
