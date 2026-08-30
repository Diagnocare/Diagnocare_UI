import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * DcSaveBarComponent — the Save button, always in the same place, never lost.
 *
 * Why this exists
 * ───────────────
 * On a long form the Save button is at the bottom of the page, which means it
 * is off screen for most of the time the user is working. People scroll to
 * look for it, scroll past it, or press Enter and hope. Worse, when Save is
 * disabled there is usually nothing on screen explaining why, so the user
 * concludes the app is frozen.
 *
 * This bar sticks to the bottom of the viewport and always shows: what will
 * happen (the button's verb), whether anything is unsaved, and — when Save is
 * blocked — the reason in one plain sentence.
 *
 * Usage:
 *   <dc-save-bar [canSave]="form.valid"
 *                blockReason="Patient name and age are still empty."
 *                saveLabel="Save patient"
 *                [busy]="saving"
 *                [dirty]="form.dirty"
 *                (save)="onSave()"
 *                (cancel)="goBack()">
 *   </dc-save-bar>
 *
 * Put it as the last element inside the page container, after the form.
 */
@Component({
  selector: 'dc-save-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-savebar">
      <div class="dc-savebar__inner">

        <div class="dc-savebar__status">
          <p class="dc-savebar__blocked" *ngIf="!canSave && blockReason">
            <i class="fa fa-info-circle" aria-hidden="true"></i>
            <span>{{ blockReason }}</span>
          </p>
          <p class="dc-savebar__dirty" *ngIf="canSave && dirty && !busy">
            <i class="fa fa-pencil" aria-hidden="true"></i>
            <span>{{ dirtyLabel }}</span>
          </p>
        </div>

        <div class="dc-savebar__buttons">
          <button type="button"
                  class="dc-savebar__btn dc-savebar__btn--cancel"
                  *ngIf="cancelLabel"
                  [disabled]="busy"
                  (click)="cancel.emit()">
            {{ cancelLabel }}
          </button>

          <button type="button"
                  class="dc-savebar__btn dc-savebar__btn--save"
                  [disabled]="!canSave || busy"
                  (click)="save.emit()">
            <i class="fa fa-spinner fa-spin" *ngIf="busy" aria-hidden="true"></i>
            <i class="fa fa-check" *ngIf="!busy" aria-hidden="true"></i>
            <span>{{ busy ? busyLabel : saveLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      position: sticky;
      bottom: 0;
      z-index: 20;
      /* Breathing room so the last field is never hidden behind the bar. */
      margin-top: var(--dc-gap-lg, 1.5rem);
    }

    .dc-savebar {
      background: var(--dc-surface, #fff);
      border-top: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.08);
    }

    .dc-savebar__inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--dc-gap, 1rem);
      flex-wrap: wrap;
      padding: 0.85rem var(--dc-gap, 1rem);
    }

    .dc-savebar__status { flex: 1 1 16rem; min-width: 0; }

    .dc-savebar__blocked,
    .dc-savebar__dirty {
      display: flex;
      align-items: flex-start;
      gap: 0.45rem;
      margin: 0;
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      line-height: 1.4;
    }
    .dc-savebar__blocked { color: var(--dc-wait-ink, #b45309); }
    .dc-savebar__dirty   { color: var(--dc-ink-soft, #666); font-weight: 500; }

    .dc-savebar__buttons {
      display: flex;
      gap: var(--dc-gap-sm, 0.6rem);
      flex: 0 0 auto;
    }

    .dc-savebar__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: var(--dc-touch-lg, 3.5rem);
      padding: 0 1.75rem;
      font-family: inherit;
      font-size: var(--dc-text-lg, 1.125rem);
      font-weight: 600;
      border-radius: var(--dc-radius, 0.625rem);
      border: var(--dc-border, 2px) solid transparent;
      cursor: pointer;
      transition: filter 0.15s ease, background 0.15s ease;
    }
    .dc-savebar__btn:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-savebar__btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .dc-savebar__btn--save {
      background: var(--dc-brand, #1e5ba8);
      color: #fff;
    }
    .dc-savebar__btn--save:hover:not(:disabled) { filter: brightness(1.1); }

    .dc-savebar__btn--cancel {
      background: var(--dc-idle-bg, #f1f5f9);
      color: var(--dc-idle-ink, #475569);
      border-color: var(--dc-idle-line, #cbd5e1);
      font-size: var(--dc-text, 1rem);
    }

    @media (max-width: 34rem) {
      .dc-savebar__buttons { flex: 1 1 100%; }
      .dc-savebar__btn { flex: 1 1 auto; padding: 0 1rem; }
    }
  `]
})
export class DcSaveBarComponent {
  /** False disables Save. Bind to form.valid, or your own rule. */
  @Input() canSave = true;

  /** Why Save is disabled, in plain words. Always supply one when it can be. */
  @Input() blockReason = '';

  /** Name the outcome: "Save patient", "Save results", not "Submit". */
  @Input() saveLabel = 'Save';

  /** Set to '' to hide the cancel button. */
  @Input() cancelLabel = 'Cancel';

  /** True while the request is in flight. */
  @Input() busy = false;
  @Input() busyLabel = 'Saving…';

  /** True when there are unsaved edits — shows a quiet reminder. */
  @Input() dirty = false;
  @Input() dirtyLabel = 'You have unsaved changes.';

  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}
