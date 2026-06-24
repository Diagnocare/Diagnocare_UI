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
}

@Injectable({ providedIn: 'root' })
export class ConfirmModalService {
  private openSubject = new Subject<ConfirmOptions>();
  private resultSubject = new Subject<boolean>();
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

  /** Called internally by ConfirmModalComponent to resolve the dialog. */
  resolve(result: boolean): void {
    this.resultSubject.next(result);
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
