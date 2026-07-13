import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PathologyService } from './pathology.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { apiEndpoints } from 'src/app/constant/constants';

describe('PathologyService — cache sync on update', () => {
  let service: PathologyService;
  let httpMock: HttpTestingController;
  let tokenService: TokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        PathologyService,
        TokenService,
      ],
    });
    service = TestBed.inject(PathologyService);
    httpMock = TestBed.inject(HttpTestingController);
    tokenService = TestBed.inject(TokenService);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('updateGraceBuffer caches the new value only after the PUT succeeds', () => {
    service.updateGraceBuffer(25).subscribe();

    const req = httpMock.expectOne(
      r => r.method === 'PUT' && r.url.includes(apiEndpoints.updateGraceBuffer)
    );
    expect(tokenService.hasCachedPolicies()).toBeFalse(); // not cached before response
    req.flush({});

    expect(tokenService.getGraceBufferMinutes()).toBe(25);
  });

  it('updateGraceBuffer does NOT cache the value if the request fails', () => {
    service.updateGraceBuffer(25).subscribe({ error: () => {} });

    const req = httpMock.expectOne(
      r => r.method === 'PUT' && r.url.includes(apiEndpoints.updateGraceBuffer)
    );
    req.flush('error', { status: 500, statusText: 'Server Error' });

    expect(tokenService.hasCachedPolicies()).toBeFalse();
  });

  it('updateMaxDiscount caches the new value after success', () => {
    service.updateMaxDiscount(35).subscribe();

    const req = httpMock.expectOne(
      r => r.method === 'PUT' && r.url.includes(apiEndpoints.updateMaxDiscount)
    );
    req.flush({});

    expect(tokenService.getMaxDiscountPercent()).toBe(35);
  });

  it('updateSessionLockout caches the new value after success', () => {
    service.updateSessionLockout(45).subscribe();

    const req = httpMock.expectOne(
      r => r.method === 'PUT' && r.url.includes(apiEndpoints.updateSessionLockout)
    );
    req.flush({});

    expect(tokenService.getSessionLockoutMinutes()).toBe(45);
  });
});
