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
          <button type="button" class="dc-btn dc-btn--cancel" (click)="close()" [disabled]="isSaving">
            Cancel
          </button>
          <button type="button" class="dc-btn dc-btn--delete"
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
      background: var(--dc-surface, #ffffff); border-radius: var(--radius-lg, 0.75em);
      box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.35); overflow: hidden;
    }

    .rc__head {
      display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.9rem 1rem; border-bottom: 1px solid var(--dc-line, #e1e8ed);

      h3 {
        margin: 0;
        font-size: var(--dc-text-title, 1.25rem);
        font-weight: 600;
        color: var(--dc-ink, #2c3e50);
      }
    }

    .rc__x {
      background: none; border: 0; font-size: 1rem; line-height: 1;
      padding: 0.4rem; cursor: pointer; color: var(--dc-ink-3, #666666);
      &:hover { color: var(--dc-ink, #2c3e50); }
      /* --dc-focus is a box-shadow value; the outline needs the colour token. */
      &:focus-visible { outline: 3px solid var(--dc-focus-color, #1e5ba8); outline-offset: 2px; }
    }

    .rc__who {
      padding: 0.75rem 1rem; background: var(--dc-surface-2, #f8f9fa);
      border-bottom: 1px solid var(--dc-line, #e1e8ed);
    }
    .rc__patient {
      display: block; font-weight: 600;
      font-size: var(--dc-text-body, 0.875rem); color: var(--dc-ink, #2c3e50);
    }
    .rc__meta {
      display: block; margin-top: 0.1rem;
      font-size: var(--dc-text-meta, 0.8125rem); color: var(--dc-ink-3, #666666);
    }

    .rc__body { padding: 1rem; }

    .rc__warn {
      display: flex; gap: 0.5rem; margin: 0 0 0.85rem;
      padding: 0.6rem 0.75rem; border-radius: var(--radius-md, 0.5em);
      font-size: var(--dc-text-body, 0.875rem); line-height: 1.45;
      color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
      i { flex: 0 0 auto; margin-top: 0.1rem; }
    }

    .rc__label {
      display: block; margin-bottom: 0.4rem; font-weight: 600;
      font-size: var(--dc-text-meta, 0.8125rem); color: var(--dc-ink, #2c3e50);
    }
    .rc__text { width: 100%; font-size: var(--dc-text-body, 0.875rem); }

    .rc__hint {
      margin: 0.5rem 0 0;
      font-size: var(--dc-text-meta, 0.8125rem); color: var(--dc-ink-3, #666666);
    }

    .rc__foot {
      display: flex; justify-content: flex-end; align-items: center; gap: 0.75em;
      padding: 0.85rem 1rem; background: var(--dc-surface-2, #f8f9fa);
      border-top: 1px solid var(--dc-line, #e1e8ed);
    }

    /* No button is styled here. styles.css owns the .dc-btn intents — a
       component stylesheet is scoped, so a rule written here would only dress
       the button on this one modal and leave the identical button elsewhere
       bare. The red confirm is .dc-btn--delete. */
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
