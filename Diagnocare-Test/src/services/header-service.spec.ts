import { TestBed }                              from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { HeaderService } from 'src/app/services/headerServices/header-service';

const BASE = 'http://localhost:5000/api/header/';

describe('HeaderService', () => {
  let service:  HeaderService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports:   [HttpClientTestingModule],
      providers: [HeaderService],
    });

    service  = TestBed.inject(HeaderService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── getUserDetails ──────────────────────────────────────────────────────────

  describe('getUserDetails()', () => {
    it('sends GET with userName as query param', () => {
      service.getUserDetails('testUser').subscribe();

      const req = httpMock.expectOne(`${BASE}GetUserDetails?userName=testUser`);
      expect(req.request.method).toBe('GET');
      req.flush({ userName: 'testUser', email: 'test@lab.com' });
    });

    it('returns user details on success', (done) => {
      const mockUser = { userName: 'adminUser', email: 'admin@lab.com' };

      service.getUserDetails('adminUser').subscribe((data: any) => {
        expect(data.userName).toBe('adminUser');
        expect(data.email).toBe('admin@lab.com');
        done();
      });

      httpMock.expectOne(`${BASE}GetUserDetails?userName=adminUser`).flush(mockUser);
    });

    it('propagates error when user not found', (done) => {
      service.getUserDetails('unknown').subscribe({
        error: err => {
          expect(err).toBeTruthy();
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}GetUserDetails?userName=unknown`)
        .flush(null, { status: 404, statusText: 'Not Found' });
    });
  });

  // ── validateOldPassword ─────────────────────────────────────────────────────

  describe('validateOldPassword()', () => {
    it('sends GET with userName and oldPassword query params', () => {
      service.validateOldPassword('user1', 'oldPass123').subscribe();

      const req = httpMock.expectOne(`${BASE}ValidateOldPassword?userName=user1&oldPassword=oldPass123`);
      expect(req.request.method).toBe('GET');
      req.flush({ isValid: true });
    });

    it('returns validation result on success', (done) => {
      service.validateOldPassword('user1', 'correctPass').subscribe((data: any) => {
        expect(data.isValid).toBe(true);
        done();
      });

      httpMock
        .expectOne(`${BASE}ValidateOldPassword?userName=user1&oldPassword=correctPass`)
        .flush({ isValid: true });
    });

    it('propagates error when password is invalid', (done) => {
      service.validateOldPassword('user1', 'wrongPass').subscribe({
        error: err => {
          expect(err).toBeTruthy();
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}ValidateOldPassword?userName=user1&oldPassword=wrongPass`)
        .flush(null, { status: 401, statusText: 'Unauthorized' });
    });
  });

  // ── getProfileImage ─────────────────────────────────────────────────────────

  describe('getProfileImage()', () => {
    it('sends GET to ProfileImage with userName query param', () => {
      service.getProfileImage('user1').subscribe();

      const req = httpMock.expectOne(`${BASE}ProfileImage?userName=user1`);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['image data'], { type: 'image/jpeg' }));
    });

    it('propagates error when image not found', (done) => {
      service.getProfileImage('noImageUser').subscribe({
        error: err => {
          expect(err).toBeTruthy();
          done();
        },
      });

      httpMock
        .expectOne(`${BASE}ProfileImage?userName=noImageUser`)
        .flush(null, { status: 404, statusText: 'Not Found' });
    });
  });

  // ── uploadProfilePhoto ──────────────────────────────────────────────────────

  describe('uploadProfilePhoto()', () => {
    it('sends POST to UploadProfileImage with FormData', () => {
      const file = new File(['image content'], 'photo.jpg', { type: 'image/jpeg' });

      service.uploadProfilePhoto('user1', file).subscribe();

      const req = httpMock.expectOne(`${BASE}UploadProfileImage`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeInstanceOf(FormData);
      req.flush({ success: true });
    });
  });

  // ── resetPassword ───────────────────────────────────────────────────────────

  describe('resetPassword()', () => {
    it('sends POST to ForgotPassword with userId and newPassword in body', () => {
      service.resetPassword('user1', 'newPass456').subscribe();

      const req = httpMock.expectOne(`${BASE}ForgotPassword`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ userId: 'user1', newPassword: 'newPass456' });
      req.flush({ success: true });
    });

    it('returns success response', (done) => {
      service.resetPassword('admin', 'Admin@123').subscribe((res: any) => {
        expect(res.success).toBe(true);
        done();
      });

      httpMock.expectOne(`${BASE}ForgotPassword`).flush({ success: true });
    });
  });

  // ── updateAuthType ──────────────────────────────────────────────────────────

  describe('updateAuthType()', () => {
    it('sends POST to UpdateAuthType with User_Name and loginType', () => {
      service.updateAuthType('admin', 1).subscribe();

      const req = httpMock.expectOne(`${BASE}UpdateAuthType`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ User_Name: 'admin', loginType: 1 });
      req.flush({ success: true });
    });

    it('includes loginType 0 (basic auth)', () => {
      service.updateAuthType('user1', 0).subscribe();

      const req = httpMock.expectOne(`${BASE}UpdateAuthType`);
      expect(req.request.body.loginType).toBe(0);
      req.flush({ success: true });
    });
  });
});
