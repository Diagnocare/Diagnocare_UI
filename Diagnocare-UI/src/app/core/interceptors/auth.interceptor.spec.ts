import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  HttpRequest,
  provideHttpClient,
  withInterceptors
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthInterceptor } from './auth.interceptor';
import { TokenService } from './token.service';
import { LoginService } from 'src/app/services/loginServices/login.service';
import { controllerEndpoints } from 'src/app/constant/constants';

describe('AuthInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let tokenService: TokenService;
  let loginService: jasmine.SpyObj<LoginService>;
  let router: jasmine.SpyObj<Router>;

  const VALID_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwiZXhwIjo5OTk5OTk5OTk5fQ.fakesig';

  beforeEach(() => {
    const loginSpy   = jasmine.createSpyObj('LoginService',   ['refreshToken']);
    const routerSpy  = jasmine.createSpyObj('Router', ['navigate'], { url: '/dashboard' });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([AuthInterceptor])),
        provideHttpClientTesting(),
        TokenService,
        { provide: LoginService,     useValue: loginSpy  },
        { provide: Router,           useValue: routerSpy },
      ]
    });

    httpClient   = TestBed.inject(HttpClient);
    httpMock     = TestBed.inject(HttpTestingController);
    tokenService = TestBed.inject(TokenService);
    loginService = TestBed.inject(LoginService) as jasmine.SpyObj<LoginService>;
    router       = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    sessionStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  // ── Bearer token attachment ──────────────────────────────────────────────

  it('attaches Bearer token to non-login requests when token is present', () => {
    tokenService.setToken(VALID_TOKEN);

    httpClient.get('/api/Patient/SearchPatients').subscribe();

    const req = httpMock.expectOne('/api/Patient/SearchPatients');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${VALID_TOKEN}`);
    req.flush([]);
  });

  it('does not attach Authorization header when no token is stored', () => {
    // No token set — interceptor should still forward the request without a header
    httpClient.get('/api/Patient/SearchPatients').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/Patient/SearchPatients');
    // Header should either be absent or empty, never Bearer null/undefined
    const authHeader = req.request.headers.get('Authorization');
    expect(authHeader).toBeNull();
    req.flush([]);
  });

  // ── Pre-login endpoints carry no shared credential (SEC-001) ─────────────

  it('sends no Authorization header to the login endpoint', () => {
    const loginUrl = `/api/${controllerEndpoints.login}/GetUserDetails`;

    httpClient.post(loginUrl, {}).subscribe();

    const req = httpMock.expectOne(loginUrl);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ token: 'abc' });
  });

  it('does not attach Bearer token to login endpoint even when token exists', () => {
    tokenService.setToken(VALID_TOKEN);
    const loginUrl = `/api/${controllerEndpoints.login}/GetUserDetails`;

    httpClient.post(loginUrl, {}).subscribe();

    const req = httpMock.expectOne(loginUrl);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ token: 'abc' });
  });

  // ── 401 retry ────────────────────────────────────────────────────────────

  it('calls refreshToken and retries request on 401', () => {
    tokenService.setToken(VALID_TOKEN);
    const NEW_TOKEN = 'new.valid.token';

    loginService.refreshToken.and.returnValue(of({ token: NEW_TOKEN, success: true }) as any);
    tokenService.setToken(NEW_TOKEN); // simulate what refreshToken does

    let responseData: any;
    httpClient.get('/api/Patient/SearchPatients').subscribe(d => (responseData = d));

    // First request returns 401
    const firstReq = httpMock.expectOne('/api/Patient/SearchPatients');
    firstReq.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    // After refresh, the retry goes out
    const retryReq = httpMock.expectOne('/api/Patient/SearchPatients');
    retryReq.flush([{ patientId: 'Pat1001' }]);

    expect(loginService.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login when refresh fails on 401', () => {
    tokenService.setToken(VALID_TOKEN);
    loginService.refreshToken.and.returnValue(throwError(() => new Error('refresh failed')));

    httpClient.get('/api/Patient/SearchPatients').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/Patient/SearchPatients');
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  // ── Proactive expiry check ────────────────────────────────────────────────

  it('refreshes token proactively when stored token is already expired', () => {
    // Expired token: exp = 1000000000 (Sept 2001)
    const EXPIRED =
      'eyJhbGciOiJIUzI1NiJ9.' +
      'eyJzdWIiOiJ1c2VyIiwiZXhwIjoxMDAwMDAwMDAwfQ.' +
      'fakesig';
    tokenService.setToken(EXPIRED);

    const REFRESHED = VALID_TOKEN;
    loginService.refreshToken.and.callFake(() => {
      tokenService.setToken(REFRESHED);
      return of({ token: REFRESHED, success: true }) as any;
    });

    httpClient.get('/api/Patient/SearchPatients').subscribe({ error: () => {} });

    // The retry after proactive refresh
    const req = httpMock.expectOne('/api/Patient/SearchPatients');
    req.flush([]);

    expect(loginService.refreshToken).toHaveBeenCalledTimes(1);
  });
});
