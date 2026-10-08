import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { WorklistService } from 'src/app/services/worklistServices/worklist.service';
import { WorklistItem } from 'src/app/models/worklist/worklist.models';
import { SamplingLocationService } from 'src/app/services/samplingServices/sampling-location.service';

/**
 * Shared look for the worklist's one-question dialogs (mark collected, assign
 * collection boy), so they read as the same kind of object.
 */
export const MODAL_STYLES = `
    /* Geometry copied from the app's other dialogs so this reads as the same
       kind of object: 14px radius, 1.1rem/1.4rem header, 1.2rem/1.4rem body,
       0.8rem/1.4rem footer, a 2rem close circle. Colours and type come from the
       tokens rather than the hardcoded hex those files use, so this one also
       follows the five themes. Buttons and the select are the global classes.
       No backticks anywhere in here: this sits inside a template literal. */

    :host { display: contents; }

    .mc-overlay {
      position: fixed;
      inset: 0;
      z-index: 1400;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }

    .mc-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.55);
      backdrop-filter: blur(2px);
    }

    .mc-container {
      position: relative;
      display: flex;
      flex-direction: column;
      /* Narrower than the 720px the content-heavy dialogs use — this one asks a
         single question, and a lone select in a 720px panel reads as unfinished.
         Width is the one value that legitimately varies: protocol-view is 920. */
      width: min(560px, 100%);
      max-height: 90vh;
      background: var(--bg-white, #ffffff);
      border-radius: 14px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
      overflow: hidden;
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .mc-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.1rem 1.4rem;
      background: var(--primary-gradient, linear-gradient(135deg, #1E5BA8, #667eea));
      color: #ffffff;
    }

    .mc-header h2 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.05rem;
      font-weight: 600;
      color: #ffffff;
    }

    .mc-subtitle {
      margin: 0.3rem 0 0;
      font-size: 0.82rem;
      opacity: 0.9;
    }

    .mc-close {
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
    .mc-close:hover { background: rgba(255, 255, 255, 0.3); }
    .mc-close:focus-visible {
      outline: 3px solid var(--dc-focus-color, #1e5ba8);
      outline-offset: 2px;
    }

    /* ── Body ───────────────────────────────────────────────────────────── */
    .mc-body {
      padding: 1.2rem 1.4rem;
      overflow-y: auto;
      flex: 1 1 auto;
      background: var(--bg-light, #f8fafc);
      font-size: var(--dc-text-body, 0.875rem);
      color: var(--text-primary, #1e293b);
    }

    .mc-test {
      margin: 0 0 0.9rem;
      font-weight: 600;
      color: var(--text-primary, #0f172a);
    }

    /* Stacked label, at the size styles.css gives a filter label. Not
       .form-label: that one is right-aligned for the 130px .form-group grid. */
    .mc-label {
      display: block;
      margin: 0 0 0.3rem;
      font-size: var(--dc-text-meta, 0.8125rem);
      font-weight: 600;
      color: var(--text-primary, #334155);
    }

    .mc-hint {
      margin: 0.5rem 0 0;
      font-size: var(--dc-text-meta, 0.8125rem);
      color: var(--text-secondary, #666666);
    }
    .mc-hint--warn { color: var(--dc-wait-ink, #b45309); font-weight: 600; }

    /* ── Footer ─────────────────────────────────────────────────────────── */
    .mc-footer {
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
      .mc-overlay { padding: 0.6rem; }
      .mc-container { max-height: 95vh; }
      .mc-body { padding: 0.9rem; }
    }

    @media (prefers-reduced-motion: reduce) {
      .mc-close { transition: none; }
    }
  `;

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
    <div class="mc-overlay" *ngIf="visible" role="dialog" aria-modal="true"
         aria-labelledby="mc-title" (keydown.escape)="close()">
      <div class="mc-backdrop" (click)="close()"></div>

      <div class="mc-container">

        <!-- Header, body, footer in the shape the rest of the app's dialogs use
             (sample-rejection, test-run, protocol-view): a coloured bar carrying
             an icon, a title and the context line, a close circle on the right,
             a tinted body and a white footer with the actions on the right. -->
        <div class="mc-header">
          <div class="mc-header-left">
            <h2 id="mc-title">
              <i class="fa fa-flask" aria-hidden="true"></i>
              Mark sample collected
            </h2>

            <!-- Who and what, restated. The person clicked a row a moment ago,
                 but a dialog that does not say which order it is about is how
                 the wrong booking gets marked on a busy morning. -->
            <p class="mc-subtitle" *ngIf="item">
              {{ item.patientName }} · {{ item.patientAge }} / {{ item.patientGender }}
              · {{ item.patientId }} · order {{ item.testRegId }}
            </p>
          </div>

          <button type="button" class="mc-close" (click)="close()" aria-label="Close">
            <i class="fa fa-times" aria-hidden="true"></i>
          </button>
        </div>

        <div class="mc-body">
          <p class="mc-test" *ngIf="item">{{ item.testName }}</p>

          <label class="mc-label" for="mc-location">Where was the sample collected?</label>
          <select id="mc-location" class="form-select"
                  [(ngModel)]="location" [disabled]="isSaving">
            <option value="">-- Select --</option>
            <option *ngFor="let entry of locations" [value]="entry">{{ entry }}</option>
          </select>

          <p class="mc-hint" *ngIf="locations.length === 0">
            No sampling locations are set up yet. Add them where you register a patient.
          </p>

          <!-- The disabled Save explains itself rather than sitting greyed out in
               silence — the kit's fourth rule. -->
          <p class="mc-hint mc-hint--warn" *ngIf="locations.length > 0 && !location">
            Choose a location to enable Save.
          </p>
        </div>

        <div class="mc-footer">
          <button type="button" class="dc-btn dc-btn--cancel" (click)="close()" [disabled]="isSaving">
            Cancel
          </button>
          <button type="button" class="dc-btn dc-btn--save"
                  [disabled]="!location || isSaving"
                  (click)="save()">
            <i class="fa" [ngClass]="isSaving ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true"></i>
            {{ isSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [MODAL_STYLES]
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
          // A sample sent out with a collection boy still has to be received
          // at the lab before anyone can enter results.
          this.toastr.success(
            this.item?.collectionAssignedTo
              ? `Sample recorded at ${this.location}. Mark it received when it reaches the lab.`
              : `Sample recorded at ${this.location}. Results can now be entered.`,
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
