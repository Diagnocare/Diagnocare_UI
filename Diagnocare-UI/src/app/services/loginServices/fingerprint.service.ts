import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, from, throwError, firstValueFrom } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

import { response } from '../../models/common/response';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { TokenService } from 'src/app/core/interceptors/token.service';

/**
 * WebAuthn / FIDO2 fingerprint MFA client.
 *
 * Registration is called from the security screen (user is authenticated → Bearer).
 * Login assertion is called mid-login (no JWT yet → Basic auth, applied by the
 * auth interceptor for `api/Fingerprint/assert*`).
 *
 * The heavy lifting is the base64url ⇆ ArrayBuffer marshalling required by the
 * browser WebAuthn API: fido2-net-lib sends/receives byte arrays as base64url
 * strings, while `navigator.credentials` works with ArrayBuffers.
 */
@Injectable({ providedIn: 'root' })
export class FingerprintService {

  private readonly url: string;

  constructor(
    private http: HttpClient,
    private tokenService: TokenService,
  ) {
    this.url = getDiagnocareApiUrl() + controllerEndpoints.fingerprint;
  }

  /** True when the browser/device advertises a platform authenticator (built-in reader). */
  static isSupported(): boolean {
    return typeof window !== 'undefined'
      && !!(window as any).PublicKeyCredential
      && !!navigator.credentials;
  }

  /** Whether this device has a usable platform authenticator (e.g. Windows Hello). */
  static async hasPlatformAuthenticator(): Promise<boolean> {
    if (!FingerprintService.isSupported()) return false;
    try {
      return await (window as any).PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  getStatus(userName: string): Observable<any> {
    const params = new HttpParams().set('userName', userName);
    return this.http.get<any>(`${this.url}${apiEndpoints.fpStatus}`, { params })
      .pipe(catchError(this.errorHandler));
  }

  // ── Registration (authenticated) ──────────────────────────────────────────

  /** Enrols the current device's fingerprint. Returns true on success. */
  registerFingerprint(userName: string, label: string): Observable<boolean> {
    return from(this.doRegister(userName, label));
  }

  private async doRegister(userName: string, label: string): Promise<boolean> {
    // 1. Ask the server for attestation options.
    const params = new HttpParams().set('userName', userName);
    const options: any = await this.post(`${apiEndpoints.fpRegisterBegin}`, null, params);

    // 2. Convert base64url fields to ArrayBuffers and invoke the authenticator.
    const publicKey = this.toCreateOptions(options);
    let credential: PublicKeyCredential;
    try {
      credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
    } catch (e: any) {
      throw new Error(FingerprintService.describeWebAuthnError(e));
    }
    if (!credential) throw new Error('No fingerprint was captured. Please try again.');

    // 3. Serialise the attestation response back to base64url and confirm with the server.
    const attestation = this.encodeAttestation(credential);
    const completeParams = new HttpParams().set('userName', userName).set('label', label ?? '');
    const res: any = await this.post(`${apiEndpoints.fpRegisterComplete}`, attestation, completeParams);
    if (!res?.success) throw new Error(res?.message || 'Registration failed. Please try again.');
    return true;
  }

  /** Maps a WebAuthn DOMException to a clear, actionable message. */
  static describeWebAuthnError(e: any): string {
    const name = e?.name || '';
    switch (name) {
      case 'NotAllowedError':
        return 'The request was cancelled or timed out. Try again and approve the Windows Hello / Touch ID prompt.';
      case 'InvalidStateError':
        return 'This device is already registered for your account. Remove it first, or use it to sign in.';
      case 'SecurityError':
        return 'Fingerprint sign-in must be used over HTTPS or on localhost, and the site domain must match the server configuration.';
      case 'NotSupportedError':
        return 'No compatible fingerprint authenticator was found on this device.';
      case 'AbortError':
        return 'The fingerprint prompt was closed before completing.';
      case 'ConstraintError':
        return 'This device could not create the credential with the requested settings.';
      default:
        return e?.message ? `Fingerprint error: ${e.message}` : 'Fingerprint registration failed. Please try again.';
    }
  }

  // ── Login assertion (mid-login) ───────────────────────────────────────────

  /**
   * Runs the WebAuthn login ceremony. On success the JWT is stored via
   * TokenService and the raw server response (with token) is emitted.
   */
  loginWithFingerprint(userName: string): Observable<response> {
    return from(this.doAssert(userName)).pipe(
      tap((res: any) => { if (res?.token) this.tokenService.setToken(res.token); }),
    );
  }

  private async doAssert(userName: string): Promise<response> {
    // 1. Ask the server for assertion options.
    const params = new HttpParams().set('userName', userName);
    const options: any = await this.post(`${apiEndpoints.fpAssertBegin}`, null, params);

    // 2. Convert and invoke the authenticator to sign the challenge.
    const publicKey = this.toRequestOptions(options);
    let assertion: PublicKeyCredential;
    try {
      assertion = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
    } catch (e: any) {
      throw new Error(FingerprintService.describeWebAuthnError(e));
    }

    // 3. Serialise and verify with the server (returns { success, message, token }).
    const encoded = this.encodeAssertion(assertion);
    return await this.post(`${apiEndpoints.fpAssertComplete}`, encoded, params) as response;
  }

  disable(userName: string): Observable<response> {
    const params = new HttpParams().set('userName', userName);
    return this.http.post<response>(`${this.url}${apiEndpoints.fpDisable}`, null, { params })
      .pipe(catchError(this.errorHandler));
  }

  // ── HTTP helper ───────────────────────────────────────────────────────────

  private post(endpoint: string, body: any, params: HttpParams): Promise<any> {
    return firstValueFrom(this.http.post<any>(`${this.url}${endpoint}`, body, { params }));
  }

  // ── WebAuthn ⇆ JSON marshalling ───────────────────────────────────────────

  private toCreateOptions(o: any): PublicKeyCredentialCreationOptions {
    o.challenge = this.b64urlToBuf(o.challenge);
    o.user.id = this.b64urlToBuf(o.user.id);
    if (Array.isArray(o.excludeCredentials)) {
      o.excludeCredentials = o.excludeCredentials.map((c: any) => ({ ...c, id: this.b64urlToBuf(c.id) }));
    }
    return o as PublicKeyCredentialCreationOptions;
  }

  private toRequestOptions(o: any): PublicKeyCredentialRequestOptions {
    o.challenge = this.b64urlToBuf(o.challenge);
    if (Array.isArray(o.allowCredentials)) {
      o.allowCredentials = o.allowCredentials.map((c: any) => ({ ...c, id: this.b64urlToBuf(c.id) }));
    }
    return o as PublicKeyCredentialRequestOptions;
  }

  private encodeAttestation(cred: PublicKeyCredential) {
    const r = cred.response as AuthenticatorAttestationResponse;
    // fido2-net-lib v4 marks response.transports and clientExtensionResults as
    // [Required]; omitting them makes the API reject the body with HTTP 400.
    const transports = (typeof (r as any).getTransports === 'function') ? (r as any).getTransports() : [];
    return {
      id: cred.id,
      rawId: this.bufToB64url(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: {
        attestationObject: this.bufToB64url(r.attestationObject),
        clientDataJSON: this.bufToB64url(r.clientDataJSON),
        transports: transports ?? [],
      },
    };
  }

  private encodeAssertion(cred: PublicKeyCredential) {
    const r = cred.response as AuthenticatorAssertionResponse;
    // clientExtensionResults is [Required] in fido2-net-lib v4.
    return {
      id: cred.id,
      rawId: this.bufToB64url(cred.rawId),
      type: cred.type,
      clientExtensionResults: cred.getClientExtensionResults(),
      response: {
        authenticatorData: this.bufToB64url(r.authenticatorData),
        clientDataJSON: this.bufToB64url(r.clientDataJSON),
        signature: this.bufToB64url(r.signature),
        userHandle: r.userHandle ? this.bufToB64url(r.userHandle) : null,
      },
    };
  }

  private b64urlToBuf(value: string): ArrayBuffer {
    const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
    const base64 = (value + pad).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const buf = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
    return buf.buffer;
  }

  private bufToB64url(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private errorHandler(error: HttpErrorResponse): Observable<never> {
    console.error('[FingerprintService]', error);
    return throwError(() => error.message || 'Fingerprint authentication error');
  }
}
