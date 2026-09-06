import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** A secondary detail shown under a record's title. */
export interface DcRecordFact {
  /** Short caption, e.g. 'Age / Sex'. */
  label: string;
  /** The value. Blanks render as '—' rather than collapsing the layout. */
  value: any;
}

/**
 * DcRecordComponent — one row of a list, readable without a table.
 *
 * Why this exists
 * ───────────────
 * The patient list is a nine-column table with sortable headers, colour-coded
 * rows and three icon-only buttons at the right edge. On a laptop screen the
 * user reads left to right across a thin row and loses their line; on a
 * tablet the table scrolls sideways and the action buttons disappear off the
 * edge entirely.
 *
 * A record card puts the same information in reading order — who, then the
 * facts, then the status, then what you can do about it — and keeps the
 * actions attached to the record they act on, at any width. Cards are slower
 * to scan than a table for an expert doing bulk work, so keep the table for
 * power users and offer this as the default view; both can read the same data.
 *
 * Usage:
 *   <dc-record *ngFor="let p of patients"
 *              [title]="p.patient_Name"
 *              [subtitle]="p.relative_Name"
 *              [reference]="'ID ' + p.patient_Id"
 *              [facts]="[
 *                { label: 'Registered', value: p.patient_Reg_Date },
 *                { label: 'Age / Sex',  value: p.patient_Age + ' / ' + p.patient_Gender }
 *              ]"
 *              [selected]="p.patient_Id === activeId">
 *
 *     <div status><dc-status [status]="p.status"></dc-status></div>
 *
 *     <div actions>
 *       <dc-action type="results" (clicked)="viewTests(p)"></dc-action>
 *       <dc-action type="edit"    (clicked)="edit(p)"></dc-action>
 *       <dc-action type="delete"  label="Deactivate" (clicked)="deactivate(p)"></dc-action>
 *     </div>
 *   </dc-record>
 */
@Component({
  selector: 'dc-record',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="dc-record" [class.dc-record--selected]="selected" [class.dc-record--muted]="muted">

      <div class="dc-record__main">
        <div class="dc-record__heading">
          <h3 class="dc-record__title">{{ title }}</h3>
          <span class="dc-record__reference" *ngIf="reference">{{ reference }}</span>
        </div>

        <p class="dc-record__subtitle" *ngIf="subtitle">{{ subtitle }}</p>

        <dl class="dc-record__facts" *ngIf="facts?.length">
          <div class="dc-record__fact" *ngFor="let fact of facts">
            <dt>{{ fact.label }}</dt>
            <dd>{{ isBlank(fact.value) ? '—' : fact.value }}</dd>
          </div>
        </dl>
      </div>

      <div class="dc-record__status">
        <ng-content select="[status]"></ng-content>
      </div>

      <div class="dc-record__actions">
        <ng-content select="[actions]"></ng-content>
      </div>
    </article>
  `,
  styles: [`
    :host { display: block; margin-bottom: var(--dc-gap-sm, 0.6rem); }

    .dc-record {
      display: flex;
      align-items: flex-start;
      gap: var(--dc-gap, 1rem);
      flex-wrap: wrap;
      padding: var(--dc-gap, 1rem);
      background: var(--dc-surface, #fff);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius-lg, 0.875rem);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .dc-record:hover { border-color: var(--dc-info-line, #93c5fd); }
    .dc-record--selected {
      border-color: var(--dc-brand, #1e5ba8);
      box-shadow: 0 0 0 1px var(--dc-brand, #1e5ba8) inset;
    }
    /* Deactivated / cancelled records stay legible but visibly secondary —
       greyed out, never hidden, so nobody wonders where a record went. */
    .dc-record--muted { opacity: 0.72; background: var(--dc-surface-muted, #f8f9fa); }

    .dc-record__main { flex: 1 1 18rem; min-width: 0; }

    .dc-record__heading {
      display: flex;
      align-items: baseline;
      gap: 0.6rem;
      flex-wrap: wrap;
    }
    .dc-record__title {
      margin: 0;
      font-size: var(--dc-text-lg, 1.125rem);
      font-weight: 700;
      color: var(--dc-ink, #2c3e50);
      line-height: 1.3;
    }
    .dc-record__reference {
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      color: var(--dc-ink-soft, #666);
      background: var(--dc-surface-muted, #f8f9fa);
      border: 1px solid var(--dc-line, #e1e8ed);
      border-radius: 999px;
      padding: 0.1rem 0.55rem;
      white-space: nowrap;
    }
    .dc-record__subtitle {
      margin: 0.15rem 0 0;
      font-size: var(--dc-text-sm, 0.875rem);
      color: var(--dc-ink-soft, #666);
    }

    .dc-record__facts {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem var(--dc-gap-lg, 1.5rem);
      margin: var(--dc-gap-sm, 0.6rem) 0 0;
    }
    .dc-record__fact dt {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: var(--dc-ink-soft, #666);
      font-weight: 600;
    }
    .dc-record__fact dd {
      margin: 0;
      font-size: var(--dc-text, 1rem);
      color: var(--dc-ink, #2c3e50);
    }

    .dc-record__status { flex: 0 0 auto; padding-top: 0.15rem; }

    .dc-record__actions {
      flex: 0 0 auto;
      display: flex;
      flex-wrap: wrap;
      gap: var(--dc-gap-xs, 0.35rem);
      margin-left: auto;
    }

    @media (max-width: 40rem) {
      .dc-record__actions { margin-left: 0; width: 100%; }
      .dc-record__actions ::ng-deep dc-action { flex: 1 1 8rem; }
      .dc-record__actions ::ng-deep .dc-action { width: 100%; }
    }
  `]
})
export class DcRecordComponent {
  /** The one thing that identifies this record — usually a person's name. */
  @Input() title = '';

  /** A second line: father's name, test name, whatever qualifies the title. */
  @Input() subtitle = '';

  /** A short id or code, shown as a pill beside the title. */
  @Input() reference = '';

  /** Two to four supporting facts. More than that belongs on a detail screen. */
  @Input() facts: DcRecordFact[] = [];

  /** Highlight this record as the one currently open. */
  @Input() selected = false;

  /** Dim a deactivated / cancelled record without hiding it. */
  @Input() muted = false;

  isBlank(value: any): boolean {
    return value === null || value === undefined || `${value}`.trim() === '';
  }
}
