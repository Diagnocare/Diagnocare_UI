import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-master-test-list',
  // Static catalogue — no date filter required (TableReportComponent omits date body automatically)
  template: '<app-table-report reportId="masterTestList"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class MasterTestListComponent {}
