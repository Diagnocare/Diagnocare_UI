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
    <div class="rc-overlay" *ngIf="visible" role="dialog" aria-modal="true"
         aria-labelledby="rc-title" (keydown.escape)="close()">
      <div class="rc-backdrop" (click)="close()"></div>

      <div class="rc-container">

        <!-- Same shape as the app's other dialogs. The header is red rather than
             the brand gradient for the same reason sample-rejection is: this
             withdraws something that already went out. -->
        <div class="rc-header">
          <div class="rc-header-left">
            <h2 id="rc-title">
              <i class="fa fa-undo" aria-hidden="true"></i>
              Recall this report
            </h2>
            <p class="rc-subtitle" *ngIf="item">
              {{ item.patientName }} · {{ item.patientAge }} / {{ item.patientGender }}
              · {{ item.patientId }} · order {{ item.testRegId }}
            </p>
          </div>

          <button type="button" class="rc-close" (click)="close()" aria-label="Close">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <div class="rc-body">
          <p class="rc-test" *ngIf="item">
            {{ item.testName }}<span *ngIf="item.verifiedBy"> · issued by {{ item.verifiedBy }}</span>
          </p>

          <!-- Said plainly. Someone recalling a report needs to know the report is
               no longer valid from this moment, not discover it afterwards. -->
          <p class="rc-warn">
            <i class="fa fa-exclamation-triangle" aria-hidden="true"></i>
            The sign-off will be withdrawn and the test goes back to the bench.
            Anyone holding a printed copy has an out-of-date report.
          </p>

          <label class="rc-label" for="rc-reason">Why is it being recalled?</label>
          <textarea id="rc-reason" class="form-control" rows="3"
                    [(ngModel)]="reason" [disabled]="isSaving"
                    placeholder="e.g. Wrong sample — the CBC belongs to another patient."></textarea>

          <p class="rc-hint" *ngIf="!reason.trim()">
            A reason is required. It is kept with the report's history.
          </p>
        </div>

        <div class="rc-footer">
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
    /* Geometry matches the app's other dialogs — see the note in
       mark-collected-modal.component.ts. No backticks in here: this sits inside
       a template literal and one would end the string. */

    :host { display: contents; }

    .rc-overlay {
      position: fixed;
      inset: 0;
      z-index: 1400;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .rc-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(2px);
    }

    .rc-container {
      position: relative;
      display: flex;
      flex-direction: column;
      width: min(560px, 100%);
      max-height: 90vh;
      background: var(--bg-white, #ffffff);
      border-radius: 14px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
      overflow: hidden;
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .rc-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.1rem 1.4rem;
      background: var(--btn-danger, linear-gradient(135deg, #991b1b, #b91c1c));
      color: #ffffff;
    }

    .rc-header h2 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.05rem;
      font-weight: 600;
      color: #ffffff;
    }

    .rc-subtitle {
      margin: 0.3rem 0 0;
      font-size: 0.82rem;
      opacity: 0.9;
    }

    .rc-close {
      border: none;
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s ease;
    }
    .rc-close:hover { background: rgba(255, 255, 255, 0.3); }
    .rc-close:focus-visible {
      outline: 3px solid var(--dc-focus-color, #1e5ba8);
      outline-offset: 2px;
    }

    /* ── Body ───────────────────────────────────────────────────────────── */
    .rc-body {
      padding: 1.2rem 1.4rem;
      overflow-y: auto;
      flex: 1 1 auto;
      background: var(--bg-light, #f8fafc);
      font-size: var(--dc-text-body, 0.875rem);
      color: var(--text-primary, #1e293b);
    }

    .rc-test {
      margin: 0 0 0.9rem;
      font-weight: 600;
      color: var(--text-primary, #0f172a);
    }

    .rc-warn {
      display: flex;
      gap: 0.5rem;
      margin: 0 0 0.9rem;
      padding: 0.6rem 0.75rem;
      border-radius: var(--radius-md, 0.5em);
      line-height: 1.45;
      color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
      border: 1px solid var(--dc-danger-line, #fca5a5);
    }
    .rc-warn i { flex: 0 0 auto; margin-top: 0.1rem; }

    .rc-label {
      display: block;
      margin: 0 0 0.3rem;
      font-size: var(--dc-text-meta, 0.8125rem);
      font-weight: 600;
      color: var(--text-primary, #334155);
    }

    .rc-hint {
      margin: 0.5rem 0 0;
      font-size: var(--dc-text-meta, 0.8125rem);
      color: var(--text-secondary, #666666);
    }

    /* ── Footer ─────────────────────────────────────────────────────────── */
    .rc-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75em;
      padding: 0.8rem 1.4rem;
      border-top: 1px solid var(--border-color, #e2e8f0);
      background: var(--bg-white, #ffffff);
      flex-shrink: 0;
    }

    @media (max-width: 640px) {
      .rc-overlay { padding: 0.6rem; }
      .rc-container { max-height: 95vh; }
      .rc-body { padding: 0.9rem; }
    }

    @media (prefers-reduced-motion: reduce) {
      .rc-close { transition: none; }
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
