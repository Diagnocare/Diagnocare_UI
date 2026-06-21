import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Cross-tab session coordination using the BroadcastChannel API.
 *
 * When a user logs in on one browser tab, this service notifies all other
 * tabs in the same browser+origin so they can immediately detect that their
 * session has been superseded — without waiting for the next API call to
 * trigger the server-side session-validation check.
 *
 * Note: BroadcastChannel is same-browser only.  Cross-browser detection
 * still relies on the `OnTokenValidated` middleware returning 401 with
 * `X-Auth-Error: session_terminated` on the next API request.
 */
@Injectable({ providedIn: 'root' })
export class SessionBroadcastService implements OnDestroy {

  private readonly CHANNEL_NAME = 'diagnocare_session';
  private channel: BroadcastChannel;

  /** Emits the userId (login name) whenever another tab reports a new login. */
  private readonly _terminated$ = new Subject<string>();
  readonly sessionTerminated$ = this._terminated$.asObservable();

  constructor() {
    this.channel = new BroadcastChannel(this.CHANNEL_NAME);
    this.channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'NEW_LOGIN') {
        this._terminated$.next(event.data.userId as string);
      }
    };
  }

  /**
   * Broadcast to all other open tabs in this browser that the given user
   * just completed a new login here.  The other tabs will see this and
   * immediately redirect to /login if the same user is currently active.
   */
  broadcastLogin(userId: string): void {
    try {
      this.channel.postMessage({ type: 'NEW_LOGIN', userId });
    } catch {
      // BroadcastChannel may not be available in all environments — ignore.
    }
  }

  ngOnDestroy(): void {
    this._terminated$.complete();
    this.channel.close();
  }
}
