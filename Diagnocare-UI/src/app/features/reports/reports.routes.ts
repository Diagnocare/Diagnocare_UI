import { Routes } from '@angular/router';

export const summaryReportRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/summary-report-container/summary-report-container.component').then(m => m.SummaryReportContainerComponent),
    children: [
      { path: 'patientRegister',   loadComponent: () => import('./pages/patient-register.component').then(m => m.PatientRegisterComponent) },
      { path: 'referrerCollection', loadComponent: () => import('./pages/referrer-collection.component').then(m => m.ReferrerCollectionComponent) },
      // Legacy routes kept so existing bookmarks/direct-links still work
      { path: 'doctorWiseCollection', redirectTo: 'referrerCollection', pathMatch: 'full' },
      { path: 'panelCompanyWise',     redirectTo: 'referrerCollection', pathMatch: 'full' },
      { path: 'collectionBoysWise',   redirectTo: 'referrerCollection', pathMatch: 'full' },
      { path: 'discountAuthorityWise', loadComponent: () => import('./pages/discount-authority-wise.component').then(m => m.DiscountAuthorityWiseComponent) },
      { path: 'patientHistoryWise', loadComponent: () => import('./pages/patient-history-wise.component').then(m => m.PatientHistoryWiseComponent) },
      { path: 'worksheetReport', loadComponent: () => import('./pages/worksheet-report.component').then(m => m.WorksheetReportComponent) },
      { path: 'registerReports', loadComponent: () => import('./pages/register-reports.component').then(m => m.RegisterReportsComponent) },
      { path: 'patientDiagnosisReport', loadComponent: () => import('./pages/patient-diagnosis-report.component').then(m => m.PatientDiagnosisReportComponent) },
      { path: 'pndtTestReport', loadComponent: () => import('./pages/pndt-test-report.component').then(m => m.PndtTestReportComponent) },
      { path: 'masterTestList', loadComponent: () => import('./pages/master-test-list.component').then(m => m.MasterTestListComponent) },
      // Rate List was folded into Master Test List, which lists every catalogue test
      // with its rate at the Test level. Redirect kept so existing links still land.
      { path: 'rateList', redirectTo: 'masterTestList', pathMatch: 'full' },
      { path: 'addressManagerReport', loadComponent: () => import('./pages/address-manager-report.component').then(m => m.AddressManagerReportComponent) },
      { path: 'tpaReport', loadComponent: () => import('./pages/tpa-report.component').then(m => m.TpaReportComponent) },
      { path: '', redirectTo: 'patientRegister', pathMatch: 'full' }
    ]
  }
];
