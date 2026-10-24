import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { TestReportService } from 'src/app/services/patientTestReportServices/test-report-service';
import { WorklistService } from 'src/app/services/worklistServices/worklist.service';
import { DcStatusComponent } from 'src/app/shared/simple/dc-status.component';
import { DcNoteComponent } from 'src/app/shared/simple/dc-note.component';

/**
 * One row on the verification screen: a parameter, its value, and whether that
 * value sits inside the reference range.
 */
export interface VerifyRow {
  parameterId: number;
  parameterName: string;
  parameterUnit: string;
  parameterRange: string;
  value: string;

  /** True when the value falls outside the reference range. */
  abnormal: boolean;
  /** 'HIGH' | 'LOW' | '' — shown beside an abnormal value. */
  direction: string;
  /** False when the range could not be parsed, so nothing is claimed about it. */
  rangeUnderstood: boolean;
}

/**
 * Verification — the sign-off step.
 *
 * Why this screen exists at all
 * ────────────────────────────
 * Before it, nothing stood between a typed value and a printed clinical report.
 * The moment the last parameter saved, the report endpoint would render, and
 * whoever was at the bench could hand a patient a finished, official-looking
 * document. No second pair of eyes, and no record of whose judgement it
 * represented.
 *
 * This is also what lets the word "Generate" disappear from the product. Saving
 * the last result moves the test into the "to verify" queue on its own; pressing
 * the button here is what issues the report. Report generation stops being an
 * action somebody performs and becomes a consequence of a decision somebody
 * made — which is the version a lab can actually stand behind.
 *
 * What the screen shows, in priority order:
 *   1. Anything outside its reference range, called out at the top.
 *   2. Every value, with its range beside it.
 *   3. Who entered them and when.
 *
 * The verifier's two real options sit side by side: sign it, or send it back
 * with a reason. Sending back without a reason is refused, because that is how
 * the same value gets re-entered unchanged and returned again.
 */
@Component({
  selector: 'app-verify-results',
  standalone: true,
  imports: [CommonModule, FormsModule, DcStatusComponent, DcNoteComponent],
  templateUrl: './verify-results.component.html',
  styleUrls: ['./verify-results.component.scss'],
})
export class VerifyResultsComponent implements OnInit, OnDestroy {
  testRegId = 0;
  testCode = '';

  rows: VerifyRow[] = [];
  isLoading = false;
  isSaving = false;
  errorMessage = '';

  /** Optional note kept with the sign-off. */
  comment = '';

  /** Required when sending results back. */
  returnReason = '';
  showReturnPanel = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private testReportService: TestReportService,
    private worklist: WorklistService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    this.testRegId = Number(this.route.snapshot.paramMap.get('id'));
    this.testCode = this.route.snapshot.queryParamMap.get('testCode') ?? '';

    if (!this.testRegId || !this.testCode) {
      this.errorMessage = 'This link is missing the order or the test. Open it again from the worklist.';
      return;
    }

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

    this.testReportService
      .getSavedTestReport(this.testRegId, this.testCode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (saved: any[]) => {
          this.rows = (saved ?? []).map(s => this.toRow(s));
          this.isLoading = false;
        },
        error: () => {
          this.errorMessage = 'Could not load these results. Please try again.';
          this.isLoading = false;
        },
      });
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  get abnormalRows(): VerifyRow[] {
    return this.rows.filter(r => r.abnormal);
  }

  get missingCount(): number {
    return this.rows.filter(r => !(r.value || '').trim()).length;
  }

  /**
   * Whether this can be signed off at all.
   *
   * A blank value must block the sign-off: a report rendered with one comes out
   * with an empty line while still looking like a finished, signed document —
   * which is worse than no report.
   */
  get canVerify(): boolean {
    return this.rows.length > 0 && this.missingCount === 0 && !this.isSaving;
  }

  get blockedReason(): string {
    if (this.rows.length === 0) return 'This test has no parameters set up, so there is nothing to sign off.';
    const n = this.missingCount;
    if (n === 0) return '';
    return n === 1
      ? 'One result has not been entered yet, so this cannot be signed off.'
      : `${n} results have not been entered yet, so this cannot be signed off.`;
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  verify(): void {
    if (!this.canVerify) return;

    this.isSaving = true;

    this.worklist
      .verify({ testRegId: this.testRegId, testCode: this.testCode, comment: this.comment || null })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.toastr.success('Report issued. It is now ready to print.', 'Signed off');
          // Back to the queue, which has already moved this item on — the count
          // dropping is the confirmation that the action landed.
          this.router.navigate(['/work'], { queryParams: { queue: 'to-verify' } });
        },
        error: () => {
          this.isSaving = false;
          this.toastr.error('Could not sign this off. Please try again.', 'Not saved');
        },
      });
  }

  openReturnPanel(): void {
    this.showReturnPanel = true;
  }

  cancelReturn(): void {
    this.showReturnPanel = false;
    this.returnReason = '';
  }

  returnForReentry(): void {
    const reason = (this.returnReason || '').trim();
    if (!reason) {
      this.toastr.warning('Please say what needs redoing, so the bench knows what to change.', 'Reason needed');
      return;
    }

    this.isSaving = true;

    this.worklist
      .returnForReentry({ testRegId: this.testRegId, testCode: this.testCode, reason })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.toastr.success('Sent back to the bench.', 'Returned');
          this.router.navigate(['/work'], { queryParams: { queue: 'to-verify' } });
        },
        error: () => {
          this.isSaving = false;
          this.toastr.error('Could not send this back. Please try again.', 'Not saved');
        },
      });
  }

  back(): void {
    this.router.navigate(['/work'], { queryParams: { queue: 'to-verify' } });
  }

  trackByRow = (_: number, row: VerifyRow) => row.parameterId;

  // ── Private ─────────────────────────────────────────────────────────────

  private toRow(s: any): VerifyRow {
    const value = (s?.obtainedValue ?? '').toString();
    const range = (s?.parameterRange ?? '').toString();
    const check = this.checkRange(value, range);

    return {
      parameterId: s?.parameterId ?? 0,
      parameterName: s?.parameterName ?? '',
      parameterUnit: s?.parameterUnit ?? '',
      parameterRange: range,
      value,
      abnormal: check.abnormal,
      direction: check.direction,
      rangeUnderstood: check.understood,
    };
  }

  /**
   * Compares a value against a reference range written as free text.
   *
   * Ranges in this database are strings a human typed — "13.0 - 17.0",
   * "4000-11000", "< 200", "Up to 1.2". Only the forms that can be read with
   * confidence are acted on; anything else is reported as not understood rather
   * than guessed at. A wrong "HIGH" flag on a normal result is worse than no
   * flag, because it teaches the verifier to stop trusting the flags.
   */
  private checkRange(
    rawValue: string,
    rawRange: string,
  ): { abnormal: boolean; direction: string; understood: boolean } {
    const none = { abnormal: false, direction: '', understood: false };

    const value = parseFloat((rawValue || '').replace(/,/g, '').trim());
    if (!isFinite(value)) return none;

    const range = (rawRange || '').replace(/,/g, '').trim();
    if (!range) return none;

    // "13.0 - 17.0" / "13.0 to 17.0"
    const between = range.match(/^(-?\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(-?\d+(?:\.\d+)?)$/i);
    if (between) {
      const low = parseFloat(between[1]);
      const high = parseFloat(between[2]);
      if (value < low) return { abnormal: true, direction: 'LOW', understood: true };
      if (value > high) return { abnormal: true, direction: 'HIGH', understood: true };
      return { abnormal: false, direction: '', understood: true };
    }

    // "< 200" / "<= 200" / "Up to 200"
    const upper = range.match(/^(?:<=?|up\s*to)\s*(-?\d+(?:\.\d+)?)$/i);
    if (upper) {
      const high = parseFloat(upper[1]);
      return value > high
        ? { abnormal: true, direction: 'HIGH', understood: true }
        : { abnormal: false, direction: '', understood: true };
    }

    // "> 40" / ">= 40"
    const lower = range.match(/^(?:>=?)\s*(-?\d+(?:\.\d+)?)$/);
    if (lower) {
      const low = parseFloat(lower[1]);
      return value < low
        ? { abnormal: true, direction: 'LOW', understood: true }
        : { abnormal: false, direction: '', understood: true };
    }

    return none;
  }
}
