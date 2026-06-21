import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-worksheet-report',
  template: '<app-table-report reportId="worksheetReport"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class WorksheetReportComponent {}
