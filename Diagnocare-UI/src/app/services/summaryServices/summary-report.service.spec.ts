import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SummaryReportService } from './summary-report.service';
import { summaryReportApiEndpoints } from 'src/app/constant/constants';

/**
 * The request body a table report sends. The Master Test List report is the one that
 * carries a level of aggregation, so GroupBy has to reach the API — without it the
 * backend defaults to group and the "View by" selector would appear to do nothing.
 */
describe('SummaryReportService — table report request body', () => {
  let service: SummaryReportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SummaryReportService,
      ],
    });
    service = TestBed.inject(SummaryReportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends the grouping level and the period for masterTestList', () => {
    service.getTableReport('masterTestList', { period: 'month', groupBy: 'subgroup' }).subscribe();

    const req = httpMock.expectOne(
      r => r.method === 'POST' && r.url.includes(summaryReportApiEndpoints['masterTestList'])
    );
    expect(req.request.body.GroupBy).toBe('subgroup');
    expect(req.request.body.Period).toBe('month');
    req.flush({ data: [], groupBy: 'subgroup', levelLabel: 'Sub Group' });
  });

  it('posts masterTestList to the hierarchy endpoint, not the flat catalogue', () => {
    service.getTableReport('masterTestList', { groupBy: 'test' }).subscribe();

    const req = httpMock.expectOne(r => r.method === 'POST' && r.body.GroupBy === 'test');
    expect(req.request.url).toContain('master-test-collection');
    req.flush({ data: [] });
  });

  it('sends the selected year instead of a date range', () => {
    service.getTableReport('masterTestList', { year: '2025', period: 'month', groupBy: 'group' }).subscribe();

    const req = httpMock.expectOne(r => r.method === 'POST');
    expect(req.request.body.Year).toBe(2025);
    expect(req.request.body.FromDate).toBeUndefined();
    req.flush({ data: [] });
  });

  it('sends the period for the address manager directory', () => {
    service.getTableReport('addressManagerReport', { period: 'month' }).subscribe();

    const req = httpMock.expectOne(
      r => r.method === 'POST' && r.url.includes(summaryReportApiEndpoints['addressManagerReport'])
    );
    expect(req.request.body.Period).toBe('month');
    req.flush({ data: [] });
  });

  it('leaves GroupBy off reports that have no levels', () => {
    service.getTableReport('billRegister', { period: 'month' }).subscribe();

    const req = httpMock.expectOne(
      r => r.method === 'POST' && r.url.includes(summaryReportApiEndpoints['billRegister'])
    );
    expect(req.request.body.GroupBy).toBeUndefined();
    req.flush({ data: [] });
  });
});
