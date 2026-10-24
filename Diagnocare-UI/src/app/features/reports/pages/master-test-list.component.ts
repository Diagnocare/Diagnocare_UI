import { Component } from '@angular/core';
import { TableReportComponent } from '../components/table-report/table-report.component';

@Component({
  selector: 'app-master-test-list',
  // Collection summary over the test catalogue, not the catalogue itself: the chart
  // panel's "View by" selector picks the level it is rolled up to — group, sub-group
  // or test — and Year / Period scope the collection. Configured by reportConfigs
  // ('masterTestList'); the flat catalogue is still available as a CSV export.
  template: '<app-table-report reportId="masterTestList"></app-table-report>',
  standalone: true,
  imports: [TableReportComponent]
})
export class MasterTestListComponent {}
