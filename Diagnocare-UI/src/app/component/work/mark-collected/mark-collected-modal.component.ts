import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { WorklistService } from 'src/app/services/worklistServices/worklist.service';
import { WorklistItem } from 'src/app/models/worklist/worklist.models';
import { SamplingLocationService } from 'src/app/services/samplingServices/sampling-location.service';

/**
 * "Mark sample collected" — one question, asked where the work is.
 *
 * Why a modal and not a screen
 * ────────────────────────────
 * Recording a collection is a single choice from a short list. Navigating away
 * to make it would cost the person their place in a queue they are working
 * down, and they would have to find their way back for the next one. The modal
 * keeps the list behind it, so the answer to "what did I just do and what is
 * next" never leaves the screen.
 *
 * The dropdown is the same SamplingLocationService list used when registering a
 * patient, so the locations are the ones this lab already maintains and nothing
 * new has to be configured or learnt.
 *
 * The grain is the booking, not the test: one needle draw covers every test on
 * the visit, so this is asked once and moves all of them.
 */
@Component({
  selector: 'app-mark-collected-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mc" *ngIf="visible" role="dialog" aria-modal="true"
         aria-labelledby="mc-title" (keydown.escape)="close()">
      <div class="mc__backdrop" (click)="close()"></div>

      <div class="mc__panel">
        <div class="mc__head">
          <h3 id="mc-title">Mark sample collected</h3>
          <button type="button" class="mc__x" (click)="close()" aria-label="Close">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <!-- Who and what, restated. The person clicked a row a moment ago, but a
             modal that does not say which order it is about is how the wrong
             booking gets marked on a busy morning. -->
        <div class="mc__who" *ngIf="item">
          <span class="mc__patient">{{ item.patientName }}</span>
          <span class="mc__meta">
            {{ item.patientAge }} / {{ item.patientGender }} ·
            {{ item.patientId }} · order {{ item.testRegId }}
          </span>
          <span class="mc__meta">{{ item.testName }}</span>
        </div>

        <div class="mc__body">
          <label class="mc__label" for="mc-location">Where was the sample collected?</label>
          <select id="mc-location" class="form-select mc__select"
                  [(ngModel)]="location" [disabled]="isSaving">
            <option value="">-- Select --</option>
            <option *ngFor="let entry of locations" [value]="entry">{{ entry }}</option>
          </select>

          <p class="mc__hint" *ngIf="locations.length === 0">
            No sampling locations are set up yet. Add them where you register a patient.
          </p>

          <!-- The disabled Save explains itself rather than sitting greyed out in
               silence — the kit's fourth rule. -->
          <p class="mc__hint mc__hint--warn" *ngIf="locations.length > 0 && !location">
            Choose a location to enable Save.
          </p>
        </div>

        <div class="mc__foot">
          <button type="button" class="dc-btn" (click)="close()" [disabled]="isSaving">
            Cancel
          </button>
          <button type="button" class="dc-btn dc-btn--primary"
                  [disabled]="!location || isSaving"
                  (click)="save()">
            <i class="fa" [ngClass]="isSaving ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true"></i>
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .mc {
      position: fixed;
      inset: 0;
      z-index: 1050;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .mc__backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }

    .mc__panel {
      position: relative;
      width: 100%;
      max-width: 26rem;
      background: var(--dc-surface, #ffffff);
      border-radius: 0.5rem;
      box-shadow: 0 20px 45px -12px rgba(15, 23, 42, 0.35);
      overflow: hidden;
    }

    .mc__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.9rem 1rem;
      border-bottom: 1px solid var(--dc-line, #e2e8f0);

      h3 {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--dc-ink, #0f172a);
      }
    }

    .mc__x {
      background: none;
      border: 0;
      font-size: 1rem;
      line-height: 1;
      padding: 0.4rem;
      cursor: pointer;
      color: var(--dc-ink-3, #64748b);

      &:hover { color: var(--dc-ink, #0f172a); }
      &:focus-visible { outline: 3px solid var(--dc-focus, #2563eb); outline-offset: 2px; }
    }

    .mc__who {
      padding: 0.75rem 1rem;
      background: var(--dc-surface-2, #f8fafc);
      border-bottom: 1px solid var(--dc-line, #e2e8f0);
    }

    .mc__patient {
      display: block;
      font-weight: 600;
      color: var(--dc-ink, #0f172a);
    }

    .mc__meta {
      display: block;
      margin-top: 0.1rem;
      font-size: 0.75rem;
      color: var(--dc-ink-3, #64748b);
    }

    .mc__body { padding: 1rem; }

    .mc__label {
      display: block;
      margin-bottom: 0.4rem;
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--dc-ink, #0f172a);
    }

    /* 48px floor, per the kit's first rule — this gets used in a hurry. */
    .mc__select {
      width: 100%;
      min-height: var(--dc-touch, 48px);
      font-size: 0.95rem;
    }

    .mc__hint {
      margin: 0.5rem 0 0;
      font-size: 0.78rem;
      color: var(--dc-ink-3, #64748b);

      &--warn { color: var(--dc-wait-ink, #b45309); font-weight: 600; }
    }

    .mc__foot {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding: 0.85rem 1rem;
      background: var(--dc-surface-2, #f8fafc);
      border-top: 1px solid var(--dc-line, #e2e8f0);
    }

    @media (prefers-reduced-motion: reduce) {
      .mc__panel { transition: none; }
    }
  `]
})
export class MarkCollectedModalComponent {
  /** The row that was clicked. Null closes the modal. */
  @Input() item: WorklistItem | null = null;

  @Input() visible = false;

  /** Emitted after a successful save, so the worklist can reload its counts. */
  @Output() saved = new EventEmitter<void>();

  /** Emitted when the person backs out without saving. */
  @Output() cancelled = new EventEmitter<void>();

  location = '';
  isSaving = false;

  constructor(
    private worklist: WorklistService,
    private samplingLocations: SamplingLocationService,
    private toastr: ToastrService,
  ) {}

  /**
   * The lab's sampling locations — the same list offered when a patient is
   * registered, read fresh each time it is shown so a location added elsewhere
   * turns up here without a refresh.
   */
  get locations(): string[] {
    return this.samplingLocations.getAll();
  }

  save(): void {
    if (!this.item || !this.location || this.isSaving) return;

    this.isSaving = true;

    this.worklist
      .markSampleCollected({ testRegId: this.item.testRegId, samplingDoneAt: this.location })
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.toastr.success(
            `Sample recorded at ${this.location}. Results can now be entered.`,
            'Collected',
          );
          this.reset();
          this.saved.emit();
        },
        error: () => {
          this.isSaving = false;
          this.toastr.error('Could not save that. Please try again.', 'Not saved');
        },
      });
  }

  close(): void {
    if (this.isSaving) return;
    this.reset();
    this.cancelled.emit();
  }

  private reset(): void {
    this.location = '';
  }
}
