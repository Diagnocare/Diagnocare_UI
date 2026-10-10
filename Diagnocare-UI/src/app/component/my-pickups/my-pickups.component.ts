import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { SampleCollectionService } from 'src/app/services/sampleCollectionServices/sample-collection.service';
import { CollectionStage, Pickup } from 'src/app/models/sampleCollection/sample-collection.model';
import { waitingLabel } from 'src/app/utilities/work-queue.util';
import { CollectionBriefComponent } from 'src/app/shared/collection-brief/collection-brief.component';

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
  imports: [CommonModule, CollectionBriefComponent],
  templateUrl: './my-pickups.component.html',
  styleUrls: ['./my-pickups.component.scss'],
})
export class MyPickupsComponent implements OnInit, OnDestroy {
  pickups: Pickup[] = [];
  isLoading = false;
  errorMessage = '';
  collectingId: number | null = null;

  readonly waitingLabel = waitingLabel;

  /** Split test codes per pickup — see `codesFor`. Cleared whenever the list reloads. */
  private readonly codeCache = new Map<number, string[]>();

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
        next: list => {
          this.pickups = list ?? [];
          this.codeCache.clear();
          this.rebuildGroups();
          this.isLoading = false;
        },
        error: () => {
          this.pickups = [];
          this.codeCache.clear();
          this.rebuildGroups();
          this.errorMessage = 'Could not load your pickups. Please try again.';
          this.isLoading = false;
        },
      });
  }

  /**
   * The three stage groups, rebuilt only when `pickups` changes.
   *
   * This used to be a getter, and that quietly broke the screen. A getter returned three
   * **new** `PickupGroup` objects on every change-detection pass, and the template's outer
   * `*ngFor` had no `trackBy`, so NgForOf — which tracks by identity by default — saw three
   * removals and three insertions every pass and destroyed the whole subtree: every card,
   * and every `app-collection-brief` inside them.
   *
   * The visible symptom was the protocol request showing as "(cancelled)" in the network
   * panel. Tapping the toggle starts the request; the click's own change-detection pass
   * destroys the component; `takeUntil(destroy$)` unsubscribes; the request is cancelled and
   * a fresh, closed panel takes its place. The inner `*ngFor` over `g.items` does carry
   * `trackById`, which is why this was easy to miss — it never got the chance to help,
   * because its whole container was being replaced above it.
   *
   * A field plus `trackByStage` on the outer loop fixes both halves: the array is stable,
   * and the loop would survive a new one anyway. It also stops three `filter()` passes over
   * every pickup on every change-detection cycle, which was never free.
   */
  groups: PickupGroup[] = [];

  /** Called wherever `pickups` is replaced. The only place `groups` is assigned. */
  private rebuildGroups(): void {
    const of = (stage: CollectionStage) => this.pickups.filter(p => p.stage === stage);
    this.groups = [
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

  /**
   * The test codes for one pickup, as a **stable** array.
   *
   * Two things make this a method with a cache rather than a getter or a template
   * expression. An array built fresh on each call is a new reference every
   * change-detection pass, and `app-collection-brief` watches that input to decide whether
   * to fetch — a new reference every pass is an endless request loop. And `testCodes`
   * arrives as one string, so it has to be split somewhere.
   *
   * The split is deliberately permissive — comma, semicolon, pipe or whitespace — because
   * the API builds this string and the delimiter is its business, not ours. Getting it wrong
   * would be a protocol section that silently shows nothing.
   */
  codesFor(p: Pickup): string[] {
    const cached = this.codeCache.get(p.testRegId);
    if (cached) return cached;

    const codes = (p.testCodes || '')
      .split(/[,;|\s]+/)
      .map(c => c.trim())
      .filter(c => c.length > 0);

    this.codeCache.set(p.testRegId, codes);
    return codes;
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

  /**
   * Keyed on the stage, which never changes, so the three group sections are never torn
   * down and rebuilt. Belt and braces alongside the `groups` field: if someone turns
   * `groups` back into a getter, the cards and their open panels still survive.
   */
  trackByStage = (_: number, g: PickupGroup) => g.stage;
}
