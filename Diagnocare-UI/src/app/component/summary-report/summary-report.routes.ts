import { Routes } from '@angular/router';

export const summaryReportRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./summary-report-container.component').then(m => m.SummaryReportContainerComponent),
    children: [
      { path: 'patientRegister',   loadComponent: () => import('./reports/patient-register.component').then(m => m.PatientRegisterComponent) },
      { path: 'referrerCollection', loadComponent: () => import('./reports/referrer-collection.component').then(m => m.ReferrerCollectionComponent) },
      // Legacy routes kept so existing bookmarks/direct-links still work
      { path: 'doctorWiseCollection', redirectTo: 'referrerCollection', pathMatch: 'full' },
      { path: 'panelCompanyWise',     redirectTo: 'referrerCollection', pathMatch: 'full' },
      { path: 'collectionBoysWise',   redirectTo: 'referrerCollection', pathMatch: 'full' },
      { path: 'discountAuthorityWise', loadComponent: () => import('./reports/discount-authority-wise.component').then(m => m.DiscountAuthorityWiseComponent) },
      { path: 'patientHistoryWise', loadComponent: () => import('./reports/patient-history-wise.component').then(m => m.PatientHistoryWiseComponent) },
      { path: 'worksheetReport', loadComponent: () => import('./reports/worksheet-report.component').then(m => m.WorksheetReportComponent) },
      { path: 'registerReports', loadComponent: () => import('./reports/register-reports.component').then(m => m.RegisterReportsComponent) },
      { path: 'patientDiagnosisReport', loadComponent: () => import('./reports/patient-diagnosis-report.component').then(m => m.PatientDiagnosisReportComponent) },
      { path: 'pndtTestReport', loadComponent: () => import('./reports/pndt-test-report.component').then(m => m.PndtTestReportComponent) },
      { path: 'masterTestList', loadComponent: () => import('./reports/master-test-list.component').then(m => m.MasterTestListComponent) },
      { path: 'rateList', loadComponent: () => import('./reports/rate-list.component').then(m => m.RateListComponent) },
      { path: 'addressManagerReport', loadComponent: () => import('./reports/address-manager-report.component').then(m => m.AddressManagerReportComponent) },
      { path: 'tpaReport', loadComponent: () => import('./reports/tpa-report.component').then(m => m.TpaReportComponent) },
      { path: '', redirectTo: 'patientRegister', pathMatch: 'full' }
    ]
  }
];
