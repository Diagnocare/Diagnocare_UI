import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-address-manager-report',
  template: '<app-table-report reportId="addressManagerReport"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class AddressManagerReportComponent {}
