import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

/**
 * Provides the Basic Auth header value used for login-related endpoints.
 * Credentials are resolved at build time from the active environment file,
 * so each environment (dev / qa / uat / prod) can use its own username and password.
 *
 * To change credentials for an environment, update the `basicAuth` block in
 * the corresponding  src/environments/environment.<name>.ts  file.
 */
@Injectable({ providedIn: 'root' })
export class AuthConfigService {

  /**
   * Returns the pre-encoded "Basic <base64>" Authorization header value
   * for the active build environment.
   */
  getBasicAuthHeader(): string {
    const { username, password } = environment.basicAuth;
    return 'Basic ' + btoa(`${username}:${password}`);
  }
}
