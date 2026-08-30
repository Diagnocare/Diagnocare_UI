import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * DcEmptyComponent — what to show when there is nothing to show.
 *
 * Why this exists
 * ───────────────
 * An empty screen is the moment a non-technical user decides the app is
 * broken. "No records found." does not help: it does not say why, and it does
 * not say what to do. Every empty state in the kit answers three questions in
 * order — what happened, why, and what to press next — and gives that last
 * answer as a real button, not as advice.
 *
 * Usage — nothing booked yet:
 *   <dc-empty icon="fa-flask"
 *             title="No tests booked for this patient"
 *             message="Once you book a test it will appear here, ready for results."
 *             actionLabel="Book a test"
 *             (action)="addNewTest()">
 *   </dc-empty>
 *
 * Usage — a search that found nothing (note the different advice):
 *   <dc-empty icon="fa-search"
 *             title="No patients match that search"
 *             message="Check the spelling, or try just the first few letters of the name."
 *             actionLabel="Show all patients"
 *             (action)="clearSearch()">
 *   </dc-empty>
 *
 * Usage — an error, which is an empty state too:
 *   <dc-empty tone="danger" icon="fa-exclamation-triangle"
 *             title="Could not load the patient list"
 *             message="The server did not respond. Your work is not lost."
 *             actionLabel="Try again"
 *             (action)="reload()">
 *   </dc-empty>
 */
@Component({
  selector: 'dc-empty',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-empty" [ngClass]="'dc-empty--' + tone" role="status">
      <span class="dc-empty__icon" aria-hidden="true">
        <i class="fa" [ngClass]="icon"></i>
      </span>

      <h3 class="dc-empty__title">{{ title }}</h3>
      <p class="dc-empty__message" *ngIf="message">{{ message }}</p>

      <div class="dc-empty__actions" *ngIf="actionLabel || secondaryLabel">
        <button type="button" class="dc-empty__btn dc-empty__btn--primary"
                *ngIf="actionLabel"
                (click)="action.emit()">
          <i class="fa" [ngClass]="actionIcon" aria-hidden="true"></i>
          <span>{{ actionLabel }}</span>
        </button>

        <button type="button" class="dc-empty__btn dc-empty__btn--secondary"
                *ngIf="secondaryLabel"
                (click)="secondary.emit()">
          {{ secondaryLabel }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dc-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--dc-gap-sm, 0.6rem);
      padding: var(--dc-gap-lg, 1.5rem);
      background: var(--dc-surface, #fff);
      border: var(--dc-border, 2px) dashed var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius-lg, 0.875rem);
    }

    .dc-empty__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 4rem;
      height: 4rem;
      border-radius: 50%;
      font-size: 1.6rem;
      background: var(--dc-idle-bg, #f1f5f9);
      color: var(--dc-idle-ink, #475569);
    }
    .dc-empty--danger .dc-empty__icon {
      background: var(--dc-danger-bg, #fee2e2);
      color: var(--dc-danger-ink, #b91c1c);
    }
    .dc-empty--ok .dc-empty__icon {
      background: var(--dc-ok-bg, #dcfce7);
      color: var(--dc-ok-ink, #15803d);
    }
    .dc-empty--danger { border-color: var(--dc-danger-line, #fca5a5); border-style: solid; }

    .dc-empty__title {
      margin: 0;
      font-size: var(--dc-text-xl, 1.375rem);
      font-weight: 700;
      color: var(--dc-ink, #2c3e50);
      line-height: 1.3;
    }
    .dc-empty__message {
      margin: 0;
      max-width: 34rem;
      font-size: var(--dc-text, 1rem);
      color: var(--dc-ink-soft, #666);
      line-height: 1.5;
    }

    .dc-empty__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--dc-gap-sm, 0.6rem);
      margin-top: var(--dc-gap-sm, 0.6rem);
    }

    .dc-empty__btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: var(--dc-touch-lg, 3.5rem);
      padding: 0 1.75rem;
      font-family: inherit;
      font-size: var(--dc-text, 1rem);
      font-weight: 600;
      border-radius: var(--dc-radius, 0.625rem);
      border: var(--dc-border, 2px) solid transparent;
      cursor: pointer;
      transition: filter 0.15s ease, background 0.15s ease;
    }
    .dc-empty__btn:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-empty__btn--primary {
      background: var(--dc-brand, #1e5ba8);
      color: #fff;
    }
    .dc-empty__btn--primary:hover { filter: brightness(1.1); }
    .dc-empty__btn--secondary {
      background: transparent;
      color: var(--dc-ink, #2c3e50);
      border-color: var(--dc-line, #e1e8ed);
    }
    .dc-empty__btn--secondary:hover { background: var(--dc-surface-muted, #f8f9fa); }
  `]
})
export class DcEmptyComponent {
  /** Glyph for the circle. Pick one that matches the missing thing. */
  @Input() icon = 'fa-inbox';

  /** What happened, in one sentence with no jargon. */
  @Input() title = 'Nothing here yet';

  /** Why it is empty, and what would put something here. */
  @Input() message = '';

  /** The next step, as a verb: "Book a test", "Try again", "Show all". */
  @Input() actionLabel = '';
  @Input() actionIcon = 'fa-arrow-right';
  @Output() action = new EventEmitter<void>();

  /** An optional lesser alternative, e.g. "Go back". */
  @Input() secondaryLabel = '';
  @Output() secondary = new EventEmitter<void>();

  /** 'idle' for nothing-yet, 'danger' for a failure, 'ok' for all-caught-up. */
  @Input() tone: 'idle' | 'danger' | 'ok' = 'idle';
}
