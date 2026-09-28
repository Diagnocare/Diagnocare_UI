import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { WorklistService } from 'src/app/services/worklistServices/worklist.service';
import { WorklistItem } from 'src/app/models/worklist/worklist.models';

/**
 * "Recall report" — pulling back a report that has already been issued.
 *
 * The counterpart to rejecting results before sign-off. Both send a test back to
 * the bench, but only this one means a document reached a patient and had to be
 * withdrawn, so it is deliberately a heavier action: a separate confirmation, a
 * required reason, and warning-coloured rather than routine.
 *
 * On save the sign-off is withdrawn and a return is recorded, so the test lands
 * in the Returned queue alongside ordinary rejections instead of quietly
 * reappearing in To verify as though nothing had gone out.
 */
@Component({
  selector: 'app-recall-report-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rc" *ngIf="visible" role="dialog" aria-modal="true"
         aria-labelledby="rc-title" (keydown.escape)="close()">
      <div class="rc__backdrop" (click)="close()"></div>

      <div class="rc__panel">
        <div class="rc__head">
          <h3 id="rc-title">Recall this report</h3>
          <button type="button" class="rc__x" (click)="close()" aria-label="Close">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <div class="rc__who" *ngIf="item">
          <span class="rc__patient">{{ item.patientName }}</span>
          <span class="rc__meta">
            {{ item.patientAge }} / {{ item.patientGender }} ·
            {{ item.patientId }} · order {{ item.testRegId }}
          </span>
          <span class="rc__meta">{{ item.testName }}</span>
          <span class="rc__meta" *ngIf="item.verifiedBy">
            Issued by {{ item.verifiedBy }}
          </span>
        </div>

        <div class="rc__body">
          <!-- Said plainly. Someone recalling a report needs to know the report is
               no longer valid from this moment, not discover it afterwards. -->
          <p class="rc__warn">
            <i class="fa fa-exclamation-triangle" aria-hidden="true"></i>
            The sign-off will be withdrawn and the test goes back to the bench.
            Anyone holding a printed copy has an out-of-date report.
          </p>

          <label class="rc__label" for="rc-reason">Why is it being recalled?</label>
          <textarea id="rc-reason" class="form-control rc__text" rows="3"
                    [(ngModel)]="reason" [disabled]="isSaving"
                    placeholder="e.g. Wrong sample — the CBC belongs to another patient."></textarea>

          <p class="rc__hint" *ngIf="!reason.trim()">
            A reason is required. It is kept with the report's history.
          </p>
        </div>

        <div class="rc__foot">
          <button type="button" class="dc-btn" (click)="close()" [disabled]="isSaving">
            Cancel
          </button>
          <button type="button" class="dc-btn dc-btn--danger"
                  [disabled]="!reason.trim() || isSaving"
                  (click)="save()">
            <i class="fa" [ngClass]="isSaving ? 'fa-spinner fa-spin' : 'fa-reply'" aria-hidden="true"></i>
            {{ isSaving ? 'Recalling…' : 'Recall report' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .rc { position: fixed; inset: 0; z-index: 1050; display: flex;
          align-items: center; justify-content: center; padding: 1rem; }
    .rc__backdrop { position: absolute; inset: 0; background: rgba(15, 23, 42, 0.45); }

    .rc__panel {
      position: relative; width: 100%; max-width: 28rem;
      background: var(--dc-surface, #ffffff); border-radius: 0.5rem;
      box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.35); overflow: hidden;
    }

    .rc__head {
      display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.9rem 1rem; border-bottom: 1px solid var(--dc-line, #e2e8f0);

      h3 { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--dc-ink, #0f172a); }
    }

    .rc__x {
      background: none; border: 0; font-size: 1rem; line-height: 1;
      padding: 0.4rem; cursor: pointer; color: var(--dc-ink-3, #64748b);
      &:hover { color: var(--dc-ink, #0f172a); }
      &:focus-visible { outline: 3px solid var(--dc-focus, #2563eb); outline-offset: 2px; }
    }

    .rc__who {
      padding: 0.75rem 1rem; background: var(--dc-surface-2, #f8fafc);
      border-bottom: 1px solid var(--dc-line, #e2e8f0);
    }
    .rc__patient { display: block; font-weight: 600; color: var(--dc-ink, #0f172a); }
    .rc__meta { display: block; margin-top: 0.1rem; font-size: 0.75rem; color: var(--dc-ink-3, #64748b); }

    .rc__body { padding: 1rem; }

    .rc__warn {
      display: flex; gap: 0.5rem; margin: 0 0 0.85rem;
      padding: 0.6rem 0.75rem; border-radius: 0.35rem;
      font-size: 0.8rem; line-height: 1.45;
      color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
      i { flex: 0 0 auto; margin-top: 0.1rem; }
    }

    .rc__label {
      display: block; margin-bottom: 0.4rem; font-weight: 600;
      font-size: 0.9rem; color: var(--dc-ink, #0f172a);
    }
    .rc__text { width: 100%; font-size: 0.95rem; }

    .rc__hint { margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--dc-ink-3, #64748b); }

    .rc__foot {
      display: flex; justify-content: flex-end; gap: 0.5rem;
      padding: 0.85rem 1rem; background: var(--dc-surface-2, #f8fafc);
      border-top: 1px solid var(--dc-line, #e2e8f0);
    }

    .dc-btn--danger {
      background: var(--dc-danger-ink, #b91c1c);
      border-color: var(--dc-danger-ink, #b91c1c);
      color: #fff;
    }
  `]
})
export class RecallReportModalComponent {
  @Input() item: WorklistItem | null = null;
  @Input() visible = false;

  @Output() recalled = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  reason = '';
  isSaving = false;

  constructor(
    private worklist: WorklistService,
    private toastr: ToastrService,
  ) {}

  save(): void {
    const reason = this.reason.trim();
    if (!this.item || !reason || this.isSaving) return;

    this.isSaving = true;

    this.worklist
      .recallReport({ testRegId: this.item.testRegId, testCode: this.item.testCode, reason })
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.toastr.success('Report recalled. The test is back with the bench.', 'Recalled');
          this.reason = '';
          this.recalled.emit();
        },
        error: () => {
          this.isSaving = false;
          this.toastr.error('Could not recall that report. Please try again.', 'Not recalled');
        },
      });
  }

  close(): void {
    if (this.isSaving) return;
    this.reason = '';
    this.cancelled.emit();
  }
}
