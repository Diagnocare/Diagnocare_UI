import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-collection-boys-wise',
  template: '<app-table-report reportId="collectionBoysWise"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class CollectionBoysWiseComponent {}
