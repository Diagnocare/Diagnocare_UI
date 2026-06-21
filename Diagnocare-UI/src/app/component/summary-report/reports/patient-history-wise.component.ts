import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-patient-history-wise',
  // TableReportComponent auto-flattens the nested tests[] array into one row per test.
  template: '<app-table-report reportId="patientHistoryWise"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class PatientHistoryWiseComponent {}
