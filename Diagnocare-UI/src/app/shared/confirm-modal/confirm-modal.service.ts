import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  hideCancelButton?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmModalService {
  private openSubject = new Subject<ConfirmOptions>();
  private resultSubject = new Subject<boolean>();

  /** Stream that ConfirmModalComponent listens to in order to open itself. */
  open$ = this.openSubject.asObservable();

  /**
   * Show a confirmation dialog and return an Observable that emits
   * `true` when the user confirms or `false` when they cancel.
   */
  confirm(options: ConfirmOptions): Observable<boolean> {
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
}
