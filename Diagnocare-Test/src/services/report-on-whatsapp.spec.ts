import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { PatientService } from 'src/app/services/patientServices/patient.service';
import { toWhatsAppNumber, isWhatsAppNumber } from 'src/app/utilities/whatsapp-number.util';
import { AddPatientTestDto } from 'src/app/models/patient/add-patient-test.dto';

/**
 * Per-booking "send report on WhatsApp": the shared number rule (kept in step
 * with the API's Helpers/WhatsAppNumber.cs) and the service calls that carry it.
 */
describe('Report on WhatsApp', () => {

  // ── Number rule ───────────────────────────────────────────────────────────

  describe('toWhatsAppNumber()', () => {
    it.each([
      ['9876543210',      '919876543210'],
      ['+91-9876543210',  '919876543210'],
      ['919876543210',    '919876543210'],
      ['09876543210',     '919876543210'],
      ['+44 7700 900123', '447700900123'],
    ])('accepts %s', (raw, expected) => {
      expect(toWhatsAppNumber(raw)).toBe(expected);
    });

    it.each([null, undefined, '', '   ', '12345', '98765432101', '+9112'])(
      'rejects %p', raw => {
        expect(isWhatsAppNumber(raw as any)).toBe(false);
      });
  });

  // ── Service ───────────────────────────────────────────────────────────────

  describe('PatientService', () => {
    let service:  PatientService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports:   [HttpClientTestingModule],
        providers: [PatientService],
      });
      service  = TestBed.inject(PatientService);
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('updateReportOnWhatsApp() sends PATCH ReportOnWhatsApp with the booking, flag and number', () => {
      service.updateReportOnWhatsApp(42, true, '9876543210').subscribe();

      const req = httpMock.expectOne(r => r.url.endsWith('ReportOnWhatsApp'));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ patientTestId: 42, reportOnWhatsApp: true, whatsAppNumber: '9876543210' });
      req.flush({ success: true });
    });

    it('updateReportOnWhatsApp() sends whatsAppNumber: null when no number is given', () => {
      service.updateReportOnWhatsApp(42, false).subscribe();

      const req = httpMock.expectOne(r => r.url.endsWith('ReportOnWhatsApp'));
      expect(req.request.body).toEqual({ patientTestId: 42, reportOnWhatsApp: false, whatsAppNumber: null });
      req.flush({ success: true });
    });

    it('addPatientTest() carries report_On_WhatsApp and the booking\'s whatsApp_Number in the payload', () => {
      const payload: AddPatientTestDto = {
        patientId: 'Pat1001',
        test: {
          test_Id: 'CBC', test_Name: 'CBC', urgent_Report: false, report_On_WhatsApp: true, whatsApp_Number: '9123456780',
          test_Amount: 300, referred_By_Type: 'Doctor', referred_By: 'Dr A', remark: '',
          collected_Outside: false, area: '', collected_By: '', sampling_Done_At: 'Lab',
        },
        receipt: {} as any,
      };

      service.addPatientTest(payload).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('AddTestWithReceipt'));
      expect(req.request.body.test.report_On_WhatsApp).toBe(true);
      expect(req.request.body.test.whatsApp_Number).toBe('9123456780');
      req.flush({ success: true });
    });
  });
});
