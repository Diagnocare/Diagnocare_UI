import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-reporting-doctor-wise',
  template: '<app-table-report reportId="reportingDoctorWise"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class ReportingDoctorWiseComponent {}
