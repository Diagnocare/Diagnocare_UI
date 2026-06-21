import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-patient-diagnosis-report',
  template: '<app-table-report reportId="patientDiagnosisReport"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class PatientDiagnosisReportComponent {}
