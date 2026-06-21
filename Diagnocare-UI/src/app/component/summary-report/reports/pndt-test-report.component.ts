import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-pndt-test-report',
  template: '<app-table-report reportId="pndtTestReport"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class PndtTestReportComponent {}
