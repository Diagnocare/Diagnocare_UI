import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';

/** Short-lived token issued by GET api/Feedback/Token. */
export interface FeedbackTokenDto {
  token: string;
  expiresInSeconds: number;
  expiresAtUtc: string;
}

/**
 * Talks to the API endpoint that mints the token handed to the external feedback
 * portal.
 *
 * The token is NOT the session JWT — it is signed with a different key for a
 * different audience and lives for a few minutes, so it is safe(ish) to put in a
 * URL fragment. See docs/FEEDBACK_PORTAL_CONTRACT.md.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {

  private readonly url = getDiagnocareApiUrl() + controllerEndpoints.feedback;

  constructor(private httpClient: HttpClient) {}

  /**
   * Requests a fresh token for the signed-in user.
   *
   * Errors are deliberately NOT swallowed here — the caller decides what to do,
   * which in the Help page's case is "open the portal without a token and let it
   * fall back to tracking-ID lookup".
   */
  getToken(): Observable<FeedbackTokenDto> {
    return this.httpClient.get<FeedbackTokenDto>(this.url + 'Token');
  }
}
