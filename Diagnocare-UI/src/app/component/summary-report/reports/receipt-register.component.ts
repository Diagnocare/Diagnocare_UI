import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-receipt-register',
  template: '<app-table-report reportId="receiptRegister"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class ReceiptRegisterComponent {}
