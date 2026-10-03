import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * DcNoteComponent — a short explanation shown where the user needs it.
 *
 * Why this exists
 * ───────────────
 * Rules that live only in someone's head cause the same support call every
 * week: "why can't I book this test?", "why is Save greyed out?", "how much
 * discount am I allowed?". The answer belongs on the screen, next to the
 * control it governs, before the user hits the wall — not in a toast after
 * they already have.
 *
 * Four tones, and the choice matters:
 *   info    neutral fact           "Results can be entered once tests are booked."
 *   tip     makes them faster      "Press Enter to move to the next box."
 *   warn    prevents a mistake     "This patient already has a booking today."
 *   danger  irreversible           "Deleting permanently cannot be undone."
 *
 * Usage:
 *   <dc-note tone="warn" title="Maximum discount is 20%">
 *     Anything higher needs a Super Admin to authorise it.
 *   </dc-note>
 *
 *   <dc-note tone="tip">Press <kbd>Enter</kbd> to jump to the next field.</dc-note>
 */
@Component({
  selector: 'dc-note',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-note" [ngClass]="'dc-note--' + tone" [attr.role]="tone === 'danger' ? 'alert' : 'note'">
      <i class="fa dc-note__icon" [ngClass]="icon || defaultIcon" aria-hidden="true"></i>
      <div class="dc-note__body">
        <p class="dc-note__title" *ngIf="title">{{ title }}</p>
        <div class="dc-note__text"><ng-content></ng-content></div>
      </div>
    </div>
  `,
  styles: [`
    /* Geometry taken from the global .alert in styles.css, so a notice here is
       the same object as a notice on any other screen: same padding, same
       radius, same spacing below, one uniform border. The colours stay on the
       --dc- tokens rather than .alert's hardcoded pastels, because those are
       light-only and these follow the five themes. */
    :host { display: block; margin-bottom: 1.25em; }

    .dc-note {
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.9375em 1.25em;
      border-radius: var(--radius-md, 0.5em);
      border: 0.0625em solid transparent;
      font-size: var(--dc-text-body, 0.875rem);
      line-height: 1.5;
    }
    .dc-note__icon { margin-top: 0.15em; font-size: 1.05em; flex: 0 0 auto; }
    .dc-note__body { min-width: 0; }
    .dc-note__title { margin: 0 0 0.15rem; font-weight: 700; }
    .dc-note__text { opacity: 0.95; }
    .dc-note__text ::ng-deep kbd {
      display: inline-block;
      padding: 0.05em 0.4em;
      border-radius: 0.25em;
      border: 1px solid currentColor;
      font-size: 0.85em;
      font-family: inherit;
      opacity: 0.85;
    }

    .dc-note--info {
      color: var(--dc-info-ink, #1d4ed8);
      background: var(--dc-info-bg, #dbeafe);
      border-color: var(--dc-info-line, #93c5fd);
    }
    .dc-note--tip {
      color: var(--dc-ok-ink, #15803d);
      background: var(--dc-ok-bg, #dcfce7);
      border-color: var(--dc-ok-line, #86efac);
    }
    .dc-note--warn {
      color: var(--dc-wait-ink, #b45309);
      background: var(--dc-wait-bg, #fef3c7);
      border-color: var(--dc-wait-line, #fcd34d);
    }
    .dc-note--danger {
      color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
      border-color: var(--dc-danger-line, #fca5a5);
    }
  `]
})
export class DcNoteComponent {
  /** Pick by consequence, not by how important it feels. */
  @Input() tone: 'info' | 'tip' | 'warn' | 'danger' = 'info';

  /** Optional bold first line. Put the rule itself here. */
  @Input() title = '';

  /** Override the glyph. */
  @Input() icon = '';

  get defaultIcon(): string {
    switch (this.tone) {
      case 'tip':    return 'fa-lightbulb-o';
      case 'warn':   return 'fa-exclamation-triangle';
      case 'danger': return 'fa-exclamation-circle';
      default:       return 'fa-info-circle';
    }
  }
}
