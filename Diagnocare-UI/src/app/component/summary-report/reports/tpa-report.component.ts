import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-tpa-report',
  template: '<app-table-report reportId="tpaReport"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class TpaReportComponent {}
