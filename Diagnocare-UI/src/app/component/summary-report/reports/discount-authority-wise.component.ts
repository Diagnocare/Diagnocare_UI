import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-discount-authority-wise',
  template: '<app-table-report reportId="discountAuthorityWise"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class DiscountAuthorityWiseComponent {}
