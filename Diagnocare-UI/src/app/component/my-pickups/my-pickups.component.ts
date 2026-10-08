import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { SampleCollectionService } from 'src/app/services/sampleCollectionServices/sample-collection.service';
import { CollectionStage, Pickup } from 'src/app/models/sampleCollection/sample-collection.model';
import { waitingLabel } from 'src/app/utilities/work-queue.util';

interface PickupGroup {
  stage: CollectionStage;
  title: string;
  hint: string;
  icon: string;
  items: Pickup[];
}

/**
 * The collection boy's day: samples to collect, samples to hand over at the
 * lab, and what the lab has already received.
 *
 *   To collect   → he taps "Mark collected" once the sample is drawn.
 *   To hand over → he brings it in; the lab technician marks it received on
 *                  the worklist, which moves it to Handed over here.
 *
 * Read from api/SampleCollection/MyPickups, which only ever returns the signed-in
 * collection boy's own assignments.
 */
@Component({
  selector: 'app-my-pickups',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-pickups.component.html',
  styleUrls: ['./my-pickups.component.scss'],
})
export class MyPickupsComponent implements OnInit, OnDestroy {
  pickups: Pickup[] = [];
  isLoading = false;
  errorMessage = '';
  collectingId: number | null = null;

  readonly waitingLabel = waitingLabel;

  private readonly destroy$ = new Subject<void>();

  constructor(private collection: SampleCollectionService, private toastr: ToastrService) {}

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.collection.myPickups(1)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: list => { this.pickups = list ?? []; this.isLoading = false; },
        error: () => {
          this.pickups = [];
          this.errorMessage = 'Could not load your pickups. Please try again.';
          this.isLoading = false;
        },
      });
  }

  get groups(): PickupGroup[] {
    const of = (stage: CollectionStage) => this.pickups.filter(p => p.stage === stage);
    return [
      { stage: 'to-collect', title: 'To collect', hint: 'Collect the sample, then tap Mark collected.',
        icon: 'fa-motorcycle', items: of('to-collect') },
      { stage: 'to-hand-over', title: 'Hand over at the lab', hint: 'Give these to the lab technician — they will mark them received.',
        icon: 'fa-people-carry', items: of('to-hand-over') },
      { stage: 'handed-over', title: 'Handed over', hint: 'Received by the lab.',
        icon: 'fa-check-circle', items: of('handed-over') },
    ];
  }

  get openCount(): number {
    return this.pickups.filter(p => p.stage !== 'handed-over').length;
  }

  markCollected(p: Pickup): void {
    if (this.collectingId !== null) return;
    this.collectingId = p.testRegId;
    this.collection.markCollected(p.testRegId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.collectingId = null;
          this.toastr.success(res?.message || 'Marked as collected.', 'Collected');
          this.load();
        },
        error: err => {
          this.collectingId = null;
          this.toastr.error(err?.error?.error || 'Could not save that. Please try again.', 'Not saved');
        },
      });
  }

  /** tel: link; blank when the patient has no usable number. */
  telHref(p: Pickup): string | null {
    const digits = (p.patientContact || '').replace(/[^\d+]/g, '');
    return digits.length >= 6 ? `tel:${digits}` : null;
  }

  /** Opens the address in the phone's maps app. */
  mapHref(p: Pickup): string | null {
    const where = [p.patientAddress, p.area].filter(x => (x || '').trim()).join(', ');
    return where ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}` : null;
  }

  trackById = (_: number, p: Pickup) => p.testRegId;
}
