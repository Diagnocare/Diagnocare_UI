import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { VisitScheduleService } from 'src/app/services/visitScheduleServices/visit-schedule.service';
import { TokenService }         from 'src/app/core/interceptors/token.service';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { VisitScheduleGetDto }  from 'src/app/models/visitSchedule/visit-schedule.dto';
import {
  VisitCompleteModalComponent,
  VisitCompletionData,
} from 'src/app/shared/visit-complete-modal/visit-complete-modal.component';

@Component({
  selector:    'app-my-visits',
  standalone:  true,
  imports:     [CommonModule, LoadingSpinnerComponent, VisitCompleteModalComponent],
  templateUrl: './my-visits.component.html',
  styleUrls:   ['./my-visits.component.scss'],
})
export class MyVisitsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  visits:    VisitScheduleGetDto[] = [];
  isLoading  = false;
  today      = new Date();
  memberId   = 0;

  // Mark-complete modal
  completingVisit: VisitScheduleGetDto | null = null;
  savingComplete   = false;

  // View-details modal (reuses the same modal in viewMode)
  viewingVisit: VisitScheduleGetDto | null = null;
  openViewDetails(visit: VisitScheduleGetDto): void { this.viewingVisit = visit; }
  closeViewDetails(): void { this.viewingVisit = null; }

  constructor(
    private _visitSvc:  VisitScheduleService,
    private _tokenSvc:  TokenService,
    private toastr:     ToastrService,
  ) {}

  ngOnInit(): void {
    const uid = this._tokenSvc.decodeToken()?.uid;
    if (uid && !isNaN(Number(uid))) this.memberId = +uid;
    this.loadVisits();
  }

  loadVisits(): void {
    if (!this.memberId) { this.visits = []; return; }
    this.isLoading = true;
    const todayStr = this.today.toISOString().split('T')[0];
    this._visitSvc.getMyVisits(this.memberId, todayStr)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => { this.visits = data; this.isLoading = false; },
        error: ()  => { this.visits = [];   this.isLoading = false; },
      });
  }

  openCompleteModal(visit: VisitScheduleGetDto): void {
    this.completingVisit = visit;
  }

  onCompleteConfirmed(data: VisitCompletionData): void {
    if (!this.completingVisit) return;
    this.savingComplete = true;

    this._visitSvc.update({
      id:                    this.completingVisit.id,
      status:                1,
      completionRemark:      data.remark      || undefined,
      completionLocation:    data.location    || undefined,
      completionPhotoBase64: data.photoBase64 || undefined,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.toastr.success('Visit marked as completed!', 'Done');
        this.savingComplete  = false;
        this.completingVisit = null;
        // Reload from server so the completion evidence (remark, GPS, photo)
        // is available when the user taps "View Details" on the green bar.
        this.loadVisits();
      },
      error: () => {
        this.toastr.error('Failed to update.', 'Error');
        this.savingComplete = false;
      },
    });
  }

  onCompleteCancelled(): void {
    this.completingVisit = null;
    this.savingComplete  = false;
  }

  formatTime(t: string): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  get pendingCount(): number { return this.visits.filter(v => v.status === 'Pending').length; }
  get doneCount():    number { return this.visits.filter(v => v.status === 'Completed').length; }

  get dateLabel(): string {
    return this.today.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }
}
