import { Component } from '@angular/core';
import { BaseReportComponent } from '../base-report/base-report.component';
import { reportConfigs } from 'src/app/constant/constants';
import { ReportConfig } from 'src/app/models/summaryReport/summaryReportModel';

@Component({
  selector: 'app-patient-register',
  template: '<app-base-report [reportConfig]="config"></app-base-report>',
  standalone: true,
  imports: [BaseReportComponent]
})
export class PatientRegisterComponent {
  config: ReportConfig = reportConfigs['patientRegister'];
}
