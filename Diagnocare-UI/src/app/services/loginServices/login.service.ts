import { Injectable } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse, HttpParams, HttpRequest, HttpResponse } from '@angular/common/http';
import { catchError, filter, map, mapTo, switchMap, tap } from 'rxjs/operators';
import { Observable, from, of, throwError } from 'rxjs';

import { LoginModel } from '../../models/auth/loginModel';
import { requestOTP } from '../../models/auth/requestOTP';
import { SendOtpRequest, VerifyOtpRequest, VerifyAuthRequest, OtpChannel } from '../../models/auth/otp-request.dto';
import { response } from '../../models/common/response';
import { MemberDto } from '../../models/member/member.dto';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { TokenService } from 'src/app/core/interceptors/token.service';

@Injectable({ providedIn: 'root' })
export class LoginService {

  private readonly url: string;
  private readonly otpUrl: string;
  private readonly headerUrl: string;
  /** HttpClient that bypasses all interceptors — used for the refresh call so
   *  we can attach the expired JWT ourselves without it being overwritten. */
  private readonly rawHttp: HttpClient;

  constructor(
    private httpClient: HttpClient,
    private tokenService: TokenService,
    httpBackend: HttpBackend,
  ) {
    this.url       = getDiagnocareApiUrl() + controllerEndpoints.login;
    this.otpUrl    = getDiagnocareApiUrl() + controllerEndpoints.otp;
    this.headerUrl = getDiagnocareApiUrl() + controllerEndpoints.header;
    this.rawHttp   = new HttpClient(httpBackend);
  }

  // ── Authentication ──────────────────────────────────────────────────────────

  /**
   * Validates user credentials.
   * Password is hashed with SHA-256 before transmission — the backend stores
   * and compares against the same SHA-256 digest.
   */
  getUserDetails(login: LoginModel): Observable<MemberDto> {
    const endpoint = `${this.url}${apiEndpoints.getUserDetails}`;
        const params = new HttpParams()
          .set('userId', login.userId)
          .set('password', login.password);
        return this.httpClient.get<MemberDto>(endpoint, { params });
      }

  // ── TOTP — stateless, no DB storage ────────────────────────────────────────

  /**
   * Asks the backend to generate a 6-digit TOTP and dispatch it via the
   * CommunicationController to the specified channel.
   *
   * The backend derives the code as:
   *   TOTP = truncate6( HMAC-SHA256( serverSecret + userId, floor(now / 30) ) )
   * Nothing is stored in the database.
   *
   * @param userId   The user's login ID.
   * @param channel  Delivery channel: 'phone' | 'email' | 'other'.
   * @param email    Recovery flow only — explicit email (overrides profile).
   * @param contactPhone Recovery flow only — explicit phone (overrides profile).
   */
  generateOtp(
    id: number,
    userId:        string,
    channel:       OtpChannel | string,
    email?:        string,
    contactPhone?: string,
  ): Observable<response> {
    const body: SendOtpRequest = {
      id,
      userId,
      channel: channel as OtpChannel,
      ...(email        ? { email }        : {}),
      ...(contactPhone ? { contactPhone } : {}),
    };
    return this.httpClient
      .post<response>(`${this.otpUrl}${apiEndpoints.generateOTP}`, body)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * Submits the 6-digit code for server-side verification.
   * Backend re-derives the TOTP for the current ± adjacent time windows
   * and compares — no database lookup required.
   */
  validateOTP(req: requestOTP | VerifyOtpRequest): Observable<response> {
    return this.httpClient
      .post<response>(`${this.url}${apiEndpoints.verifyOtp}`, req)
      .pipe(
        tap((res: any) => {
          if (res?.token) {
            this.tokenService.setToken(res.token);
          }
        }),
        catchError(this.errorHandler),
      );
  }

  // ── Token & session ─────────────────────────────────────────────────────────

  /**
   * Silently exchanges the current (possibly expired) JWT for a fresh one.
   *
   * Uses `HttpBackend` directly so NO interceptor runs — this prevents the
   * auth interceptor from replacing the Bearer header with Basic Auth before
   * the request reaches the backend.  The backend reads the token from the
   * Authorization header to identify the user and issue a new JWT.
   */
  refreshToken(): Observable<response> {
    const currentToken = this.tokenService.getToken();
    // If the session was terminated (markSessionTerminated removes the token),
    // getToken() returns null.  Sending `Bearer null` to the server is
    // misleading — fail fast so the auth interceptor's catchError drives a
    // clean redirect to /login instead of making a pointless HTTP round-trip.
    if (!currentToken) {
      return throwError(() => new Error('No token — session already terminated'));
    }
    return this.rawHttp
      .get<response>(`${this.url}${apiEndpoints.refreshToken}`, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
          'X-Browser-Id': this.tokenService.getBrowserId(),
        },
      })
      .pipe(
        tap((res: any) => {
          if (res?.token) {
            this.tokenService.setToken(res.token);
          }
        }),
        catchError(this.errorHandler),
      );
  }

  /**
   * Checks whether a userId exists without validating any password.
   * Used by the Forgot Password flow to confirm the user before sending an OTP.
   * No hashing is applied — an empty password string is sent so the backend
   * performs a user-existence check only.
   */
  checkUserExists(userId: string): Observable<MemberDto> {
    const endpoint = `${this.url}${apiEndpoints.getUserDetails}`;
    const params   = new HttpParams()
      .set('userId', userId)
      .set('password', '');
    return this.httpClient.get<MemberDto>(endpoint, { params })
      .pipe(catchError(this.errorHandler));
  }

  /**
   * Single verification endpoint for all auth types (OTP + TOTP).
   * Always POSTs to api/login/Verify with a VerifyAuthRequest body.
   */
  verifyAuth(request: VerifyAuthRequest): Observable<response> {
    return this.httpClient
      .post<response>(`${this.otpUrl}${apiEndpoints.verify}`, request)
      .pipe(
        tap((res: any) => {
          if (res?.token) {
            this.tokenService.setToken(res.token);
          }
        }),
        catchError(this.errorHandler),
      );
  }

  /**
   * Verifies a TOTP code from the user's authenticator app during login.
   * Called only when loginType === 3 (AuthenticationApp).
   * Backend runs VerifyTotpAndIssueTokenAsync — checks IsMfaEnabled + TOTP,
   * then returns a JWT on success.
   */
  verifyTotpLogin(userId: string, totpCode: string): Observable<response> {
    return this.httpClient
      .post<response>(`${this.url}${apiEndpoints.verifyTotpLogin}`, { userId, totpCode })
      .pipe(
        tap((res: any) => {
          if (res?.token) {
            this.tokenService.setToken(res.token);
          }
        }),
        catchError(this.errorHandler),
      );
  }

  forgotPassword(userId: string, newPassword: string): Observable<response> {
    return this.httpClient
      .post<response>(`${this.url}${apiEndpoints.resetPassword}`, { userId, newPassword })
      .pipe(catchError(this.errorHandler));
  }

  getUserIdByContact(
    method: 'contact' | 'email',
    value: string,
  ): Observable<response & { userId?: string; id?: number }> {
    const param = method === 'contact'
      ? `?contactPhone=${encodeURIComponent(value)}`
      : `?email=${encodeURIComponent(value)}`;
    return this.httpClient
      .get<response & { userId?: string; id?: number }>(`${this.url}${apiEndpoints.getUserIdByContact}${param}`)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * Clears the active session for the given user after re-validating their
   * password.  Called from the session-conflict dialog ("Log in here" flow)
   * before re-issuing a new token.
   */
  clearSession(userId: string, password: string): Observable<any> {
    return this.httpClient
      .post<any>(`${this.url}${apiEndpoints.clearSession}`, { userId, password })
      .pipe(catchError(this.errorHandler));
  }

  /**
   * Lightweight session health-check — called every 30 s by AppComponent.
   * Uses the interceptor-equipped HttpClient so the auth interceptor handles
   * any SESSION_TERMINATED 401 response automatically (marks session terminated
   * and redirects to /login).  Callers should swallow errors for non-session
   * failures (network, server errors) since the interceptor already handles the
   * important case.
   */
  ping(): Observable<void> {
    return this.httpClient
      .get<void>(`${this.headerUrl}${apiEndpoints.ping}`)
      .pipe(map(() => undefined as void));
    // Do NOT catchError here — let SESSION_TERMINATED propagate to the interceptor.
  }

  /**
   * Clears the active session both on the backend and locally.
   *
   * Returns an Observable that completes after the backend call finishes
   * (errors are swallowed so callers don't need to handle them).
   * Callers that care about ordering — e.g. the logout button — should
   * `subscribe(() => navigate('/'))` to ensure the DB session is cleared
   * before the user lands on the login page.
   *
   * Uses rawHttp so no interceptor overwrites the Bearer header.
   */
  /**
   * Clears the active session on the backend and removes all local auth state.
   *
   * Falls back to the localStorage `cleanupToken` when sessionStorage is already
   * empty (i.e. the browser was closed without an explicit logout).  This ensures
   * the DB `ActiveSessionId` is always cleared on the next page load, preventing a
   * spurious session-conflict dialog on re-login from a different browser.
   */
  logout(): Observable<void> {
    const token = this.tokenService.getToken() ?? this.tokenService.getCleanupToken();
    this.tokenService.clearAuth();   // removes sessionStorage token + localStorage cleanupToken
    if (!token) return of(undefined as void);
    return this.rawHttp
      .post(`${this.url}${apiEndpoints.logout}`, null, {
        // rawHttp bypasses the interceptor, so manually add X-Browser-Id
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Browser-Id': this.tokenService.getBrowserId(),
        },
      })
      .pipe(
        map(() => undefined as void),
        catchError(() => of(undefined as void)),
      );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * Returns the SHA-256 hex digest of the input string.
   * Used to hash passwords before transmission so the plaintext never leaves
   * the browser.
   */
  private sha256(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    return crypto.subtle.digest('SHA-256', data).then(buf =>
      Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join(''),
    );
  }

  private errorHandler(error: HttpErrorResponse): Observable<never> {
    console.error(error);
    return throwError(() => error.message || 'Server Error');
  }
}
