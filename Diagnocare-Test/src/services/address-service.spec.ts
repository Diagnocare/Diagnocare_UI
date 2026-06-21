import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { AddressService } from 'src/app/services/addressServices/address-service';

const BASE = 'http://localhost:5000/api/addressManager/';

describe('AddressService', () => {
  let service:  AddressService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports:   [HttpClientTestingModule],
      providers: [AddressService],
    });

    service  = TestBed.inject(AddressService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── getStateCityList ────────────────────────────────────────────────────────

  describe('getStateCityList()', () => {
    it('sends GET to GetAllStateCityList', () => {
      service.getStateCityList().subscribe();

      const req = httpMock.expectOne(`${BASE}GetAllStateCityList`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('returns an array of state/city strings on success', (done) => {
      const mockData = ['Maharashtra', 'Mumbai', 'Gujarat', 'Ahmedabad'];

      service.getStateCityList().subscribe(result => {
        expect(result).toEqual(mockData);
        expect(result.length).toBe(4);
        done();
      });

      httpMock.expectOne(`${BASE}GetAllStateCityList`).flush(mockData);
    });

    it('returns an empty array when API returns empty list', (done) => {
      service.getStateCityList().subscribe(result => {
        expect(result).toEqual([]);
        done();
      });

      httpMock.expectOne(`${BASE}GetAllStateCityList`).flush([]);
    });

    it('propagates errors on server failure', (done) => {
      service.getStateCityList().subscribe({
        error: err => {
          expect(err).toBeTruthy();
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}GetAllStateCityList`)
        .flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
    });

    it('propagates errors on network failure (404)', (done) => {
      service.getStateCityList().subscribe({
        error: err => {
          expect(err).toBeTruthy();
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}GetAllStateCityList`)
        .flush(null, { status: 404, statusText: 'Not Found' });
    });
  });
});
