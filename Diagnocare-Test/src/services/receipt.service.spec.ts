import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { ReceiptService } from 'src/app/services/receiptServices/receipt.service';
import { MOCK_RECEIPTS_SAME_TEST, MOCK_RECEIPT_FULLY_PAID } from '../mocks/mock-data';

const BASE = 'http://localhost:5000/api/receipt/';

describe('ReceiptService', () => {
  let service:  ReceiptService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports:   [HttpClientTestingModule],
      providers: [ReceiptService],
    });

    service  = TestBed.inject(ReceiptService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── getReceiptList ──────────────────────────────────────────────────────────

  describe('getReceiptList()', () => {
    it('sends GET to GetAllList with searchValue encoded', () => {
      service.getReceiptList('P-001').subscribe();

      const req = httpMock.expectOne(`${BASE}GetAllList?searchValue=P-001`);
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_RECEIPTS_SAME_TEST);
    });

    it('encodes special characters in searchValue', () => {
      service.getReceiptList('P 001').subscribe();

      const req = httpMock.expectOne(`${BASE}GetAllList?searchValue=P%20001`);
      req.flush([]);
    });

    it('returns an array of receipts on success', (done) => {
      service.getReceiptList('P-001').subscribe(receipts => {
        expect(receipts.length).toBe(2);
        expect(receipts[0].patientTestId).toBe(101);
        done();
      });

      httpMock
        .expectOne(`${BASE}GetAllList?searchValue=P-001`)
        .flush(MOCK_RECEIPTS_SAME_TEST);
    });

    it('emits an error with a descriptive message on server failure', (done) => {
      service.getReceiptList('P-001').subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('API error');
          expect(err.message).toContain('500');
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}GetAllList?searchValue=P-001`)
        .flush({ message: 'Internal Server Error' }, { status: 500, statusText: 'Server Error' });
    });

    it('handles 404 and includes status in error message', (done) => {
      service.getReceiptList('UNKNOWN').subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('404');
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}GetAllList?searchValue=UNKNOWN`)
        .flush(null, { status: 404, statusText: 'Not Found' });
    });
  });

  // ── getReceiptCount ─────────────────────────────────────────────────────────

  describe('getReceiptCount()', () => {
    it('sends GET to GetReceiptCount with searchValue', () => {
      service.getReceiptCount('P-001').subscribe();

      const req = httpMock.expectOne(`${BASE}GetReceiptCount?searchValue=P-001`);
      expect(req.request.method).toBe('GET');
      req.flush({ searchTerm: 'P-001', receiptCount: 2 });
    });

    it('returns the receipt count object', (done) => {
      service.getReceiptCount('P-001').subscribe(result => {
        expect(result.receiptCount).toBe(5);
        expect(result.searchTerm).toBe('P-001');
        done();
      });

      httpMock
        .expectOne(`${BASE}GetReceiptCount?searchValue=P-001`)
        .flush({ searchTerm: 'P-001', receiptCount: 5 });
    });
  });

  // ── getReceiptById ──────────────────────────────────────────────────────────

  describe('getReceiptById()', () => {
    it('sends GET to GetById with receiptId', () => {
      service.getReceiptById(42).subscribe();

      const req = httpMock.expectOne(`${BASE}GetById?receiptId=42`);
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_RECEIPT_FULLY_PAID);
    });

    it('returns the single receipt on success', (done) => {
      service.getReceiptById(10).subscribe(receipt => {
        expect(receipt.receiptId).toBe(10);
        expect(receipt.amountPaid).toBe(750);
        done();
      });

      httpMock
        .expectOne(`${BASE}GetById?receiptId=10`)
        .flush(MOCK_RECEIPT_FULLY_PAID);
    });

    it('propagates error when receipt not found', (done) => {
      service.getReceiptById(9999).subscribe({
        error: err => { expect(err).toBeTruthy(); done(); },
      });

      httpMock
        .expectOne(`${BASE}GetById?receiptId=9999`)
        .flush(null, { status: 404, statusText: 'Not Found' });
    });
  });

  // ── addReceipt ──────────────────────────────────────────────────────────────

  describe('addReceipt()', () => {
    const payload = {
      patientTestId:  101,
      testAmount:     1000,
      netAmount:      950,
      discount:       50,
      paymentType:    'Full',
      paymentMode:    'Cash',
      amountPaid:     950,
      amountPending:  0,
      paymentStatus:  'Paid',
    } as any;

    it('sends POST to Add with the receipt dto', () => {
      service.addReceipt(payload).subscribe();

      const req = httpMock.expectOne(`${BASE}Add`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.patientTestId).toBe(101);
      expect(req.request.body.amountPaid).toBe(950);
      req.flush({ success: true, receiptId: 55 });
    });

    it('returns the server response on success', (done) => {
      service.addReceipt(payload).subscribe(res => {
        expect(res.receiptId).toBe(55);
        done();
      });

      httpMock.expectOne(`${BASE}Add`).flush({ success: true, receiptId: 55 });
    });

    it('emits error when server rejects the payload', (done) => {
      service.addReceipt(payload).subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('API error');
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}Add`)
        .flush({ message: 'Validation failed' }, { status: 400, statusText: 'Bad Request' });
    });
  });
});
