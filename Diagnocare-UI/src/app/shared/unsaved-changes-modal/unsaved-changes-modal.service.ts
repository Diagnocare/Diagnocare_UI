import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { UnsavedChangesOptions } from '../../models/common/unsaved-changes.model';
import { UnsavedChangesResult } from '../../models/common/unsaved-changes.model';

@Injectable({ providedIn: 'root' })
export class UnsavedChangesModalService {
  private openSubject   = new Subject<UnsavedChangesOptions>();
  private resultSubject = new Subject<UnsavedChangesResult>();

  /** Stream that UnsavedChangesModalComponent listens to in order to open itself. */
  readonly open$ = this.openSubject.asObservable();

  /**
   * Show the unsaved-changes dialog.
   * Returns an Observable that emits exactly once with the user's choice,
   * then completes — same pattern as ConfirmModalService.
   */
  prompt(options: UnsavedChangesOptions): Observable<UnsavedChangesResult> {
    this.openSubject.next(options);
    return new Observable<UnsavedChangesResult>(observer => {
      const sub = this.resultSubject.subscribe(result => {
        observer.next(result);
        observer.complete();
        sub.unsubscribe();
      });
    });
  }

  /** Called by UnsavedChangesModalComponent to resolve the dialog. */
  resolve(result: UnsavedChangesResult): void {
    this.resultSubject.next(result);
  }
}
