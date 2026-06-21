import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-rate-list',
  template: '<app-table-report reportId="rateList"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class RateListComponent {}
