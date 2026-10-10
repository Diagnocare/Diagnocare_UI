import { TestBed }                                         from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController }   from '@angular/common/http/testing';

import { ReportPrintStatusService } from 'src/app/services/patientTestReportServices/report-print-status.service';
import {
  ReportPrintStatusDto,
  SMART_REPORT_TEST_CODE,
} from 'src/app/models/report-print-status/report-print-status.model';

/**
 * Recording that a report went out on WhatsApp.
 *
 * The send itself happens inside WhatsApp, on another origin, so nothing here can
 * observe it — the operator confirms it and the app writes the status. These cover
 * the call that writes it and the status the booking summary reads back.
 */
describe('Report sent on WhatsApp', () => {
  let service:  ReportPrintStatusService;
  let httpMock: HttpTestingController;

  const sentStatus = (over: Partial<ReportPrintStatusDto> = {}): ReportPrintStatusDto => ({
    testRegId:         42,
    testCode:          'CBC',
    isPrinted:         false,
    printedAt:         null,
    printedBy:         null,
    sentOnWhatsApp:    true,
    whatsAppSentAt:    '2026-10-05T20:30:00',
    whatsAppSentCount: 1,
    whatsAppSentTo:    '919876543210',
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports:   [HttpClientTestingModule],
      providers: [ReportPrintStatusService],
    });
    service  = TestBed.inject(ReportPrintStatusService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('markSentOnWhatsApp() PUTs the booking, test code and number', () => {
    service.markSentOnWhatsApp({
      testRegId: 42, testCode: 'CBC', whatsAppNumber: '919876543210',
    }).subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('MarkSentOnWhatsApp'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      testRegId: 42, testCode: 'CBC', whatsAppNumber: '919876543210',
    });
    req.flush(sentStatus());
  });

  it('markSentOnWhatsApp() returns the updated delivery status', () => {
    let got: ReportPrintStatusDto | undefined;
    service.markSentOnWhatsApp({ testRegId: 42, testCode: 'CBC' }).subscribe(s => (got = s));

    httpMock.expectOne(r => r.url.endsWith('MarkSentOnWhatsApp')).flush(sentStatus());

    expect(got?.sentOnWhatsApp).toBe(true);
    expect(got?.whatsAppSentCount).toBe(1);
    expect(got?.whatsAppSentTo).toBe('919876543210');
    // Going out on WhatsApp says nothing about paper.
    expect(got?.isPrinted).toBe(false);
  });

  it('a repeat send comes back as one row with a higher count, not a second row', () => {
    let got: ReportPrintStatusDto | undefined;
    service.markSentOnWhatsApp({ testRegId: 42, testCode: 'CBC' }).subscribe(s => (got = s));

    httpMock.expectOne(r => r.url.endsWith('MarkSentOnWhatsApp')).flush(sentStatus({ whatsAppSentCount: 3 }));

    expect(got?.whatsAppSentCount).toBe(3);
    expect(got?.sentOnWhatsApp).toBe(true);
  });

  it('the Smart Report is recorded under its reserved code', () => {
    service.markSentOnWhatsApp({
      testRegId: 42, testCode: SMART_REPORT_TEST_CODE, whatsAppNumber: '919876543210',
    }).subscribe();

    const req = httpMock.expectOne(r => r.url.endsWith('MarkSentOnWhatsApp'));
    expect(req.request.body.testCode).toBe('INSIGHTS');
    req.flush(sentStatus({ testCode: 'INSIGHTS' }));
  });

  it('getBookingSummary() carries the WhatsApp flags for every report on the booking', () => {
    let rows: ReportPrintStatusDto[] = [];
    service.getBookingSummary(42).subscribe(r => (rows = r));

    httpMock.expectOne(r => r.url.includes('GetPrintStatuses')).flush([
      sentStatus(),
      sentStatus({ testCode: 'LFT', sentOnWhatsApp: false, whatsAppSentAt: null, whatsAppSentCount: 0, whatsAppSentTo: null }),
    ]);

    expect(rows.find(r => r.testCode === 'CBC')?.sentOnWhatsApp).toBe(true);
    expect(rows.find(r => r.testCode === 'LFT')?.sentOnWhatsApp).toBe(false);
  });
});
