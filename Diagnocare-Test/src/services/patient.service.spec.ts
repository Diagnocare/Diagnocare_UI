import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { PatientService } from 'src/app/services/patientServices/patient.service';
import {
  MOCK_PATIENT_ID, MOCK_PATIENT_EDIT,
  MOCK_KEY_VALUE_PAIR, MOCK_SEARCH_RESULT,
} from '../mocks/mock-data';

const BASE = 'http://localhost:5000/api/patient/';

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

  // ── getDialingCode ──────────────────────────────────────────────────────────

  describe('getDialingCode()', () => {
    it('returns +91 without making an HTTP call', (done) => {
      service.getDialingCode().subscribe(code => {
        expect(code).toBe('+91');
        done();
      });
      // No HTTP request expected
      httpMock.expectNone(() => true);
    });
  });

  // ── getPatientById ──────────────────────────────────────────────────────────

  describe('getPatientById()', () => {
    it('sends GET with the patientId query param', () => {
      service.getPatientById(MOCK_PATIENT_ID).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('GetById') &&
        r.params.get('patientId') === MOCK_PATIENT_ID
      );
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_PATIENT_EDIT);
    });

    it('returns patient data on success', (done) => {
      service.getPatientById(MOCK_PATIENT_ID).subscribe(p => {
        expect(p.patient_Name).toBe('Mr. Test Patient');
        done();
      });

      httpMock.expectOne(r => r.url.includes('GetById')).flush(MOCK_PATIENT_EDIT);
    });

    it('encodes special characters in patientId', () => {
      service.getPatientById('P 001').subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('GetById') && r.url.includes('P%20001')
      );
      req.flush(MOCK_PATIENT_EDIT);
    });

    it('propagates errors', (done) => {
      service.getPatientById('BAD').subscribe({
        error: err => { expect(err).toBeTruthy(); done(); },
      });

      httpMock
        .expectOne(r => r.url.includes('GetById'))
        .flush('Not Found', { status: 404, statusText: 'Not Found' });
    });
  });

  // ── getSerialNPatientId ─────────────────────────────────────────────────────

  describe('getSerialNPatientId()', () => {
    it('sends GET to GetSerialNPatientId', () => {
      service.getSerialNPatientId().subscribe();

      const req = httpMock.expectOne(`${BASE}GetSerialNPatientId`);
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_KEY_VALUE_PAIR);
    });

    it('returns key-value pair', (done) => {
      service.getSerialNPatientId().subscribe(kv => {
        expect(kv.key).toBe('1');
        expect(kv.value).toBe('P-001');
        done();
      });

      httpMock.expectOne(`${BASE}GetSerialNPatientId`).flush(MOCK_KEY_VALUE_PAIR);
    });
  });

  // ── AddPatient ──────────────────────────────────────────────────────────────

  describe('AddPatient()', () => {
    it('sends POST to Add endpoint', () => {
      const payload = { patient_Name: 'Mr. New' } as any;
      service.AddPatient(payload).subscribe();

      const req = httpMock.expectOne(`${BASE}Add`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.patient_Name).toBe('Mr. New');
      req.flush(payload);
    });

    it('returns the created patient on success', (done) => {
      const payload = { patient_Id: 'P-999', patient_Name: 'Mrs. New' } as any;

      service.AddPatient(payload).subscribe(result => {
        expect(result.patient_Id).toBe('P-999');
        done();
      });

      httpMock.expectOne(`${BASE}Add`).flush(payload);
    });
  });

  // ── addPatientTest ──────────────────────────────────────────────────────────

  describe('addPatientTest()', () => {
    it('sends POST to AddTestWithReceipt with the dto', () => {
      const dto = { patientId: 'P-001', test: {}, receipt: {} } as any;
      service.addPatientTest(dto).subscribe();

      const req = httpMock.expectOne(`${BASE}AddTestWithReceipt`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.patientId).toBe('P-001');
      req.flush({ success: true });
    });
  });

  // ── updatePatientDetails ────────────────────────────────────────────────────

  describe('updatePatientDetails()', () => {
    it('sends POST to Update', () => {
      service.updatePatientDetails(MOCK_PATIENT_EDIT as any).subscribe();

      const req = httpMock.expectOne(`${BASE}Update`);
      expect(req.request.method).toBe('POST');
      req.flush(true);
    });
  });

  // ── deletePatientDetails ────────────────────────────────────────────────────

  describe('deletePatientDetails()', () => {
    it('sends DELETE with patientId query param', () => {
      service.deletePatientDetails('P-001').subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('Delete') && r.url.includes('patientId=P-001')
      );
      expect(req.request.method).toBe('DELETE');
      req.flush(true);
    });
  });

  // ── searchPatients ──────────────────────────────────────────────────────────

  describe('searchPatients()', () => {
    it('builds the URL with required search params', () => {
      service.searchPatients('John', 1, 10).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('SearchPatients') &&
        r.url.includes('searchTerm=John') &&
        r.url.includes('pageNumber=1') &&
        r.url.includes('pageSize=10')
      );
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_SEARCH_RESULT);
    });

    it('appends dateFrom and dateTo when provided', () => {
      service.searchPatients('John', 1, 10, '2024-01-01', '2024-01-31').subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('dateFrom=2024-01-01') &&
        r.url.includes('dateTo=2024-01-31')
      );
      req.flush(MOCK_SEARCH_RESULT);
    });

    it('appends status filter when provided', () => {
      service.searchPatients('', 1, 10, undefined, undefined, 'Pending').subscribe();

      const req = httpMock.expectOne(r => r.url.includes('status=Pending'));
      req.flush(MOCK_SEARCH_RESULT);
    });

    it('does NOT append dateFrom when omitted', () => {
      service.searchPatients('test', 1, 5).subscribe();

      const req = httpMock.expectOne(r => r.url.includes('SearchPatients'));
      expect(req.request.urlWithParams).not.toContain('dateFrom');
      req.flush(MOCK_SEARCH_RESULT);
    });
  });

  // ── getDistinctReferredBy ───────────────────────────────────────────────────

  describe('getDistinctReferredBy()', () => {
    const url = (type: string) =>
      `${BASE}GetDistinctReferredBy?referred_By_Type=${type}`;

    it('passes referred_By_Type in the query string', () => {
      service.getDistinctReferredBy('Doctor').subscribe();

      const req = httpMock.expectOne(url('Doctor'));
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('normalises an array of plain strings', (done) => {
      service.getDistinctReferredBy('Doctor').subscribe(result => {
        expect(result).toEqual(['Dr. A', 'Dr. B']);
        done();
      });

      httpMock.expectOne(url('Doctor')).flush(['Dr. A', 'Dr. B']);
    });

    it('normalises array of objects with referred_By field', (done) => {
      const raw = [{ referred_By: 'Dr. X' }, { referred_By: 'Dr. Y' }];

      service.getDistinctReferredBy('Doctor').subscribe(result => {
        expect(result).toEqual(['Dr. X', 'Dr. Y']);
        done();
      });

      httpMock.expectOne(url('Doctor')).flush(raw);
    });

    it('normalises array of objects with referredBy (camelCase) field', (done) => {
      const raw = [{ referredBy: 'Dr. Z' }];

      service.getDistinctReferredBy('Doctor').subscribe(result => {
        expect(result).toEqual(['Dr. Z']);
        done();
      });

      httpMock.expectOne(url('Doctor')).flush(raw);
    });

    it('removes duplicate entries', (done) => {
      service.getDistinctReferredBy('Doctor').subscribe(result => {
        expect(result).toEqual(['Dr. A']);       // deduplicated
        done();
      });

      httpMock.expectOne(url('Doctor')).flush(['Dr. A', 'Dr. A', 'Dr. A']);
    });

    it('trims whitespace from entries', (done) => {
      service.getDistinctReferredBy('Doctor').subscribe(result => {
        expect(result).toEqual(['Dr. A', 'Dr. B']);
        done();
      });

      httpMock.expectOne(url('Doctor')).flush(['  Dr. A  ', ' Dr. B ']);
    });

    it('filters out empty / falsy entries', (done) => {
      service.getDistinctReferredBy('Doctor').subscribe(result => {
        expect(result).toEqual(['Dr. A']);
        done();
      });

      httpMock.expectOne(url('Doctor')).flush(['Dr. A', '', '  ', null]);
    });

    it('returns an empty array when the API returns an empty list', (done) => {
      service.getDistinctReferredBy('Doctor').subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      httpMock.expectOne(url('Doctor')).flush([]);
    });
  });
});
