import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-refund-register',
  template: '<app-table-report reportId="refundRegister"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class RefundRegisterComponent {}
