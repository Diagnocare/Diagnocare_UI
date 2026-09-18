import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/**
 * DcTaskTileComponent — a large "what do you want to do" button for home screens.
 *
 * Why this exists
 * ───────────────
 * Staff who use one or two features do not want a menu of twenty. A home
 * screen made of a handful of big tiles, each naming a task in the words the
 * user would use, removes the hardest step of all: finding the screen.
 *
 * Each tile carries a verb ("Register a patient"), a one-line explanation, and
 * optionally a count badge so an operator can see there is work waiting before
 * clicking. The whole tile is the target — not a link inside it.
 *
 * Usage:
 *   <div class="dc-task-grid">
 *     <dc-task-tile icon="fa-user-plus" label="Register a patient"
 *                   hint="Add a new patient and book their tests"
 *                   routerLink="/add-patient"></dc-task-tile>
 *
 *     <dc-task-tile icon="fa-flask" label="Enter test results"
 *                   hint="Fill in results for booked tests"
 *                   [badge]="pendingCount" badgeLabel="waiting"
 *                   routerLink="/patient-test-list"></dc-task-tile>
 *
 *     <dc-task-tile icon="fa-print" label="Print a report"
 *                   hint="Find a completed report and print it"
 *                   (open)="goToReports()"></dc-task-tile>
 *   </div>
 *
 * Wrap tiles in `.dc-task-grid` (styles live in this component's host CSS via
 * ::ng-deep-free global class below, so add the class on the parent element).
 */
@Component({
  selector: 'dc-task-tile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <a *ngIf="routerLink; else buttonTile"
       class="dc-tile"
       [class.dc-tile--accent]="accent"
       [routerLink]="routerLink"
       [queryParams]="queryParams">
      <ng-container *ngTemplateOutlet="body"></ng-container>
    </a>

    <ng-template #buttonTile>
      <button type="button"
              class="dc-tile"
              [class.dc-tile--accent]="accent"
              [disabled]="disabled"
              (click)="open.emit()">
        <ng-container *ngTemplateOutlet="body"></ng-container>
      </button>
    </ng-template>

    <ng-template #body>
      <span class="dc-tile__icon" aria-hidden="true">
        <i class="fa" [ngClass]="icon"></i>
      </span>

      <span class="dc-tile__text">
        <span class="dc-tile__label">{{ label }}</span>
        <span class="dc-tile__hint" *ngIf="hint">{{ hint }}</span>
      </span>

      <span class="dc-tile__badge" *ngIf="badge">
        {{ badge }}<span class="dc-tile__badge-label" *ngIf="badgeLabel"> {{ badgeLabel }}</span>
      </span>

      <i class="fa fa-chevron-right dc-tile__go" aria-hidden="true"></i>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }

    .dc-tile {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      gap: var(--dc-gap, 1rem);
      text-align: left;
      text-decoration: none;
      min-height: var(--dc-touch-xl, 4.5rem);
      padding: var(--dc-gap, 1rem);
      font-family: inherit;
      background: var(--dc-surface, #fff);
      color: var(--dc-ink, #2c3e50);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius-lg, 0.875rem);
      cursor: pointer;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
    }
    .dc-tile:hover:not(:disabled) {
      border-color: var(--dc-brand, #1e5ba8);
      box-shadow: 0 4px 14px rgba(30, 91, 168, 0.18);
      transform: translateY(-2px);
    }
    .dc-tile:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-tile:disabled { opacity: 0.5; cursor: not-allowed; }

    /* One tile per screen may be the obvious next action. Use accent sparingly:
       if everything is highlighted, nothing is. */
    .dc-tile--accent {
      border-color: var(--dc-brand, #1e5ba8);
      background: var(--dc-info-bg, #dbeafe);
    }

    .dc-tile__icon {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      border-radius: var(--dc-radius, 0.625rem);
      background: var(--dc-info-bg, #dbeafe);
      color: var(--dc-info-ink, #1d4ed8);
      font-size: 1.35rem;
    }

    .dc-tile__text { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; }

    .dc-tile__label {
      font-size: var(--dc-text-lg, 1.125rem);
      font-weight: 600;
      line-height: 1.3;
    }
    .dc-tile__hint {
      font-size: var(--dc-text-sm, 0.875rem);
      color: var(--dc-ink-soft, #666);
      line-height: 1.35;
      margin-top: 0.15rem;
    }

    .dc-tile__badge {
      flex: 0 0 auto;
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 700;
      color: var(--dc-wait-ink, #b45309);
      background: var(--dc-wait-bg, #fef3c7);
      border: 1px solid var(--dc-wait-line, #fcd34d);
      border-radius: 999px;
      padding: 0.2rem 0.7rem;
      white-space: nowrap;
    }
    .dc-tile__badge-label { font-weight: 500; }

    .dc-tile__go { flex: 0 0 auto; color: var(--dc-ink-soft, #666); opacity: 0.6; }
  `]
})
export class DcTaskTileComponent {
  /** Font Awesome glyph, e.g. 'fa-user-plus'. */
  @Input() icon = 'fa-arrow-right';

  /** The task, in the user's words. Start with a verb. */
  @Input() label = '';

  /** One line saying what happens when they click. */
  @Input() hint = '';

  /** Optional count of waiting work, e.g. pending reports. */
  @Input() badge: number | string | null = null;

  /** Word after the badge number, e.g. 'waiting'. */
  @Input() badgeLabel = '';

  /** Route to navigate to. Leave empty and handle (open) instead. */
  @Input() routerLink: string | any[] | null = null;

  /** Query params for routerLink. */
  @Input() queryParams: Record<string, any> | null = null;

  /** Highlight this tile as the expected next action. At most one per screen. */
  @Input() accent = false;

  @Input() disabled = false;

  /** Fires when a tile without a routerLink is clicked. */
  @Output() open = new EventEmitter<void>();
}
