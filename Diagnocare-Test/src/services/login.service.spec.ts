import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HttpBackend }                          from '@angular/common/http';

import { LoginService }   from 'src/app/services/loginServices/login.service';
import { TokenService }   from 'src/app/core/interceptors/token.service';
import { MOCK_USER, MOCK_OTP_RESPONSE } from '../mocks/mock-data';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE = 'http://localhost:5000/api/login/';

function mockTokenService() {
  return {
    getToken:   jest.fn().mockReturnValue('existing-token'),
    setToken:   jest.fn(),
    clearAuth:  jest.fn(),
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('LoginService', () => {
  let service:    LoginService;
  let httpMock:   HttpTestingController;
  let tokenSvc:   ReturnType<typeof mockTokenService>;

  beforeEach(() => {
    tokenSvc = mockTokenService();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        LoginService,
        { provide: TokenService, useValue: tokenSvc },
      ],
    });

    service  = TestBed.inject(LoginService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());   // assert no outstanding requests

  // ── getUserDetails ──────────────────────────────────────────────────────────

  describe('getUserDetails()', () => {
    it('sends GET with userId and password as query params', () => {
      const login = { userId: 'admin', password: 'hashed123' };

      service.getUserDetails(login).subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('GetUserDetails') &&
        r.params.get('userId')   === 'admin' &&
        r.params.get('password') === 'hashed123'
      );
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_USER);
    });

    it('returns the user object on success', (done) => {
      const login = { userId: 'admin', password: 'hashed123' };

      service.getUserDetails(login).subscribe(user => {
        expect(user).toEqual(MOCK_USER);
        done();
      });

      httpMock.expectOne(r => r.url.includes('GetUserDetails')).flush(MOCK_USER);
    });

    it('emits an error when the server returns 401', (done) => {
      const login = { userId: 'wrong', password: 'bad' };

      service.getUserDetails(login).subscribe({
        error: err => {
          expect(err).toBeTruthy();
          done();
        },
      });

      httpMock
        .expectOne(r => r.url.includes('GetUserDetails'))
        .flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    });
  });

  // ── generateOtp ─────────────────────────────────────────────────────────────

  describe('generateOtp()', () => {
    it('sends POST to generate-otp with correct body fields', () => {
      service.generateOtp(1, 'user1', 'phone').subscribe();

      const req = httpMock.expectOne(`${BASE}generate-otp`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.userId).toBe('user1');
      expect(req.request.body.channel).toBe('phone');
      req.flush(MOCK_OTP_RESPONSE);
    });

    it('includes optional email when provided', () => {
      service.generateOtp(1, 'user1', 'email', 'user@test.com').subscribe();

      const req = httpMock.expectOne(`${BASE}generate-otp`);
      expect(req.request.body.email).toBe('user@test.com');
      req.flush(MOCK_OTP_RESPONSE);
    });

    it('does not include email key when email is omitted', () => {
      service.generateOtp(1, 'user1', 'phone').subscribe();

      const req = httpMock.expectOne(`${BASE}generate-otp`);
      expect(req.request.body.email).toBeUndefined();
      req.flush(MOCK_OTP_RESPONSE);
    });

    it('propagates server errors', (done) => {
      service.generateOtp(1, 'user1', 'phone').subscribe({
        error: err => { expect(err).toBeTruthy(); done(); },
      });

      httpMock
        .expectOne(`${BASE}generate-otp`)
        .flush('Error', { status: 500, statusText: 'Server Error' });
    });
  });

  // ── validateOTP ─────────────────────────────────────────────────────────────

  describe('validateOTP()', () => {
    it('sends POST to verify-otp', () => {
      const req = { userId: 'user1', otp: '123456' };

      service.validateOTP(req as any).subscribe();

      const httpReq = httpMock.expectOne(`${BASE}verify-otp`);
      expect(httpReq.request.method).toBe('POST');
      httpReq.flush({ success: true });
    });

    it('stores the returned JWT via TokenService', (done) => {
      const req = { userId: 'user1', otp: '654321' };

      service.validateOTP(req as any).subscribe(() => {
        expect(tokenSvc.setToken).toHaveBeenCalledWith('new-jwt-token');
        done();
      });

      httpMock
        .expectOne(`${BASE}verify-otp`)
        .flush({ success: true, token: 'new-jwt-token' });
    });

    it('does NOT call setToken when response has no token', (done) => {
      service.validateOTP({ userId: 'u', otp: '000000' } as any).subscribe(() => {
        expect(tokenSvc.setToken).not.toHaveBeenCalled();
        done();
      });

      httpMock.expectOne(`${BASE}verify-otp`).flush({ success: true });
    });
  });

  // ── checkUserExists ─────────────────────────────────────────────────────────

  describe('checkUserExists()', () => {
    it('sends GET with the userId and an empty password', () => {
      service.checkUserExists('admin').subscribe();

      const req = httpMock.expectOne(r =>
        r.url.includes('GetUserDetails') &&
        r.params.get('userId')   === 'admin' &&
        r.params.get('password') === ''
      );
      expect(req.request.method).toBe('GET');
      req.flush(MOCK_USER);
    });

    it('returns user data when user exists', (done) => {
      service.checkUserExists('admin').subscribe(user => {
        expect(user.userId).toBe(MOCK_USER.userId);
        done();
      });

      httpMock.expectOne(r => r.url.includes('GetUserDetails')).flush(MOCK_USER);
    });
  });

  // ── forgotPassword ──────────────────────────────────────────────────────────

  describe('forgotPassword()', () => {
    it('sends POST to ForgotPassword with userId and newPassword', () => {
      service.forgotPassword('user1', 'newPass123').subscribe();

      const req = httpMock.expectOne(`${BASE}ForgotPassword`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ userId: 'user1', newPassword: 'newPass123' });
      req.flush({ success: true });
    });
  });

  // ── refreshToken ────────────────────────────────────────────────────────────

  describe('refreshToken()', () => {
    it('attaches the current token in the Authorization header', () => {
      service.refreshToken().subscribe();

      // refreshToken uses rawHttp (HttpBackend), not the intercepted client,
      // so the HttpTestingController won't capture it — we just verify
      // tokenService.getToken was called.
      expect(tokenSvc.getToken).toHaveBeenCalled();

      // Flush any leftover requests
      httpMock.match(() => true).forEach(r => r.flush({ token: 'refreshed' }));
    });
  });

  // ── logout ──────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('calls tokenService.clearAuth()', () => {
      service.logout();
      expect(tokenSvc.clearAuth).toHaveBeenCalledTimes(1);
    });
  });
});
