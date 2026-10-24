import { Injectable } from '@angular/core';
import { Auth0Client, Auth0ClientOptions, User } from '@auth0/auth0-spa-js';


@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth0Client: Auth0Client;

  constructor() {
    const config: Auth0ClientOptions = {
      domain: this.getConfigValue('AUTH0_DOMAIN'),
      clientId: this.getConfigValue('AUTH0_CLIENT_ID'),
      authorizationParams: { redirect_uri: window.location.origin + '/login' }
    };

    this.auth0Client = new Auth0Client(config);
  }

  private getConfigValue(key: string): string {
    // Load from environment variables or secure configuration
    // Never hardcode sensitive credentials in source code
    const value = (window as any).__config__?.[key];
    if (!value) {
      console.warn(`Configuration value for ${key} not found`);
    }
    return value || '';
  }
  async login(): Promise<void> {
    await this.auth0Client.loginWithRedirect();
  }

  async handleRedirectCallback(): Promise<void> {
    await this.auth0Client.handleRedirectCallback();
  }

  async getUser(): Promise<User | undefined> {
    return await this.auth0Client.getUser();
  }

  async getToken(): Promise<string> {
    return await this.auth0Client.getTokenSilently();
  }

  logout(): void {
    this.auth0Client.logout({
     logoutParams:{ returnTo: window.location.origin}
    });
  }
}

