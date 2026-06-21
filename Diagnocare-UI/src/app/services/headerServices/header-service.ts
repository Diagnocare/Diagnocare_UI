import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { throwError } from 'rxjs/internal/observable/throwError';
import { Observable } from 'rxjs/internal/Observable';
import { catchError } from 'rxjs/internal/operators/catchError';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';


@Injectable({
  providedIn: 'root',
})

export class HeaderService {
      
  private readonly url: string;
  private readonly loginUrl: string;
  private readonly mfaUrl: string;

  constructor(private httpClient: HttpClient) {
    this.url      = getDiagnocareApiUrl() + controllerEndpoints.header;
    this.loginUrl = getDiagnocareApiUrl() + controllerEndpoints.login;
    this.mfaUrl   = getDiagnocareApiUrl() + controllerEndpoints.mfa;
  }

  getUserDetails(userName: string) {
      const endpoint = `${this.url}${apiEndpoints.getUserDetails}?userName=${userName}`;
      return this.httpClient.get(endpoint).pipe(
      catchError(this.errorHandler.bind(this))
    );
  }
  
  validateOldPassword(userName: string, oldPassword: string) {
    const endpoint = `${this.url}${apiEndpoints.validateOldPassword}?userName=${userName}&oldPassword=${oldPassword}`;
    return this.httpClient.get(endpoint).pipe(
      catchError(this.errorHandler.bind(this))
    );
  }

  /**
   * Fetch profile image for a user
   * Can return either a blob (image) or a JSON response with error details
   * @param userName - The username to fetch profile image for
   * @returns Observable that emits either a Blob (image) or a Blob containing JSON error response
   */
  getProfileImage(userName: string): Observable<Blob> {
    const endpoint = `${this.url}${apiEndpoints.profileImage}?userName=${userName}`;
    return this.httpClient.get(endpoint, { responseType: 'blob' }).pipe(
      catchError(this.errorHandler.bind(this))
    );
  }
  uploadProfilePhoto(userName: string, file: File) {
    const endpoint = `${this.url}${apiEndpoints.uploadProfileImage}`;
    const formData = new FormData();
    formData.append('userName', userName);
    formData.append('file', file);
    return this.httpClient.post(endpoint, formData);
  }

  resetPassword(userId: string,newPassword: string) {
      const endpoint = `${this.loginUrl}${apiEndpoints.resetPassword}`;
      const body = {
        userId,
        newPassword
      };
      return this.httpClient.post(endpoint, body);
    }
    updateAuthType(User_Name: string, loginType: number) {
      const endpoint = `${this.url}${apiEndpoints.updateAuthType}`;
      const request = { User_Name, loginType };
      return this.httpClient.put(endpoint, request);
    }

    /**
     * Sends an OTP for a profile update (email / phone change).
     * Uses Bearer auth via HeaderController — separate from the login-flow OTP.
     */
    sendProfileOtp(id: number, userId: string, channel: 'email' | 'phone', email?: string, contactPhone?: string): Observable<{ success: boolean; message: string }> {
      const endpoint = `${this.url}${apiEndpoints.sendProfileOtp}`;
      return this.httpClient.post<{ success: boolean; message: string }>(
        endpoint,
        { id, userId, channel, email, contactPhone }
      ).pipe(catchError(this.errorHandler.bind(this)));
    }

    /**
     * Verifies a profile-update OTP.
     * Returns { success, message } only — no JWT issued.
     */
    verifyProfileOtp(userId: string, code: string): Observable<{ success: boolean; message: string }> {
      const endpoint = `${this.url}${apiEndpoints.verifyProfileOtp}`;
      return this.httpClient.post<{ success: boolean; message: string }>(
        endpoint,
        { userId, code }
      ).pipe(catchError(this.errorHandler.bind(this)));
    }

    updateUserEmail(userName: string, email: string) {
      const endpoint = `${this.url}${apiEndpoints.updateUserEmail}`;
      return this.httpClient.put(endpoint, { userName, email }).pipe(
        catchError(this.errorHandler.bind(this))
      );
    }

    updateUserPhone(userName: string, contactPhone: string) {
      const endpoint = `${this.url}${apiEndpoints.updateUserPhone}`;
      return this.httpClient.put(endpoint, { userName, contactPhone }).pipe(
        catchError(this.errorHandler.bind(this))
      );
    }

    getMFAStatus(userName: string): Observable<{
      isMfaEnabled: boolean;
      hasSecret:    boolean;
      issuer?:      string;
      accountName?: string;
      deviceName?:  string;
      configuredAt?: string;
    }> {
      const endpoint = `${this.mfaUrl}${apiEndpoints.getMFAStatus}?userName=${encodeURIComponent(userName)}`;
      return this.httpClient.get<{
        isMfaEnabled: boolean;
        hasSecret:    boolean;
        issuer?:      string;
        accountName?: string;
        deviceName?:  string;
        configuredAt?: string;
      }>(endpoint).pipe(
        catchError(this.errorHandler.bind(this))
      );
    }

    setupMFA(userName: string): Observable<{ qrCodeImageBase64: string; qrCodeUri: string; manualEntryKey: string; issuer: string }> {
      const endpoint = `${this.mfaUrl}${apiEndpoints.setupMFA}?userName=${encodeURIComponent(userName)}`;
      return this.httpClient.post<{ qrCodeImageBase64: string; qrCodeUri: string; manualEntryKey: string; issuer: string }>(endpoint, { userName }).pipe(
        catchError(this.errorHandler.bind(this))
      );
    }

    verifyMFA(userName: string, code: string, deviceName?: string): Observable<{ success: boolean; message?: string }> {
      const endpoint = `${this.mfaUrl}${apiEndpoints.confirmMfaSetup}`;
      return this.httpClient.post<{ success: boolean; message?: string }>(endpoint, { userId: userName, TotpCode: code, deviceName }).pipe(
        catchError(this.errorHandler.bind(this))
      );
    }

    disableMFA(userName: string, totpCode: string): Observable<{ success: boolean; message?: string }> {
      const endpoint = `${this.mfaUrl}${apiEndpoints.disableMFA}`;
      return this.httpClient.post<{ success: boolean; message?: string }>(
        endpoint,
        { UserId: userName, TotpCode: totpCode }
      ).pipe(catchError(this.errorHandler.bind(this)));
    }

    private errorHandler(error: HttpErrorResponse): Observable<never> {
    return throwError(() => error.message || 'Server Error');
  }
}
