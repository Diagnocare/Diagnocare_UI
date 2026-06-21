import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';

import { TokenService } from '../../core/interceptors/token.service';
import { LoginService } from '../loginServices/login.service';
import { getDiagnocareApiUrl } from '../../shared/api-base-url.util';

/**
 * Maintains a persistent SignalR WebSocket connection to /hubs/session.
 *
 * The server places each connection into group "user:{userId}" and pushes
 * a "sessionCheck" event whenever a new session is established for that user.
 * On receipt, this service fires a ping; if the current session was superseded
 * the auth interceptor receives SESSION_TERMINATED and redirects to /login.
 *
 * The 30-second HTTP poll in AppComponent acts as a fallback for the rare case
 * where the WebSocket connection is unavailable or drops.
 */
@Injectable({ providedIn: 'root' })
export class SessionSignalRService implements OnDestroy {
  private hubConnection: signalR.HubConnection | null = null;

  constructor(
    private tokenService: TokenService,
    private loginService: LoginService,
  ) {}

  /** Connect to the session hub. Idempotent — safe to call multiple times. */
  start(): void {
    if (this.hubConnection) return;

    const baseUrl = getDiagnocareApiUrl().replace(/\/+$/, '');

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${baseUrl}/hubs/session`, {
        // SignalR sends this as ?access_token= on the WebSocket upgrade request
        // (custom headers are not supported during a WebSocket handshake).
        accessTokenFactory: () => this.tokenService.getToken() ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.hubConnection.on('sessionCheck', () => {
      // Server notified us that a new session was established for this user —
      // our session has been displaced.
      //
      // Mark terminated FIRST (removes token from sessionStorage immediately)
      // so that between now and when the ping 401 arrives, no sibling tab can
      // pick up our stale token via a `request-token` broadcast and hand it
      // back to us, which would cause a /pathology ↔ /login flicker loop.
      //
      // The auth interceptor then handles the resulting 401 and redirects to
      // /login with reason=session_terminated.
      this.tokenService.markSessionTerminated();
      this.loginService.ping().subscribe({ error: () => {} });
    });

    this.hubConnection
      .start()
      .catch((err: unknown) => console.warn('[SessionSignalR] Connection failed:', err));
  }

  /** Disconnect and reset. Called when navigating to /login or on app destroy. */
  stop(): void {
    if (this.hubConnection) {
      this.hubConnection.stop();
      this.hubConnection = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
