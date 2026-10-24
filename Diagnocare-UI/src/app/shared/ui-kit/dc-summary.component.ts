import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** One label/value line in a <dc-summary>. */
export interface DcSummaryRow {
  label: string;
  /** Anything printable. null/undefined/'' renders as a visible "Not entered". */
  value: any;
  /** Optional: highlight this line (an amount, a warning). */
  tone?: 'normal' | 'strong' | 'warn';
}

/**
 * DcSummaryComponent — "check this is right before we save it".
 *
 * Why this exists
 * ───────────────
 * Almost every mistake that reaches a printed report was typed correctly into
 * the wrong box, or left blank and never noticed. A review panel costs one
 * screen and catches most of them, because reading back "Age: not entered"
 * is much easier than spotting an empty box in a form of thirty.
 *
 * Use it as the last step of a wizard, and inside confirmation dialogs for
 * anything irreversible ("you are about to cancel these 3 tests").
 *
 * Blank values are shown, not hidden — a missing value the user cannot see is
 * a missing value they cannot fix.
 *
 * Usage:
 *   <dc-summary title="Please check these details"
 *               [rows]="reviewRows"
 *               editLabel="Change something"
 *               (edit)="stepIndex = 0">
 *   </dc-summary>
 *
 *   get reviewRows(): DcSummaryRow[] {
 *     const f = this.form.value;
 *     return [
 *       { label: 'Patient name', value: f.patient_Name, tone: 'strong' },
 *       { label: 'Age / Sex',    value: f.age + ' / ' + f.gender },
 *       { label: 'Tests booked', value: this.selectedTests.length + ' selected' },
 *       { label: 'Amount due',   value: '₹' + f.netAmount, tone: 'strong' },
 *     ];
 *   }
 */
@Component({
  selector: 'dc-summary',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-summary">
      <div class="dc-summary__head" *ngIf="title || editLabel">
        <h3 class="dc-summary__title" *ngIf="title">{{ title }}</h3>
        <button type="button" class="dc-summary__edit" *ngIf="editLabel" (click)="edit.emit()">
          <i class="fa fa-pencil" aria-hidden="true"></i>
          <span>{{ editLabel }}</span>
        </button>
      </div>

      <dl class="dc-summary__list">
        <ng-container *ngFor="let row of rows">
          <dt class="dc-summary__label">{{ row.label }}</dt>
          <dd class="dc-summary__value"
              [class.dc-summary__value--strong]="row.tone === 'strong'"
              [class.dc-summary__value--warn]="row.tone === 'warn'"
              [class.dc-summary__value--blank]="isBlank(row.value)">
            {{ isBlank(row.value) ? blankText : row.value }}
          </dd>
        </ng-container>
      </dl>

      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dc-summary {
      background: var(--dc-surface-muted, #f8f9fa);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius-lg, 0.875rem);
      padding: var(--dc-gap, 1rem) var(--dc-gap-lg, 1.5rem);
    }

    .dc-summary__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--dc-gap-sm, 0.6rem);
      flex-wrap: wrap;
      margin-bottom: var(--dc-gap, 1rem);
    }
    .dc-summary__title {
      margin: 0;
      font-size: var(--dc-text-lg, 1.125rem);
      font-weight: 700;
      color: var(--dc-ink, #2c3e50);
    }
    .dc-summary__edit {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: var(--dc-touch, 3rem);
      padding: 0 1rem;
      font-family: inherit;
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      color: var(--dc-info-ink, #1d4ed8);
      background: var(--dc-surface, #fff);
      border: var(--dc-border, 2px) solid var(--dc-info-line, #93c5fd);
      border-radius: var(--dc-radius, 0.625rem);
      cursor: pointer;
    }
    .dc-summary__edit:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }

    /* Two columns on a comfortable screen, one on a narrow one — the value
       always sits directly under or beside its own label, never adrift. */
    .dc-summary__list {
      display: grid;
      grid-template-columns: minmax(8rem, 14rem) 1fr;
      gap: 0.5rem var(--dc-gap, 1rem);
      margin: 0;
    }
    @media (max-width: 32rem) {
      .dc-summary__list { grid-template-columns: 1fr; gap: 0.15rem; }
      .dc-summary__value { margin-bottom: 0.6rem; }
    }

    .dc-summary__label {
      font-size: var(--dc-text-sm, 0.875rem);
      color: var(--dc-ink-soft, #666);
      line-height: 1.5;
    }
    .dc-summary__value {
      margin: 0;
      font-size: var(--dc-text, 1rem);
      color: var(--dc-ink, #2c3e50);
      line-height: 1.5;
      word-break: break-word;
    }
    .dc-summary__value--strong { font-weight: 700; font-size: var(--dc-text-lg, 1.125rem); }
    .dc-summary__value--warn   { color: var(--dc-wait-ink, #b45309); font-weight: 600; }

    /* A blank is called out, not silently skipped. */
    .dc-summary__value--blank {
      color: var(--dc-danger-ink, #b91c1c);
      font-style: italic;
      font-weight: 600;
    }
  `]
})
export class DcSummaryComponent {
  /** Heading above the list. Phrase it as an instruction. */
  @Input() title = '';

  /** The label/value lines, in the order the user filled them in. */
  @Input() rows: DcSummaryRow[] = [];

  /** Words shown for an empty value. */
  @Input() blankText = 'Not entered';

  /** Set to '' to hide the edit button. */
  @Input() editLabel = 'Change';
  @Output() edit = new EventEmitter<void>();

  isBlank(value: any): boolean {
    return value === null || value === undefined || `${value}`.trim() === '';
  }
}
