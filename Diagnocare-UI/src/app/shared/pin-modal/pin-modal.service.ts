import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { PinModalMode } from '../../models/auth/pin-modal.model';

/**
 * PinModalService
 * ───────────────
 * Coordinates the global PIN entry / setup modal.
 *
 * Deduplication:
 *   If a modal is already open (e.g. two concurrent HTTP requests both hit an
 *   expired-token check at the same time), subsequent calls return the same
 *   pending Observable instead of opening a second modal.  All callers receive
 *   the same boolean result when the user acts.
 *
 * Two modes:
 *  • enter-pin       — user has a PIN; ask for it before refreshing the token.
 *  • setup-required  — no PIN is set; tell the user to go configure one.
 *
 * Late-subscriber problem (page refresh):
 *   On a browser page-refresh Angular's HttpClient interceptor fires
 *   synchronously inside AppComponent.ngOnInit(), BEFORE Angular has rendered
 *   the template and BEFORE PinModalComponent.ngOnInit() has subscribed.
 *   A plain Subject would lose this first emission entirely — the modal would
 *   never appear and all HTTP requests would hang.
 *
 *   Using BehaviorSubject<PinModalMode | null> solves this: the latest mode is
 *   stored and replayed to any subscriber that arrives after the emission.
 *   When the modal is resolved the subject is reset to null so a late-joining
 *   PinModalComponent (e.g. after a route change) does not re-open a stale modal.
 */
@Injectable({ providedIn: 'root' })
export class PinModalService {

  /**
   * Holds the current open request (or null when no modal is pending).
   * BehaviorSubject ensures PinModalComponent receives the mode even if it
   * subscribes after the emission (e.g. on a browser page-refresh).
   */
  private readonly openSubject   = new BehaviorSubject<PinModalMode | null>(null);
  private readonly resultSubject = new Subject<boolean>();

  /** Whether the modal is currently open (prevents duplicate opens). */
  private modalOpen = false;

  /**
   * sessionStorage key for the "PIN setup pending" flag.
   *
   * True from the moment the user chooses "Go to Settings" on the
   * setup-required modal until a PIN is actually saved or the session ends.
   * While it is set, pinSetupGuard keeps every authenticated route except
   * Settings out of reach. Without that, the setup prompt (raised by the idle
   * screen lock) could be skipped just by clicking another menu item, which
   * unlocked the session without any verification.
   *
   * Kept in sessionStorage, not in memory, so a page refresh or a URL typed
   * into the address bar cannot reset it. TokenService.removeToken() clears it
   * with the rest of the session.
   *
   * It also stops the setup modal re-opening in a loop: the Settings page
   * fires its own API calls on load. It must never be used as a reason to
   * clear the session.
   */
  static readonly PIN_SETUP_PENDING_KEY = 'pin_setup_pending';

  /**
   * PinModalComponent listens to this stream.
   * Null values (initial / post-resolve state) are filtered out so the
   * component only reacts to genuine open requests.
   */
  readonly open$ = this.openSubject.pipe(
    filter((mode): mode is PinModalMode => mode !== null),
  );

  /**
   * Shows the PIN entry modal (or returns the in-flight observable if already open).
   * Emits true  — PIN verified (token refresh should proceed).
   * Emits false — cancelled or 3 wrong attempts (caller should logout).
   */
  requestPin(): Observable<boolean> {
    return this._open('enter-pin');
  }

  /**
   * Shows the "no PIN configured" modal (or returns the in-flight observable).
   * Emits true  — user chose "Go to Settings". The caller must navigate to PIN
   *               setup and leave the session intact — it must NOT log out or
   *               clear any auth state just because no PIN exists yet.
   * Emits false — user chose "Log Out" (caller should logout).
   */
  requestPinSetup(): Observable<boolean> {
    return this._open('setup-required');
  }

  /** True while the user is on their way to / inside Settings to configure a PIN. */
  get isPinSetupPending(): boolean {
    try {
      return sessionStorage.getItem(PinModalService.PIN_SETUP_PENDING_KEY) === '1';
    } catch {
      return false;
    }
  }

  /**
   * Marks the start of the PIN-setup journey ("Go to Settings" was clicked).
   * Callers must keep the session intact — see PIN_SETUP_PENDING_KEY.
   */
  beginPinSetup(): void {
    try { sessionStorage.setItem(PinModalService.PIN_SETUP_PENDING_KEY, '1'); } catch { /* storage blocked */ }
  }

  /** Clears the setup flag — a PIN was saved, or the session ended. */
  endPinSetup(): void {
    try { sessionStorage.removeItem(PinModalService.PIN_SETUP_PENDING_KEY); } catch { /* storage blocked */ }
  }

  /**
   * Called by PinModalComponent to resolve all pending callers.
   * Resets the BehaviorSubject to null first so any component that subscribes
   * after this point does not re-open a stale modal.
   */
  resolve(success: boolean): void {
    this.modalOpen = false;
    // Clear the pending mode BEFORE emitting the result so that any subscriber
    // created in the switchMap handlers (e.g. navigation causing re-render)
    // finds the subject already at null.
    this.openSubject.next(null);
    // Subject.next() delivers to ALL current subscribers simultaneously,
    // so every concurrent requestPin/requestPinSetup caller gets the answer.
    this.resultSubject.next(success);
  }

  private _open(mode: PinModalMode): Observable<boolean> {
    if (!this.modalOpen) {
      this.modalOpen = true;
      this.openSubject.next(mode);
    }
    // Each subscriber gets exactly one emission (take(1)).
    // Because resultSubject is a plain Subject (multicasts to all subscribers),
    // calling resolve() once unblocks every concurrent caller.
    return this.resultSubject.pipe(take(1));
  }
}
