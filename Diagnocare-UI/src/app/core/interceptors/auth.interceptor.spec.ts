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
import { PinService } from 'src/app/services/pinServices/pin.service';
import { PinModalService } from 'src/app/shared/pin-modal/pin-modal.service';
import { controllerEndpoints } from 'src/app/constant/constants';

describe('AuthInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let tokenService: TokenService;
  let loginService: jasmine.SpyObj<LoginService>;
  let router: jasmine.SpyObj<Router>;
  let pinService: PinService;
  let pinModalService: PinModalService;

  const VALID_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIiwiZXhwIjo5OTk5OTk5OTk5fQ.fakesig';
  // exp = 1000000000 (Sept 2001) — always expired. sub = 'user'.
  const EXPIRED_TOKEN =
    'eyJhbGciOiJIUzI1NiJ9.' +
    'eyJzdWIiOiJ1c2VyIiwiZXhwIjoxMDAwMDAwMDAwfQ.' +
    'fakesig';
  /** getUserId() reads the `sub` claim of the tokens above. */
  const USER_ID = 'user';
  const API_URL = '/api/Patient/SearchPatients';

  beforeEach(() => {
    const loginSpy   = jasmine.createSpyObj('LoginService',   ['refreshToken', 'logout']);
    loginSpy.logout.and.returnValue(of(undefined));
    // `url` is assigned (not passed as a createSpyObj property) so individual
    // tests can move the "current route" — the no-PIN path branches on it.
    const routerSpy  = jasmine.createSpyObj('Router', ['navigate']);
    routerSpy.url = '/dashboard';

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
    pinService      = TestBed.inject(PinService);
    pinModalService = TestBed.inject(PinModalService);

    sessionStorage.clear();
    localStorage.clear();   // PIN hashes live in localStorage
  });

  afterEach(() => {
    httpMock.verify();
    pinModalService.endPinSetup();
    sessionStorage.clear();
    localStorage.clear();
  });

  /** True when the interceptor sent the user to the login page. */
  const navigatedToLogin = () =>
    router.navigate.calls.allArgs().some(args => {
      const commands = args[0] as unknown[];
      return Array.isArray(commands) && commands[0] === '/login';
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

  // Every refresh is PIN-gated, so these tests give the user a PIN and then
  // stand in for PinModalComponent by resolving the modal.

  it('calls refreshToken and retries request on 401', async () => {
    await pinService.setPin(USER_ID, '1234');
    tokenService.setToken(VALID_TOKEN);

    // Simulate what refreshToken does: store a freshly issued (still decodable)
    // token. It must stay a real JWT — getUserId() reads its `sub` to find the PIN.
    loginService.refreshToken.and.callFake(() => {
      tokenService.setToken(VALID_TOKEN);
      return of({ token: VALID_TOKEN, success: true }) as any;
    });

    httpClient.get(API_URL).subscribe({ error: () => {} });

    // First request returns 401
    const firstReq = httpMock.expectOne(API_URL);
    firstReq.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    // The PIN modal is now open — the correct PIN was entered.
    pinModalService.resolve(true);

    // After refresh, the retry goes out
    const retryReq = httpMock.expectOne(API_URL);
    retryReq.flush([{ patientId: 'Pat1001' }]);

    expect(loginService.refreshToken).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login when refresh fails on 401', async () => {
    await pinService.setPin(USER_ID, '1234');
    tokenService.setToken(VALID_TOKEN);
    loginService.refreshToken.and.returnValue(throwError(() => new Error('refresh failed')));

    httpClient.get(API_URL).subscribe({ error: () => {} });

    const req = httpMock.expectOne(API_URL);
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    pinModalService.resolve(true);   // correct PIN, but the refresh itself fails

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  // ── Proactive expiry check ────────────────────────────────────────────────

  it('refreshes token proactively when stored token is already expired', async () => {
    await pinService.setPin(USER_ID, '1234');
    tokenService.setToken(EXPIRED_TOKEN);

    loginService.refreshToken.and.callFake(() => {
      tokenService.setToken(VALID_TOKEN);
      return of({ token: VALID_TOKEN, success: true }) as any;
    });

    httpClient.get(API_URL).subscribe({ error: () => {} });

    pinModalService.resolve(true);   // PIN entered correctly

    // The retry after proactive refresh
    const req = httpMock.expectOne(API_URL);
    req.flush([]);

    expect(loginService.refreshToken).toHaveBeenCalledTimes(1);
  });

  // ── No PIN configured: "Go to Settings" must NEVER log the user out ──────
  // A missing PIN is a setup state, not an authentication failure. Regression
  // guard: this path used to run through refreshAndRetry(), which cleared the
  // session and redirected to /login whenever the refresh was rejected — which
  // is the normal case, since the modal only appears once the token has expired.

  it('navigates to PIN setup and keeps the session when the refresh is rejected', () => {
    tokenService.setToken(EXPIRED_TOKEN);   // no PIN set — setup modal path
    loginService.refreshToken.and.returnValue(throwError(() => new Error('refresh denied')));

    httpClient.get(API_URL).subscribe({ error: () => {} });

    pinModalService.resolve(true);          // user clicked "Go to Settings"

    expect(router.navigate).toHaveBeenCalledWith(['/settings'], { queryParams: { setupPin: '1' } });
    expect(navigatedToLogin()).toBeFalse();
    expect(loginService.logout).not.toHaveBeenCalled();
    expect(tokenService.hasToken()).toBeTrue();   // session left intact
  });

  it('keeps the session when the refresh succeeds and retries the request', () => {
    tokenService.setToken(EXPIRED_TOKEN);
    loginService.refreshToken.and.callFake(() => {
      tokenService.setToken(VALID_TOKEN);
      return of({ token: VALID_TOKEN, success: true }) as any;
    });

    httpClient.get(API_URL).subscribe({ error: () => {} });

    pinModalService.resolve(true);          // "Go to Settings"

    const req = httpMock.expectOne(API_URL);
    req.flush([]);

    expect(router.navigate).toHaveBeenCalledWith(['/settings'], { queryParams: { setupPin: '1' } });
    expect(navigatedToLogin()).toBeFalse();
    expect(tokenService.hasToken()).toBeTrue();
  });

  it('renews the token BEFORE navigating, so Settings can load the profile', () => {
    tokenService.setToken(EXPIRED_TOKEN);

    const order: string[] = [];
    router.navigate.and.callFake(() => { order.push('navigate'); return Promise.resolve(true); });
    loginService.refreshToken.and.callFake(() => {
      order.push('refresh');
      tokenService.setToken(VALID_TOKEN);
      return of({ token: VALID_TOKEN, success: true }) as any;
    });

    httpClient.get(API_URL).subscribe({ error: () => {} });

    pinModalService.resolve(true);          // "Go to Settings"

    // Navigating first was a race with the lazy route chunk: Settings fetched
    // the profile with the dead token and rendered empty.
    expect(order).toEqual(['refresh', 'navigate']);
    // The page therefore loads with a usable token.
    expect(tokenService.isTokenExpired()).toBeFalse();

    httpMock.expectOne(API_URL).flush([]);
  });

  it('lets the Settings profile request through once the token is valid', () => {
    // State right after a successful "Go to Settings": setup still pending,
    // user on the setup page, but the token has been renewed.
    pinModalService.beginPinSetup();
    (router as any).url = '/settings?setupPin=1';
    tokenService.setToken(VALID_TOKEN);

    let loaded: any = null;
    httpClient.get('/api/Header/GetUserDetails?userName=user').subscribe(d => (loaded = d));

    const req = httpMock.expectOne('/api/Header/GetUserDetails?userName=user');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${VALID_TOKEN}`);
    req.flush({ user_Id: 7, email: 'kumar@example.com', contactPhone: 9999999999, loginType: 2 });

    expect(loaded.email).toBe('kumar@example.com');   // profile data reaches the page
  });

  it('does not re-open the setup modal for requests made on the PIN setup page', () => {
    tokenService.setToken(EXPIRED_TOKEN);
    pinModalService.beginPinSetup();
    (router as any).url = '/settings?setupPin=1';   // user is already on the setup page

    const openSpy = jasmine.createSpy('open');
    const sub = pinModalService.open$.subscribe(openSpy);

    let failed = false;
    httpClient.get(API_URL).subscribe({ error: () => (failed = true) });

    expect(openSpy).not.toHaveBeenCalled();  // no modal loop
    expect(failed).toBeTrue();               // the request alone fails
    expect(navigatedToLogin()).toBeFalse();
    expect(loginService.logout).not.toHaveBeenCalled();
    expect(tokenService.hasToken()).toBeTrue();

    sub.unsubscribe();
  });

  it('logs out only when the user explicitly chooses "Log Out"', () => {
    tokenService.setToken(EXPIRED_TOKEN);

    httpClient.get(API_URL).subscribe({ error: () => {} });

    pinModalService.resolve(false);          // user clicked "Log Out"

    expect(loginService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'no_pin' } });
  });
});
