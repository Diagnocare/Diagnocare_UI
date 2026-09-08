import { CommonModule } from '@angular/common';
import {
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SampleGroupService } from 'src/app/services/sampleServices/sample-group.service';
import {
  SampleBreakdownDto,
  SampleGroupDto,
  SampleTestDto,
} from 'src/app/models/sample/sample-breakdown.model';

/**
 * How many samples this set of tests needs, and how many tests run off each.
 *
 * The one screen element that answers "how many tubes am I drawing?". Before this, a
 * five-test booking that needs a single EDTA tube looked like five separate collections
 * everywhere it appeared — five protocol blocks, five printed labels — and the operator had
 * to de-duplicate them in their head.
 *
 * Self-fetching, because it is dropped into three unrelated screens and threading the data
 * through each of their components would mean three copies of the same loading, error and
 * empty handling. Give it either a basket of `testCodes` or an existing `testRegId`.
 *
 * The counts are the point, so they are stated as counts and never inferred from the length
 * of a list the panel might have failed to load: when the fetch fails the panel says it
 * could not work the samples out, rather than showing zero, which someone would read as
 * "no sample needed".
 */
@Component({
  selector: 'app-sample-summary-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sample-summary-panel.component.html',
  styleUrls: ['./sample-summary-panel.component.css'],
})
export class SampleSummaryPanelComponent implements OnChanges, OnDestroy {
  /** Test codes to break down. Use this before a booking exists. */
  @Input() testCodes: string[] | null = null;

  /** An existing booking to break down. Takes precedence over `testCodes` when both are set. */
  @Input() testRegId: number | null = null;

  /** Renders the heading. Off where the caller already has one. */
  @Input() showHeading = true;

  /**
   * Collapses each sample to its headline line, hiding the list of tests it carries. Used
   * where the panel sits above a full protocol list that names them all anyway.
   */
  @Input() compact = false;

  breakdown: SampleBreakdownDto | null = null;
  loading = false;
  errorMessage = '';

  private readonly destroy$ = new Subject<void>();
  /** Guards against a slower earlier response landing after a newer one. */
  private requestSeq = 0;

  constructor(private sampleService: SampleGroupService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['testCodes'] || changes['testRegId']) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    const seq = ++this.requestSeq;
    this.errorMessage = '';

    const codes = (this.testCodes ?? []).filter(c => !!c);
    const regId = this.testRegId ?? 0;

    if (regId <= 0 && codes.length === 0) {
      this.breakdown = null;
      this.loading = false;
      return;
    }

    this.loading = true;

    const request$ =
      regId > 0
        ? this.sampleService.getForBooking(regId)
        : this.sampleService.getForTestCodes(codes);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: b => {
        if (seq !== this.requestSeq) return;
        this.breakdown = b;
        this.loading = false;
      },
      // Not the same as "no samples", and must never be shown as one. A collector who reads
      // a blank panel concludes there is nothing to draw.
      error: () => {
        if (seq !== this.requestSeq) return;
        this.breakdown = null;
        this.loading = false;
        this.errorMessage = 'The sample breakdown could not be worked out. Check the protocols before collecting.';
      },
    });
  }

  get samples(): SampleGroupDto[] {
    return this.breakdown?.samples ?? [];
  }

  get hasSamples(): boolean {
    return this.samples.length > 0;
  }

  get sampleCount(): number {
    return this.breakdown?.sampleCount ?? 0;
  }

  get testCount(): number {
    return this.breakdown?.testCount ?? 0;
  }

  get testsWithoutProtocol(): SampleTestDto[] {
    return this.breakdown?.testsWithoutProtocol ?? [];
  }

  /** "2 samples · 5 tests" — the whole answer in one line. */
  get headlineText(): string {
    const s = `${this.sampleCount} ${this.sampleCount === 1 ? 'sample' : 'samples'}`;
    const t = `${this.testCount} ${this.testCount === 1 ? 'test' : 'tests'}`;
    return `${s} · ${t}`;
  }

  /** "5 tests", plus the draw count only when a test repeats the same collection. */
  countText(g: SampleGroupDto): string {
    const tests = `${g.testCount} ${g.testCount === 1 ? 'test' : 'tests'}`;
    return g.drawCount > g.testCount ? `${tests} · ${g.drawCount} draws` : tests;
  }

  fastingText(g: SampleGroupDto): string {
    if (!g.fastingRequired) return '';
    return g.fastingHours && g.fastingHours > 0
      ? `Fasting ${g.fastingHours} h`
      : 'Fasting required';
  }

  testNames(g: SampleGroupDto): string {
    return (g.tests ?? []).map(t => t.testName).join(', ');
  }

  trackBySample(_i: number, g: SampleGroupDto): string {
    return g.sampleKey;
  }
}
