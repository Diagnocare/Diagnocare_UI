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

import { SampleRejectionService } from 'src/app/services/sampleRejectionServices/sample-rejection.service';
import {
  OTHER_REASON_CODE,
  SampleRejectionDto,
  SampleRejectionHistoryDto,
  SampleRejectionReasonDto,
  SampleRejectionStatus,
} from 'src/app/models/sample-rejection/sample-rejection.model';

/** The reasons for one cause, as the picker groups them. */
interface ReasonGroup {
  categoryLabel: string;
  reasons: SampleRejectionReasonDto[];
}

/**
 * Why a collected sample could not be used, and whether a fresh one is still awaited.
 *
 * Three things in one place because they are one conversation: what went wrong, whether the
 * test is still blocked, and recording that a fresh sample has arrived. Splitting them would
 * mean someone reading "sample rejected" with no way to act on it from the same screen.
 *
 * The reason list is fetched from the API rather than written here, so the picker can never
 * offer something the server refuses. The two causes — the sample was drawn badly, or the
 * protocol was not followed — are kept visibly apart in the picker, because they are the
 * split a lab acts on: one is a training problem at the collection point, the other a
 * procedure problem, and a list that mixes them tells nobody which to fix.
 */
@Component({
  selector: 'app-sample-rejection-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sample-rejection-modal.component.html',
  styleUrls: ['./sample-rejection-modal.component.css'],
})
export class SampleRejectionModalComponent implements OnChanges, OnDestroy {
  @Input() visible = false;

  /** The booking. */
  @Input() testRegId = 0;

  /** The test whose sample this is. */
  @Input() testCode = '';
  @Input() testName = '';

  /** Hides the reject and resolve actions — for a cancelled booking, or a read-only viewer. */
  @Input() readOnly = false;

  @Output() closed = new EventEmitter<void>();

  /** Emitted after a rejection is recorded or closed, so lists can refresh their flags. */
  @Output() changed = new EventEmitter<void>();

  history: SampleRejectionHistoryDto | null = null;
  loading = false;
  errorMessage = '';

  reasonGroups: ReasonGroup[] = [];

  // ── Reject form ────────────────────────────────────────────────────────────
  showRejectForm = false;
  reasonCode = '';
  notes = '';
  rejectedBy = '';
  submitting = false;
  submitAttempted = false;

  // ── Resolve form ───────────────────────────────────────────────────────────
  showResolveForm = false;
  resolveNote = '';
  resolving = false;

  readonly OTHER = OTHER_REASON_CODE;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private rejectionService: SampleRejectionService,
    private toastr: ToastrService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.visible) return;
    if (changes['visible'] || changes['testCode'] || changes['testRegId']) {
      this.resetForms();
      this.loadReasons();
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

  private resetForms(): void {
    this.showRejectForm = false;
    this.showResolveForm = false;
    this.reasonCode = '';
    this.notes = '';
    this.rejectedBy = '';
    this.resolveNote = '';
    this.submitAttempted = false;
    this.submitting = false;
    this.resolving = false;
  }

  private loadReasons(): void {
    this.rejectionService
      .getReasons()
      .pipe(takeUntil(this.destroy$))
      .subscribe(reasons => {
        // Grouped by the cause the API assigned, in the order it sent them, so the picker
        // shows "collection quality" and "protocol not followed" as the two separate
        // decisions they are rather than one flat list of fifteen things.
        const groups: ReasonGroup[] = [];
        for (const r of reasons ?? []) {
          let group = groups.find(g => g.categoryLabel === r.categoryLabel);
          if (!group) {
            group = { categoryLabel: r.categoryLabel, reasons: [] };
            groups.push(group);
          }
          group.reasons.push(r);
        }
        this.reasonGroups = groups;
      });
  }

  private load(): void {
    if (this.testRegId <= 0 || !this.testCode) {
      this.history = null;
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.rejectionService
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
          this.errorMessage = 'The rejection history could not be loaded.';
        },
      });
  }

  // ── Display ────────────────────────────────────────────────────────────────

  get rejections(): SampleRejectionDto[] {
    return this.history?.rejections ?? [];
  }

  get openRejection(): SampleRejectionDto | null {
    return this.history?.openRejection ?? null;
  }

  get hasOpenRejection(): boolean {
    return !!this.openRejection;
  }

  get rejectionCount(): number {
    return this.history?.rejectionCount ?? 0;
  }

  get everRejected(): boolean {
    return this.rejectionCount > 0;
  }

  // ── Recording a rejection ──────────────────────────────────────────────────

  openRejectForm(): void {
    this.showRejectForm = true;
    this.submitAttempted = false;
  }

  cancelRejectForm(): void {
    this.resetForms();
  }

  get reasonMissing(): boolean {
    return this.submitAttempted && this.reasonCode.trim().length === 0;
  }

  /** Other exists so nobody forces a real problem into the wrong box — but it needs the detail. */
  get notesRequired(): boolean {
    return this.reasonCode === this.OTHER;
  }

  get notesMissing(): boolean {
    return this.submitAttempted && this.notesRequired && this.notes.trim().length === 0;
  }

  submitReject(): void {
    this.submitAttempted = true;

    if (this.reasonCode.trim().length === 0) return;
    if (this.notesRequired && this.notes.trim().length === 0) return;
    if (this.submitting) return;

    this.submitting = true;

    this.rejectionService
      .reject({
        testRegId: this.testRegId,
        testCode: this.testCode,
        reasonCode: this.reasonCode,
        notes: this.notes.trim() || null,
        rejectedBy: this.rejectedBy.trim() || null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.submitting = false;
          if (!result?.success) {
            this.toastr.error(result?.message || 'The rejection could not be recorded.');
            return;
          }
          this.toastr.success('Sample rejection recorded. The test is awaiting a fresh sample.');
          this.resetForms();
          this.load();
          this.changed.emit();
        },
        error: () => {
          this.submitting = false;
          this.toastr.error('The rejection could not be recorded.');
        },
      });
  }

  // ── Closing a rejection ────────────────────────────────────────────────────

  openResolveForm(): void {
    this.showResolveForm = true;
    this.resolveNote = '';
  }

  cancelResolveForm(): void {
    this.showResolveForm = false;
    this.resolveNote = '';
  }

  /** A fresh sample has been collected — the test can proceed. */
  markRecollected(): void {
    this.resolve(SampleRejectionStatus.Recollected, 'Fresh sample recorded.');
  }

  /** The rejection was a mistake. Withdrawn rather than deleted, so the correction is visible. */
  withdraw(): void {
    this.resolve(SampleRejectionStatus.Withdrawn, 'Rejection withdrawn.');
  }

  private resolve(status: SampleRejectionStatus, successMessage: string): void {
    const open = this.openRejection;
    if (!open || this.resolving) return;

    this.resolving = true;

    this.rejectionService
      .resolve({
        rejectionId: open.rejectionId,
        status,
        note: this.resolveNote.trim() || null,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.resolving = false;
          if (!result?.success) {
            this.toastr.error(result?.message || 'The rejection could not be closed.');
            return;
          }
          this.toastr.success(successMessage);
          this.resetForms();
          this.load();
          this.changed.emit();
        },
        error: () => {
          this.resolving = false;
          this.toastr.error('The rejection could not be closed.');
        },
      });
  }

  trackByRejection(_i: number, r: SampleRejectionDto): number {
    return r.rejectionId;
  }
}
