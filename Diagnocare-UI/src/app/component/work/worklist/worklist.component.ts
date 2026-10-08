import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { WorklistService } from 'src/app/services/worklistServices/worklist.service';
import { WorklistItem, WorklistPage } from 'src/app/models/worklist/worklist.models';
import {
  WorkQueue,
  WORK_QUEUE_ORDER,
  WORK_QUEUE_META,
  queueVerb,
  progressLabel,
  waitingLabel,
  waitingTone,
  defaultQueueForRole,
} from 'src/app/utilities/work-queue.util';
import {
  DcQueueTabsComponent,
  DcQueueTab,
} from 'src/app/shared/simple/dc-queue-tabs.component';
import { DcEmptyComponent } from 'src/app/shared/simple/dc-empty.component';
import { DcSearchComponent } from 'src/app/shared/simple/dc-search.component';
import { MarkCollectedModalComponent } from '../mark-collected/mark-collected-modal.component';
import { RecallReportModalComponent } from '../recall-report/recall-report-modal.component';
import { AssignCollectorModalComponent } from '../assign-collector/assign-collector-modal.component';
import { SampleCollectionService } from 'src/app/services/sampleCollectionServices/sample-collection.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { Role } from 'src/app/constant/enums';

/**
 * The worklist — the lab's home screen.
 *
 * What this replaces
 * ──────────────────
 * Reaching a test used to mean: open the patient list, choose a status from a
 * dropdown, set a date range, press Search, find the patient, open their tests,
 * pick a filter toggle, find the booking in a card deck, open a details overlay,
 * find the test in a second card deck, and open a third overlay. Five levels,
 * two invented interactions, four filter controls — and a new employee had to be
 * told which combination meant "my work for today".
 *
 * Here the work is the screen. Five queues across the top with live counts, the
 * selected queue's rows beneath, and one button per row carrying the verb for
 * that queue. A technician's whole day is: pick the tile with a number in it,
 * work down the list.
 *
 * Two questions the old module needed training for stop being askable:
 *
 *   "Where do I find a patient's tests?"  — the work is already listed.
 *   "Which filter do I use?"              — there are no filters to choose.
 *
 * The counts do the teaching. Someone who saves one set of results and watches
 * "Awaiting results" drop from 17 to 16 while "To verify" climbs has learnt the
 * whole model in one action, without being told anything.
 */
@Component({
  selector: 'app-worklist',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DcQueueTabsComponent,
    DcEmptyComponent,
    DcSearchComponent,
    MarkCollectedModalComponent,
    RecallReportModalComponent,
    AssignCollectorModalComponent,
  ],
  templateUrl: './worklist.component.html',
  styleUrls: ['./worklist.component.scss'],
})
export class WorklistComponent implements OnInit, OnDestroy {
  // ── State ───────────────────────────────────────────────────────────────
  page: WorklistPage | null = null;
  items: WorklistItem[] = [];
  queue: WorkQueue = 'awaiting-results';
  searchTerm = '';

  isLoading = false;
  errorMessage = '';

  /** The row whose sample is being recorded, or null when the modal is closed. */
  collectingItem: WorklistItem | null = null;

  /** The issued report being pulled back, or null when the modal is closed. */
  recallingItem: WorklistItem | null = null;

  /** The row whose pickup is being (re)assigned to a collection boy. */
  assigningItem: WorklistItem | null = null;

  /** testRegId currently being marked received, so its button can show progress. */
  receivingId: number | null = null;

  pageNumber = 1;
  readonly pageSize = 50;

  /** Re-exported for the template so the queue vocabulary stays in one file. */
  readonly queueVerb = queueVerb;
  readonly progressLabel = progressLabel;
  readonly waitingLabel = waitingLabel;
  readonly waitingTone = waitingTone;

  private readonly destroy$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  constructor(
    private worklist: WorklistService,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private sampleCollection: SampleCollectionService,
    private tokenService: TokenService,
  ) {}

  /**
   * Receiving a sample from a collection boy is technician work — the API's
   * TestResultEntry policy (Super Admin, Admin, Lab Assistant). Anyone else sees
   * who it is waiting on instead of a button that would be refused.
   */
  get canReceive(): boolean {
    return this.tokenService.hasRole(Role.Assistant.id, Role.Admin.id, Role.Super_Admin.id);
  }

  ngOnInit(): void {
    // Land on the queue this person's role actually owns. A lab assistant opens
    // on results to enter; a receptionist on reports to hand over. Opening
    // everyone on the same list means most people's first action is navigation.
    this.queue = this.readQueueFromUrl() ?? defaultQueueForRole(this.currentRoleId());

    // Debounced, server-side, and the term survives paging and queue changes —
    // unlike the patient list, where switching page silently dropped what you
    // had typed while leaving it visible in the box.
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(term => {
        this.searchTerm = term;
        this.pageNumber = 1;
        this.load();
      });

    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Loading ─────────────────────────────────────────────────────────────

  load(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.worklist
      .getWorklist({
        // The selected tile governs the list at all times, search included. A
        // search that quietly dropped the queue filter returned rows from every
        // queue while one tile stayed highlighted, so the list disagreed with the
        // tile above it and the count on that tile described neither. Matches in
        // other queues are not lost — the counts show where they are, one click
        // away. A search still reaches past the default date window; that part is
        // the server's doing and is what makes older work findable.
        queue: this.queue,
        searchTerm: this.searchTerm || null,
        pageNumber: this.pageNumber,
        pageSize: this.pageSize,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: page => {
          this.page = page;
          this.items = page.items ?? [];
          this.isLoading = false;
        },
        error: () => {
          // The interceptor surfaces the message; this just leaves the screen in
          // an honest state rather than showing a stale list as if it were current.
          this.page = null;
          this.items = [];
          this.errorMessage = 'Could not load the worklist. Please try again.';
          this.isLoading = false;
        },
      });
  }

  refresh(): void {
    this.load();
  }

  // ── Queues ──────────────────────────────────────────────────────────────

  /** The tiles: every queue, always, with its live count. */
  get queueTabs(): DcQueueTab[] {
    const counts = new Map(
      (this.page?.counts ?? []).map(c => [c.queue as string, c.count]),
    );

    return WORK_QUEUE_ORDER.map(key => ({
      key,
      label: WORK_QUEUE_META[key].label,
      hint: WORK_QUEUE_META[key].hint,
      count: counts.get(key) ?? 0,
      tone: WORK_QUEUE_META[key].tone,
      icon: WORK_QUEUE_META[key].icon,
    }));
  }

  onQueueChange(key: string): void {
    this.queue = key as WorkQueue;
    this.pageNumber = 1;

    // Reflected in the URL so a queue can be bookmarked, shared with a colleague
    // and survive a refresh — the thing a dropdown filter could never do.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { queue: this.queue },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });

    this.load();
  }

  onSearch(term: string): void {
    this.search$.next((term ?? '').trim());
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.pageNumber = 1;
    this.load();
  }

  // ── Row actions ─────────────────────────────────────────────────────────

  /**
   * The row's one action. Where it goes depends on the queue, which is why the
   * button can carry the queue's verb and always be right.
   *
   * Interim routing: verification has its own screen, but result entry still
   * hands off to the existing patient-tests screen, because the single-page
   * order workspace it should open is not built yet. That costs a click or two
   * at the end of the journey and is the one place this flow is not yet the
   * one-click version. When the workspace lands, only this method changes —
   * every destination below becomes /orders/:testRegId with the same params.
   */
  open(item: WorklistItem): void {
    // Recording a collection is one choice from a short list, so it is asked in
    // place. Navigating away would cost the person their position in a queue
    // they are working down, and they would have to find their way back for the
    // next row.
    if (item.queue === 'to-collect') {
      this.collectingItem = item;
      return;
    }

    if (item.queue === 'to-receive') {
      this.markReceived(item);
      return;
    }

    if (item.queue === 'to-verify') {
      this.router.navigate(['/work/verify', item.testRegId], {
        queryParams: { testCode: item.testCode },
      });
      return;
    }

    // 'returned' falls through to result entry below: redoing rejected results
    // is the same job as finishing unfinished ones, and the reason travels on
    // the row rather than down a separate path.

    // Everything else lands on the patient's orders. The extra params are
    // ignored by that screen today and are what the order workspace will read.
    this.router.navigate(['/patient-tests'], {
      queryParams: {
        patientId: item.patientId,
        orderId: item.testRegId,
        testCode: item.testCode,
      },
    });
  }

  /**
   * The sample was recorded: close the modal and reload.
   *
   * A full reload rather than patching the row in place, because one collection
   * moves every test on that booking at once — the row that was clicked is
   * rarely the only one that changed, and the queue counts above have to move
   * with them. Those counts are the screen's only navigation; leaving them
   * stale is worse than a moment's spinner.
   */
  onCollected(): void {
    this.collectingItem = null;
    this.load();
  }

  onCollectCancelled(): void {
    this.collectingItem = null;
  }

  /** Opens the collection-boy picker for a row still waiting to be collected. */
  assign(item: WorklistItem, event: Event): void {
    event.stopPropagation();
    this.assigningItem = item;
  }

  onAssigned(): void {
    this.assigningItem = null;
    this.load();
  }

  onAssignCancelled(): void {
    this.assigningItem = null;
  }

  /**
   * The lab has the sample in hand. One click, no dialog: the technician is
   * standing at the bench with the tube, and the row already names the patient
   * and order. Reloads because every test on the booking moves at once.
   */
  markReceived(item: WorklistItem): void {
    if (this.receivingId !== null) return;
    this.receivingId = item.testRegId;

    this.sampleCollection.markReceived(item.testRegId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: res => {
          this.receivingId = null;
          this.toastr.success(res?.message || 'Sample received.', 'Received at lab');
          this.load();
        },
        error: err => {
          this.receivingId = null;
          this.toastr.error(err?.error?.error || 'Could not record that. Please try again.', 'Not saved');
        },
      });
  }

  /** "Ravi Kumar · collected 2h" — where a pickup stands, for the Results column. */
  collectionText(item: WorklistItem): string {
    const who = item.collectionAssignedToName || 'collection boy';
    if (item.queue === 'to-receive') {
      const ago = waitingLabel(item.sampleCollectedAt);
      return `Collected by ${who}${ago ? ' · ' + ago + ' ago' : ''}`;
    }
    return item.collectionAssignedTo ? `Pickup: ${who}` : 'No pickup assigned';
  }

  /** Opens the recall confirmation for an issued report. */
  recall(item: WorklistItem, event: Event): void {
    event.stopPropagation();
    this.recallingItem = item;
  }

  /**
   * The report was pulled back: reload so it leaves Ready to print and appears
   * in Returned, and both counts move together.
   */
  onRecalled(): void {
    this.recallingItem = null;
    this.load();
  }

  onRecallCancelled(): void {
    this.recallingItem = null;
  }

  /** Opens the patient's record — the container, now reachable rather than required. */
  openPatient(item: WorklistItem, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/patient-tests'], {
      queryParams: { patientId: item.patientId },
    });
  }

  // ── Template helpers ────────────────────────────────────────────────────

  /**
   * The tone for a row's elapsed-time chip. Urgent bookings are held to a
   * tighter clock, because that is what marking something urgent was meant to buy.
   */
  waitTone(item: WorklistItem): string {
    return waitingTone(item.bookedAt, item.urgent);
  }

  waitText(item: WorklistItem): string {
    return waitingLabel(item.bookedAt);
  }

  progressText(item: WorklistItem): string {
    return progressLabel(item.savedResultCount, item.parameterCount);
  }

  /**
   * How far along this test is, 0–100, for the bar under the fraction.
   *
   * The bar exists so the column can be scanned without reading every number —
   * "which of these thirty is nearly done" is answered by shape rather than by
   * arithmetic. Clamped because a stray extra result row must not draw a bar
   * wider than its track.
   */
  progressPct(item: WorklistItem): number {
    const total = item.parameterCount ?? 0;
    if (total <= 0) return 0;
    const saved = item.savedResultCount ?? 0;
    return Math.max(0, Math.min(100, Math.round((saved / total) * 100)));
  }

  /** The selected queue's label, for copy that has to name it. */
  get currentQueueLabel(): string {
    return WORK_QUEUE_META[this.queue].label;
  }

  /**
   * How many rows the current search matched in the queues the user is NOT
   * looking at. This is what turns an empty result into a signpost: the row they
   * are hunting for is usually a tile away, not absent.
   */
  get matchesInOtherQueues(): number {
    if (!this.searchTerm) return 0;
    return (this.page?.counts ?? [])
      .filter(c => c.queue !== this.queue)
      .reduce((sum, c) => sum + (c.count ?? 0), 0);
  }

  get emptyTitle(): string {
    if (this.searchTerm) return `No match in ${this.currentQueueLabel.toLowerCase()}`;
    return `Nothing in ${WORK_QUEUE_META[this.queue].label.toLowerCase()}`;
  }

  get emptyMessage(): string {
    if (this.searchTerm) {
      const elsewhere = this.matchesInOtherQueues;
      if (elsewhere > 0) {
        return elsewhere === 1
          ? 'One match is in another queue — the tiles above show which one.'
          : `${elsewhere} matches are in other queues — the tiles above show which ones.`;
      }
      return 'Try just the first few letters of the patient’s name, or the order number from the sample label.';
    }
    // An empty queue is good news here, so say so. "No records found" reads like
    // a failure for something that actually means the work is done.
    return 'Nothing is waiting in this queue. Pick another tile above to see the rest of today’s work.';
  }

  trackByItem = (_: number, item: WorklistItem) => `${item.testRegId}:${item.testCode}`;

  // ── Private ─────────────────────────────────────────────────────────────

  private readQueueFromUrl(): WorkQueue | null {
    const raw = this.route.snapshot.queryParamMap.get('queue');
    return WORK_QUEUE_ORDER.includes(raw as WorkQueue) ? (raw as WorkQueue) : null;
  }

  /**
   * The signed-in user's role id, used only to choose a landing queue.
   *
   * Read defensively: a missing or malformed value must land the user on a
   * sensible queue rather than throw on the app's home screen.
   */
  private currentRoleId(): number | null {
    try {
      const raw = localStorage.getItem('typeUserId') ?? localStorage.getItem('roleId');
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      return null;
    }
  }
}
