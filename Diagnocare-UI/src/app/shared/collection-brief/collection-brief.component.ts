import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { PathTestService } from 'src/app/services/pathTestServices/path-test-service';
import { TestBookingProtocolsDto } from 'src/app/models/path-test/protocol/test-protocol.model';
import { TestProtocolPanelComponent } from 'src/app/shared/test-protocol-panel/test-protocol-panel.component';
import { SampleSummaryPanelComponent } from 'src/app/shared/sample-summary-panel/sample-summary-panel.component';

/**
 * "What to collect" — the two answers a collector needs, in one place, closed by default.
 *
 * What it is for
 * ──────────────
 * The protocol library and the sample breakdown already existed, but only on the screens
 * where a booking is *made*: the person choosing tests saw them, and the person who actually
 * goes out with a needle did not. A collector working the To collect queue could see which
 * patient and which test, and had to carry "EDTA or plain? fasting? how many tubes?" in their
 * head or ring the lab.
 *
 * It answers in the order the work happens:
 *
 *   1. How many tubes, of what, for this whole visit — `app-sample-summary-panel`, keyed on
 *      the booking, because one draw covers every test on the visit and five blood tests are
 *      not five collections.
 *   2. The protocol behind each test — `app-test-protocol-panel`, full detail: patient
 *      preparation, procedure, storage, precautions, rejection criteria.
 *
 * Why it is closed by default
 * ───────────────────────────
 * The queue is a list to be worked down, and a collector who already knows a CBC is one EDTA
 * tube does not want eight protocol blocks between every row. So this is hidden until asked
 * for, and asking for it is one click that stays on the screen. It is a disclosure and not a
 * modal for the same reason the collection itself is recorded in place: nothing here should
 * cost someone their position in the queue.
 *
 * Why it loads nothing until it is opened
 * ───────────────────────────────────────
 * Two requests per row, on a fifty-row page, for detail nobody asked to see, is a hundred
 * calls to render a list. Nothing is fetched until the content is actually visible, and
 * nothing is fetched twice for the same tests while this instance is alive.
 *
 * Two ways to use it
 * ──────────────────
 * `collapsible` (the default) gives it its own toggle header — drop it in and it works, as in
 * the mark-collected dialog. A table cannot hold a disclosure that spans its columns, so the
 * worklist keeps the button in the row and renders this one open in a detail row beneath,
 * with `collapsible` off.
 *
 * A failed fetch is never shown as "nothing required". That distinction is the whole reason
 * the two panels inside it are shared components rather than markup copied per screen, and it
 * is restated here for the protocol call this component owns.
 */
@Component({
  selector: 'app-collection-brief',
  standalone: true,
  imports: [CommonModule, TestProtocolPanelComponent, SampleSummaryPanelComponent],
  templateUrl: './collection-brief.component.html',
  styleUrls: ['./collection-brief.component.css'],
})
export class CollectionBriefComponent implements OnChanges, OnDestroy {
  /**
   * The booking, for the tube count. One draw covers the whole visit, so the sample
   * breakdown is asked for the booking and not for the single test the row happens to be.
   * Null or 0 hides the sample section and leaves the protocols.
   */
  @Input() testRegId: number | null = null;

  /**
   * The one test to show the protocol for — the usual case, and the one a worklist row has.
   *
   * A scalar and not a one-element array on purpose. An array literal written in a template
   * is a fresh reference on every change-detection pass, so an input bound to `[item.code]`
   * reports itself changed forever; with a fetch behind it that is an endless request loop.
   * Callers with a real list bind `testCodes` instead, from a field they hold.
   */
  @Input() testCode = '';

  /**
   * Several tests to show protocols for, in reading order — a whole booking, where the
   * caller knows its set. Ignored when `testCode` is given. Bind a stable array, not a
   * literal: see the note above.
   */
  @Input() testCodes: string[] = [];

  /** Renders its own toggle header and starts closed. Off where the caller owns the toggle. */
  @Input() collapsible = true;

  /** Whether the content is showing. Only consulted while `collapsible` is true. */
  @Input() open = false;

  /** The label on the closed toggle. */
  @Input() toggleLabel = 'What to collect';

  /** Emitted whenever the toggle is used, so a caller can remember the choice. */
  @Output() openChange = new EventEmitter<boolean>();

  groups: TestBookingProtocolsDto[] = [];
  loading = false;
  errorMessage = '';

  /**
   * The set of codes a request has already been made for — the codes themselves, joined.
   *
   * Compared by content rather than by trusting `SimpleChanges`, because a caller binding an
   * array literal reports that input changed on every change-detection pass and a fetch
   * driven off that would never stop. This one field is what makes a request happen exactly
   * once per set of tests for as long as this instance lives: reopening its own toggle does
   * not refetch, a different booking does, and a failure sits still until `retry()` clears
   * it rather than hammering a server that has just refused.
   *
   * A host that destroys the component when it collapses (the worklist, whose detail row is
   * behind an `*ngIf`) does fetch again on the way back, which is the right answer there: a
   * protocol can be re-linked between one look and the next, and a 50-row page should not
   * hold 50 panels alive for rows nobody is reading.
   */
  private attemptedKey: string | null = null;

  private readonly destroy$ = new Subject<void>();
  /** Guards against a slower earlier response landing after a newer one. */
  private requestSeq = 0;

  constructor(private pathTestService: PathTestService) {}

  /** Whether the body is on screen. With `collapsible` off there is nothing to open. */
  get isShowing(): boolean {
    return this.collapsible ? this.open : true;
  }

  get hasSampleBreakdown(): boolean {
    return (this.testRegId ?? 0) > 0;
  }

  /**
   * Whether any test was named at all.
   *
   * When nothing was, the protocol section is left out entirely rather than showing its
   * "no protocol is recorded" state — nobody asked about a protocol, so saying none exists
   * would be inventing an answer. The tube summary still stands on its own.
   */
  get hasCodes(): boolean {
    return this.codes.length > 0;
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.loadIfNeeded();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggle(): void {
    this.open = !this.open;
    this.openChange.emit(this.open);
    this.loadIfNeeded();
  }

  /** Retry after a failure, without having to close and reopen to get one. */
  retry(): void {
    this.attemptedKey = null;
    this.loadIfNeeded();
  }

  /** Unique, non-empty codes in the order given. `testCode` wins when both are set. */
  private get codes(): string[] {
    const source = this.testCode?.trim() ? [this.testCode] : (this.testCodes ?? []);
    const seen = new Set<string>();
    return source
      .filter(c => !!c && c.trim().length > 0)
      .map(c => c.trim())
      .filter(c => (seen.has(c) ? false : (seen.add(c), true)));
  }

  /**
   * Fetches once per set of tests, and only while the content is actually on screen.
   *
   * Every entry point funnels through here — first render, a toggle, a changed input — so
   * there is one place that decides whether a request is warranted, rather than three that
   * can each fire one for the same thing.
   */
  private loadIfNeeded(): void {
    if (!this.isShowing) return;

    // Already asked for this set: either it is in flight, it arrived, or it failed and is
    // waiting on `retry()`. All three mean "do not ask again on this pass".
    const key = this.codesKey;
    if (key === this.attemptedKey) return;

    this.load(key);
  }

  private get codesKey(): string {
    return this.codes.join('|');
  }

  private load(key: string): void {
    const codes = this.codes;
    this.errorMessage = '';
    this.attemptedKey = key;

    // Nothing to ask for. `attemptedKey` is already set, so the panel settles on its empty
    // state rather than reconsidering on every pass.
    if (codes.length === 0) {
      this.groups = [];
      this.loading = false;
      return;
    }

    const seq = ++this.requestSeq;
    this.loading = true;

    /**
     * Did anything at all arrive? A cancelled request emits neither a value nor an error —
     * the stream simply completes — so without this the panel would keep its spinner for
     * the rest of the session and say nothing. That is not hypothetical: `takeUntil` on
     * `destroy$` completes the stream whenever this component is torn down, and the
     * interceptor navigates on 403 and on refresh failure, which tears pages down.
     */
    let answered = false;

    // One request for the whole set, as the protocol viewer does: a booking with eight tests
    // costs one call rather than eight. `inlineErrors` keeps the failure in this panel and,
    // more importantly, stops a 403 redirecting a collector off their pickup list.
    this.pathTestService
      .getTestProtocolsByCodes(codes, { inlineErrors: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: groups => {
          if (seq !== this.requestSeq) return;
          answered = true;
          this.groups = groups ?? [];
          this.loading = false;
        },
        // A transport failure is not "no protocol linked" and must never be rendered as one.
        //
        // `attemptedKey` deliberately stays put: nothing retries this by itself on the next
        // change-detection pass, and Try again is the one thing that clears it.
        error: (err: unknown) => {
          if (seq !== this.requestSeq) return;
          answered = true;
          this.groups = [];
          this.loading = false;
          this.errorMessage = this.describeFailure(err);
        },
        // Completed with nothing: the request was cancelled. Say so rather than spinning.
        complete: () => {
          if (seq !== this.requestSeq || answered) return;
          this.loading = false;
          this.errorMessage =
            'That request was cancelled before it finished, so the protocol is not shown. Try again.';
        },
      });
  }

  /**
   * Turns a failure into something a collector can act on, and a developer can diagnose.
   *
   * The status is named in the text on purpose. The generic version of this message sent
   * someone to ring the laboratory about what turned out to be a 403 from a role rule and a
   * 405 from a request that never reached the action — neither of which the laboratory can
   * do anything about. A number in the message is the difference between a support call and
   * a one-line fix.
   */
  private describeFailure(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;

    if (status === 403) {
      return 'Your role is not allowed to read collection protocols, so only the sample ' +
        'summary above is shown. Ask an administrator to grant protocol access.';
    }

    if (status === 404 || status === 405) {
      return `The protocol service did not accept that request (HTTP ${status}). The sample ` +
        'summary above still applies; confirm the protocol with the laboratory before collecting.';
    }

    if (status === 0) {
      return 'The protocol service could not be reached — the request did not get there at ' +
        'all. Check the connection, then try again.';
    }

    const suffix = status ? ` (HTTP ${status})` : '';
    return `Could not load the sample collection protocol${suffix}. Check with the laboratory ` +
      'before collecting.';
  }

  get hasGroups(): boolean {
    return this.groups.length > 0;
  }

  /** Tests in this set with no protocol linked at all. */
  get testsMissingProtocol(): TestBookingProtocolsDto[] {
    return this.groups.filter(g => !g.protocols?.length);
  }

  /**
   * Tests requiring fasting, with the longest fast each one demands.
   *
   * Hoisted above the protocol blocks because it is the one fact that changes what happens
   * next — a patient who has eaten has to be sent home and asked to come back, and finding
   * that out three sections into a protocol is finding it out too late.
   *
   * The longest and not the first: a test collected under protocols of 8 and 12 hours is a
   * 12-hour fast, and telling the patient 8 would waste their trip.
   */
  get fastingTests(): { testName: string; hours: number | null }[] {
    return this.groups
      .map(g => {
        const fasting = (g.protocols ?? []).filter(p => p.fastingRequired);
        if (fasting.length === 0) return null;
        const hours = fasting.reduce<number | null>(
          (max, p) =>
            p.fastingHours != null && (max == null || p.fastingHours > max) ? p.fastingHours : max,
          null,
        );
        return { testName: g.testName, hours };
      })
      .filter((x): x is { testName: string; hours: number | null } => x !== null);
  }

  fastingText(t: { testName: string; hours: number | null }): string {
    return t.hours && t.hours > 0 ? `${t.testName} — ${t.hours} h` : t.testName;
  }

  trackByGroup(_i: number, g: TestBookingProtocolsDto): string {
    return g.testCode;
  }
}
