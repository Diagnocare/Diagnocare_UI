import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-bill-register',
  template: '<app-table-report reportId="billRegister"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class BillRegisterComponent {}
