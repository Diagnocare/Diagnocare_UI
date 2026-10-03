import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** One tile: a queue, how many are in it, and what you do about them. */
export interface DcQueueTab {
  /** Stable key emitted on select — the WorkQueue value. */
  key: string;
  /** The state, in the user's words: "Awaiting results". */
  label: string;
  /** The action, imperative: "Enter results". Printed under the count. */
  hint?: string;
  /** How many items are in this queue right now. */
  count?: number | null;
  /** One of the five kit tones. Colours the top rule and the active state. */
  tone?: 'ok' | 'wait' | 'info' | 'danger' | 'idle';
  icon?: string;
}

/**
 * DcQueueTabsComponent — the worklist's queue selector.
 *
 * Why this exists rather than a filter bar
 * ────────────────────────────────────────
 * A filter asks the user a question. A queue gives them an answer. The old
 * screens had a status dropdown, a date range, a search box and a two-button
 * toggle, and a new employee had to be told which combination meant "my work
 * for today" — that instruction *was* most of the training.
 *
 * These tiles replace all of it. Every item is in exactly one queue, so the
 * counts always add up and an empty queue genuinely means nothing is waiting.
 * Each tile carries three things: a number (how much), a state (what it is) and
 * a verb (what to do). That is the whole model, visible at once, with nothing
 * to open and nothing to remember.
 *
 * The count is the teacher. A new user who saves one set of results and watches
 * "Awaiting results" tick from 17 to 16 while "To verify" ticks up has learnt
 * the system, in one action, without being told anything.
 *
 * Kit rules it follows: 48px minimum target (rule 1); the word always travels
 * with the icon and the colour (rules 2 and 3); a zero count is shown greyed
 * and still selectable rather than hidden, because a queue that disappears when
 * empty makes the set of queues itself look unstable.
 *
 * Usage:
 *   <dc-queue-tabs [tabs]="queueTabs" [active]="queue" (select)="onQueue($event)">
 *   </dc-queue-tabs>
 */
@Component({
  selector: 'dc-queue-tabs',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-queues" role="tablist" [attr.aria-label]="ariaLabel">
      <button *ngFor="let tab of tabs; trackBy: trackByKey"
              type="button"
              role="tab"
              class="dc-queue"
              [ngClass]="'dc-queue--' + (tab.tone || 'idle')"
              [class.dc-queue--on]="tab.key === active"
              [class.dc-queue--empty]="!tab.count"
              [attr.aria-selected]="tab.key === active"
              (click)="choose(tab)">
        <span class="dc-queue__count">{{ tab.count ?? 0 }}</span>
        <span class="dc-queue__label">
          <i class="fa dc-queue__icon" [ngClass]="tab.icon || 'fa-circle-o'" aria-hidden="true"></i>
          {{ tab.label }}
        </span>
        <span class="dc-queue__hint" *ngIf="tab.hint">{{ tab.hint }}</span>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dc-queues {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
      gap: 0.6rem;
    }

    .dc-queue {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
      min-height: var(--dc-touch, 48px);
      padding: 0.75rem 0.85rem;
      text-align: left;
      cursor: pointer;
      background: var(--dc-surface, #ffffff);
      border: 1px solid var(--dc-line, #e2e8f0);
      border-top: 3px solid var(--dc-idle-line, #cbd5e1);
      border-radius: 0.35rem;
      font: inherit;
      color: inherit;
      transition: background 0.14s ease, border-color 0.14s ease;
    }
    .dc-queue:hover { background: var(--dc-surface-2, #f8fafc); }
    .dc-queue:focus-visible {
      /* --dc-focus is a box-shadow value — `outline: 3px solid <shadow>` is
         invalid and the whole declaration is dropped, which takes the keyboard
         ring with it. The colour has its own token for exactly this. */
      outline: 3px solid var(--dc-focus-color, #1e5ba8);
      outline-offset: 2px;
    }

    .dc-queue__count {
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      color: var(--dc-ink, #0f172a);
    }
    .dc-queue__label {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      color: var(--dc-ink, #0f172a);
    }
    .dc-queue__icon { font-size: 0.9em; opacity: 0.75; }
    .dc-queue__hint {
      font-size: 0.75rem;
      color: var(--dc-ink-3, #64748b);
    }

    /* An empty queue stays visible and selectable — a set of queues that
       changes size as work moves through it cannot be learnt. */
    .dc-queue--empty .dc-queue__count { color: var(--dc-ink-3, #94a3b8); }

    .dc-queue--ok     { border-top-color: var(--dc-ok-line, #86efac); }
    .dc-queue--wait   { border-top-color: var(--dc-wait-line, #fcd34d); }
    .dc-queue--info   { border-top-color: var(--dc-info-line, #93c5fd); }
    .dc-queue--danger { border-top-color: var(--dc-danger-line, #fca5a5); }
    .dc-queue--idle   { border-top-color: var(--dc-idle-line, #cbd5e1); }

    .dc-queue--on { border-color: currentColor; }
    .dc-queue--on.dc-queue--ok     { background: var(--dc-ok-bg, #dcfce7);     border-color: var(--dc-ok-line, #86efac); }
    .dc-queue--on.dc-queue--wait   { background: var(--dc-wait-bg, #fef3c7);   border-color: var(--dc-wait-line, #fcd34d); }
    .dc-queue--on.dc-queue--info   { background: var(--dc-info-bg, #dbeafe);   border-color: var(--dc-info-line, #93c5fd); }
    .dc-queue--on.dc-queue--danger { background: var(--dc-danger-bg, #fee2e2); border-color: var(--dc-danger-line, #fca5a5); }
    .dc-queue--on.dc-queue--idle   { background: var(--dc-idle-bg, #f1f5f9);   border-color: var(--dc-idle-line, #cbd5e1); }

    @media (prefers-reduced-motion: reduce) {
      .dc-queue { transition: none; }
    }
  `]
})
export class DcQueueTabsComponent {
  @Input() tabs: DcQueueTab[] = [];
  @Input() active = '';
  @Input() ariaLabel = 'Work queues';

  /** Emits the selected tab's key. */
  @Output() select = new EventEmitter<string>();

  choose(tab: DcQueueTab): void {
    if (tab.key !== this.active) this.select.emit(tab.key);
  }

  trackByKey = (_: number, tab: DcQueueTab) => tab.key;
}
