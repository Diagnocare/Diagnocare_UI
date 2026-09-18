import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  hideCancelButton?: boolean;
  /** When true, clicking Confirm shows a loading spinner instead of closing the modal.
   *  The caller must call dismiss() once the async operation completes. */
  showLoadingOnConfirm?: boolean;
  /** When true, the dialog shows a free-text reason field. Use confirmWithReason()
   *  to receive the entered value. */
  showReasonInput?: boolean;
  /** Label shown above the reason field. */
  reasonLabel?: string;
  /** Placeholder text inside the reason field. */
  reasonPlaceholder?: string;
  /** When true, Confirm is disabled until a non-empty reason is entered. */
  reasonRequired?: boolean;
}

/** Result of a dialog that captured a reason. */
export interface ConfirmResult {
  confirmed: boolean;
  reason: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmModalService {
  private openSubject = new Subject<ConfirmOptions>();
  private resultSubject = new Subject<boolean>();
  private resultDetailSubject = new Subject<ConfirmResult>();
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private dismissSubject = new Subject<void>();

  /** Stream that ConfirmModalComponent listens to in order to open itself. */
  open$ = this.openSubject.asObservable();

  /** Stream that drives the loading spinner state inside the modal. */
  loading$ = this.loadingSubject.asObservable();

  /** Stream that tells the modal to close (used when showLoadingOnConfirm is true). */
  dismiss$ = this.dismissSubject.asObservable();

  /**
   * Show a confirmation dialog and return an Observable that emits
   * `true` when the user confirms or `false` when they cancel.
   */
  confirm(options: ConfirmOptions): Observable<boolean> {
    this.loadingSubject.next(false);
    this.openSubject.next(options);
    return new Observable<boolean>(observer => {
      const sub = this.resultSubject.subscribe(result => {
        observer.next(result);
        observer.complete();
        sub.unsubscribe();
      });
    });
  }

  /**
   * Show a confirmation dialog with a reason field and return an Observable that
   * emits { confirmed, reason }. Forces showReasonInput on.
   */
  confirmWithReason(options: ConfirmOptions): Observable<ConfirmResult> {
    this.loadingSubject.next(false);
    this.openSubject.next({ ...options, showReasonInput: true });
    return new Observable<ConfirmResult>(observer => {
      const sub = this.resultDetailSubject.subscribe(result => {
        observer.next(result);
        observer.complete();
        sub.unsubscribe();
      });
    });
  }

  /** Called internally by ConfirmModalComponent to resolve the dialog. */
  resolve(result: boolean, reason: string = ''): void {
    this.resultSubject.next(result);
    this.resultDetailSubject.next({ confirmed: result, reason });
  }

  /** Show/hide the loading spinner on the confirm button. */
  setLoading(loading: boolean): void {
    this.loadingSubject.next(loading);
  }

  /** Close the modal programmatically (after an async operation completes). */
  dismiss(): void {
    this.loadingSubject.next(false);
    this.dismissSubject.next();
  }
}
