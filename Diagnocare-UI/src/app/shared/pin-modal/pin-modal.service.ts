import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter, take } from 'rxjs/operators';

export type PinModalMode = 'enter-pin' | 'setup-required';

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
   * Emits true  — user chose "Go to Settings" (caller should refresh + navigate).
   * Emits false — user chose "Log Out" (caller should logout).
   */
  requestPinSetup(): Observable<boolean> {
    return this._open('setup-required');
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
