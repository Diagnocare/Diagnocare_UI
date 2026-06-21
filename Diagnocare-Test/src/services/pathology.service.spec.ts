import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { CommonService }    from 'src/app/shared/common.service';
import { MOCK_PATHOLOGY }   from '../mocks/mock-data';

const BASE = 'http://localhost:5000/api/pathology/';

function mockCommonService() {
  return { getPathologyId: jest.fn().mockReturnValue('1') };
}

describe('PathologyService', () => {
  let service:    PathologyService;
  let httpMock:   HttpTestingController;
  let commonSvc:  ReturnType<typeof mockCommonService>;

  beforeEach(() => {
    commonSvc = mockCommonService();

    TestBed.configureTestingModule({
      imports:   [HttpClientTestingModule],
      providers: [
        PathologyService,
        { provide: CommonService, useValue: commonSvc },
      ],
    });

    service  = TestBed.inject(PathologyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── getPathology ────────────────────────────────────────────────────────────

  describe('getPathology()', () => {
    it('sends GET to GetById endpoint', () => {
      service.getPathology().subscribe();

      const req = httpMock.expectOne(`${BASE}GetById`);
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_PATHOLOGY);
    });

    it('returns pathology details on success', (done) => {
      service.getPathology().subscribe(lab => {
        expect(lab.path_Name).toBe('City Lab');
        expect(lab.path_Branch).toBe('Main Branch');
        done();
      });

      httpMock.expectOne(`${BASE}GetById`).flush(MOCK_PATHOLOGY);
    });

    it('emits an error when the server fails', (done) => {
      service.getPathology().subscribe({
        error: err => { expect(err).toBeTruthy(); done(); },
      });

      httpMock
        .expectOne(`${BASE}GetById`)
        .flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
    });
  });

  // ── updatePathology ─────────────────────────────────────────────────────────

  describe('updatePathology()', () => {
    it('sends POST to Update endpoint', () => {
      const updated = { ...MOCK_PATHOLOGY, path_Name: 'New Lab Name' } as any;
      service.updatePathology(updated).subscribe();

      const req = httpMock.expectOne(`${BASE}Update`);
      expect(req.request.method).toBe('POST');
      req.flush(updated);
    });

    it('accepts FormData (multipart upload case)', () => {
      const formData = new FormData();
      formData.append('path_Name', 'Updated Lab');

      service.updatePathology(formData).subscribe();

      const req = httpMock.expectOne(`${BASE}Update`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeInstanceOf(FormData);
      req.flush(MOCK_PATHOLOGY);
    });

    it('returns the updated pathology object', (done) => {
      const updated = { ...MOCK_PATHOLOGY, path_Branch: 'Branch 2' } as any;

      service.updatePathology(updated).subscribe(result => {
        expect(result.path_Branch).toBe('Branch 2');
        done();
      });

      httpMock.expectOne(`${BASE}Update`).flush(updated);
    });

    it('propagates error on update failure', (done) => {
      service.updatePathology({} as any).subscribe({
        error: err => { expect(err).toBeTruthy(); done(); },
      });

      httpMock
        .expectOne(`${BASE}Update`)
        .flush(null, { status: 400, statusText: 'Bad Request' });
    });
  });

  // ── getPathologyExpiryDate ──────────────────────────────────────────────────

  describe('getPathologyExpiryDate()', () => {
    it('sends GET to GetPathologyExpiryDate', () => {
      service.getPathologyExpiryDate().subscribe();

      const req = httpMock.expectOne(`${BASE}GetPathologyExpiryDate`);
      expect(req.request.method).toBe('GET');
      req.flush({ expiryDate: '2025-12-31' });
    });

    it('returns the expiry date payload', (done) => {
      service.getPathologyExpiryDate().subscribe(result => {
        expect(result.expiryDate).toBe('2025-12-31');
        done();
      });

      httpMock
        .expectOne(`${BASE}GetPathologyExpiryDate`)
        .flush({ expiryDate: '2025-12-31' });
    });
  });

  // ── uploadFile ──────────────────────────────────────────────────────────────

  describe('uploadFile()', () => {
    it('sends POST to AddImage with JSON content type', () => {
      const file = { fileName: 'logo.png', fileAsBase64: 'base64data', fileType: 'image/png' } as any;
      service.uploadFile(file).subscribe();

      const req = httpMock.expectOne(`${BASE}AddImage`);
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      req.flush({ success: true });
    });
  });
});
