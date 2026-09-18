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
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { TestRunService } from 'src/app/services/testRunServices/test-run.service';
import {
  TestRunDto,
  TestRunHistoryDto,
} from 'src/app/models/test-run/test-run.model';

/**
 * The record of how many times a test has been run on a patient's collected sample —
 * and the place a repeat is ordered.
 *
 * A result that looks wrong is confirmed by running the test again on the sample already
 * collected. Until this existed the second run simply overwrote the first, so a report that
 * had been questioned twice looked exactly like one nobody had ever doubted.
 *
 * Two things in one modal because they are one action in practice: whoever is about to
 * repeat a test wants to see whether it has already been repeated, and why, before adding
 * another run.
 *
 * What it does not do is restore values. Results are stored once per parameter, so only the
 * newest run's numbers exist — accepting an earlier run records which result the lab stands
 * behind, and the modal says in as many words that the numbers must be re-entered. Hiding
 * that would make the screen look like it had swapped the result back.
 */
@Component({
  selector: 'app-test-run-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './test-run-modal.component.html',
  styleUrls: ['./test-run-modal.component.css'],
})
export class TestRunModalComponent implements OnChanges, OnDestroy {
  @Input() visible = false;

  /** The booking. */
  @Input() testRegId = 0;

  /** The test whose runs these are. */
  @Input() testCode = '';
  @Input() testName = '';

  /** Hides the repeat form — for a cancelled booking, or a read-only viewer. */
  @Input() readOnly = false;

  @Output() closed = new EventEmitter<void>();

  /** Emitted after a repeat is recorded or the accepted run changes, so lists can refresh. */
  @Output() changed = new EventEmitter<void>();

  history: TestRunHistoryDto | null = null;
  loading = false;
  errorMessage = '';

  // ── Repeat form ────────────────────────────────────────────────────────────
  showRepeatForm = false;
  reason = '';
  performedBy = '';
  remark = '';
  submitting = false;
  /** Set once Record is pressed, so the empty-reason error only appears after a try. */
  submitAttempted = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private testRunService: TestRunService,
    private toastr: ToastrService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.visible) return;
    if (changes['visible'] || changes['testCode'] || changes['testRegId']) {
      this.resetForm();
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  close(): void {
    this.closed.emit();
  }

  private resetForm(): void {
    this.showRepeatForm = false;
    this.reason = '';
    this.performedBy = '';
    this.remark = '';
    this.submitAttempted = false;
    this.submitting = false;
  }

  private load(): void {
    if (this.testRegId <= 0 || !this.testCode) {
      this.history = null;
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.testRunService
      .getHistory(this.testRegId, this.testCode)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: h => {
          this.history = h;
          this.loading = false;
        },
        error: () => {
          this.history = null;
          this.loading = false;
          this.errorMessage = 'The run history could not be loaded.';
        },
      });
  }

  // ── Display ────────────────────────────────────────────────────────────────

  get runs(): TestRunDto[] {
    return this.history?.runs ?? [];
  }

  /**
   * How many times the test has been run.
   *
   * A test with no recorded runs has been run once — runs are only written from the first
   * repeat onwards. Reporting 0 here would say "never done", which is not what an empty
   * table means.
   */
  get runCount(): number {
    const recorded = this.history?.runCount ?? 0;
    return recorded === 0 ? 1 : recorded;
  }

  get hasBeenRepeated(): boolean {
    return (this.history?.runCount ?? 0) > 1;
  }

  get headline(): string {
    return this.hasBeenRepeated
      ? `Run ${this.runCount} of ${this.runCount}`
      : 'Run once — never repeated';
  }

  runLabel(r: TestRunDto): string {
    return r.runNo === 1 ? `Run 1 — original` : `Run ${r.runNo} — repeat`;
  }

  // ── Recording a repeat ─────────────────────────────────────────────────────

  openRepeatForm(): void {
    this.showRepeatForm = true;
    this.submitAttempted = false;
  }

  cancelRepeatForm(): void {
    this.resetForm();
  }

  get reasonInvalid(): boolean {
    return this.submitAttempted && this.reason.trim().length === 0;
  }

  submitRepeat(): void {
    this.submitAttempted = true;

    // Enforced here as well as at the API. The reason is the only thing that makes the
    // record worth having, and a blank one is easier to refuse than to chase up later.
    if (this.reason.trim().length === 0) return;
    if (this.submitting) return;

    this.submitting = true;

    this.testRunService
      .repeat({
        testRegId: this.testRegId,
        testCode: this.testCode,
        reason: this.reason.trim(),
        performedBy: this.performedBy.trim() || null,
        remark: this.remark.trim() || null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.submitting = false;
          if (!result?.success) {
            this.toastr.error(result?.message || 'The repeat could not be recorded.');
            return;
          }
          this.toastr.success('Repeat recorded.');
          this.resetForm();
          this.load();
          this.changed.emit();
        },
        error: () => {
          this.submitting = false;
          this.toastr.error('The repeat could not be recorded.');
        },
      });
  }

  // ── Accepting a run ────────────────────────────────────────────────────────

  accept(r: TestRunDto): void {
    if (r.isAccepted || this.readOnly) return;

    this.testRunService
      .accept(r.runId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          if (!result?.success) {
            this.toastr.error(result?.message || 'The accepted run could not be changed.');
            return;
          }

          // A warning, not a success note, when the numbers no longer match the run just
          // accepted — the operator has work left to do and the report is currently wrong.
          if (result.valuesNeedReEntry) {
            this.toastr.warning(result.message, 'Values still need re-entering', {
              timeOut: 12000,
              closeButton: true,
            });
          } else {
            this.toastr.success(result.message);
          }

          this.load();
          this.changed.emit();
        },
        error: () => this.toastr.error('The accepted run could not be changed.'),
      });
  }

  trackByRun(_i: number, r: TestRunDto): number {
    return r.runId;
  }
}
