import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** The actions a row or card can offer. */
export type DcActionType =
  | 'view' | 'edit' | 'print' | 'download' | 'add'
  | 'delete' | 'restore' | 'cancel' | 'pay' | 'results';

interface DcActionConfig {
  icon: string;
  label: string;
  tone: 'normal' | 'primary' | 'danger';
}

/**
 * One place where every row action's icon, wording and colour is decided.
 * Wording is a verb the user would say out loud, not a noun.
 */
const ACTIONS: Record<DcActionType, DcActionConfig> = {
  view:     { icon: 'fa-eye',          label: 'View',     tone: 'normal'  },
  edit:     { icon: 'fa-pencil',       label: 'Edit',     tone: 'normal'  },
  print:    { icon: 'fa-print',        label: 'Print',    tone: 'normal'  },
  download: { icon: 'fa-download',     label: 'Download', tone: 'normal'  },
  add:      { icon: 'fa-plus',         label: 'Add',      tone: 'primary' },
  results:  { icon: 'fa-flask',        label: 'Results',  tone: 'primary' },
  pay:      { icon: 'fa-rupee',        label: 'Payment',  tone: 'primary' },
  restore:  { icon: 'fa-rotate-left',  label: 'Restore',  tone: 'normal'  },
  cancel:   { icon: 'fa-ban',          label: 'Cancel',   tone: 'danger'  },
  delete:   { icon: 'fa-trash',        label: 'Delete',   tone: 'danger'  },
};

/**
 * DcActionComponent — a row action that says what it does.
 *
 * Why this exists
 * ───────────────
 * The existing <app-action-btn> is icon-only with a hover tooltip. That is
 * fine for someone who uses the app daily; for everyone else a pencil, an eye
 * and a trash can in a row are three grey squares, and the only way to find
 * out which is which is to hover each one — or click and find out. On a touch
 * screen there is no hover at all, so the tooltip never appears.
 *
 * This component keeps the same icons and adds the word. It is a drop-in
 * replacement: swap the tag, keep the (clicked) handler.
 *
 *   <app-action-btn type="edit" (clicked)="editPatient(id)"></app-action-btn>
 *   <dc-action      type="edit" (clicked)="editPatient(id)"></dc-action>
 *
 * Where horizontal room really is short, `[compact]="true"` hides the word on
 * narrow screens only — the label still reaches screen readers, and the full
 * button returns as soon as there is room.
 *
 * Destructive actions are red AND say the word "Delete" AND should still be
 * confirmed through ConfirmModalService — three chances to notice.
 */
@Component({
  selector: 'dc-action',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button type="button"
            class="dc-action"
            [ngClass]="['dc-action--' + config.tone, compact ? 'dc-action--compact' : '']"
            [disabled]="disabled"
            [attr.aria-label]="text"
            [title]="text"
            (click)="clicked.emit($event)">
      <i class="fa" [ngClass]="icon || config.icon" aria-hidden="true"></i>
      <span class="dc-action__text">{{ text }}</span>
    </button>
  `,
  styles: [`
    :host { display: inline-flex; }

    .dc-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      min-height: var(--dc-touch, 3rem);
      padding: 0 0.9rem;
      font-family: inherit;
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      white-space: nowrap;
      border-radius: var(--dc-radius, 0.625rem);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      background: var(--dc-surface, #fff);
      color: var(--dc-ink, #2c3e50);
      cursor: pointer;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }
    .dc-action:hover:not(:disabled) {
      background: var(--dc-surface-muted, #f8f9fa);
      border-color: var(--dc-brand, #1e5ba8);
    }
    .dc-action:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-action:disabled { opacity: 0.45; cursor: not-allowed; }

    .dc-action--primary {
      color: var(--dc-info-ink, #1d4ed8);
      background: var(--dc-info-bg, #dbeafe);
      border-color: var(--dc-info-line, #93c5fd);
    }
    .dc-action--danger {
      color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
      border-color: var(--dc-danger-line, #fca5a5);
    }
    .dc-action--danger:hover:not(:disabled) {
      background: var(--dc-danger-ink, #b91c1c);
      border-color: var(--dc-danger-ink, #b91c1c);
      color: #fff;
    }

    /* Compact only collapses on genuinely narrow screens; the accessible name
       stays on the button either way. */
    @media (max-width: 48rem) {
      .dc-action--compact { padding: 0; width: var(--dc-touch, 3rem); }
      .dc-action--compact .dc-action__text {
        position: absolute;
        width: 1px; height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
    }
  `]
})
export class DcActionComponent {
  /** Which action this is — sets the icon, the word and the colour. */
  @Input() type: DcActionType = 'view';

  /** Override the word, e.g. label="Deactivate" on a delete-toned button. */
  @Input() label = '';

  /** Override the glyph. */
  @Input() icon = '';

  /** Collapse to icon-only below 768px. Use only in dense tables. */
  @Input() compact = false;

  @Input() disabled = false;

  @Output() clicked = new EventEmitter<MouseEvent>();

  get config(): DcActionConfig { return ACTIONS[this.type]; }
  get text(): string { return this.label || this.config.label; }
}
