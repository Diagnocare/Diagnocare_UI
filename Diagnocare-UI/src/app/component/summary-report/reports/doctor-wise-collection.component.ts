import { Component } from '@angular/core';
import { TableReportComponent } from '../table-report/table-report.component';

@Component({
  selector: 'app-doctor-wise-collection',
  template: '<app-table-report reportId="doctorWiseCollection"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class DoctorWiseCollectionComponent {}
