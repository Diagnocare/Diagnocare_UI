import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** The five meanings a status can carry. Everything maps onto one of these. */
export type DcTone = 'ok' | 'wait' | 'info' | 'danger' | 'idle';

/**
 * Known statuses from across the app, mapped to a tone and a glyph once, here,
 * so "Pending" is the same amber clock on the patient list, the test list and
 * the summary reports. Anything not in this table falls back to a neutral grey
 * pill — never to an unlabelled colour.
 */
const STATUS_MAP: Record<string, { tone: DcTone; icon: string }> = {
  // Report / booking progress
  completed:   { tone: 'ok',     icon: 'fa-check-circle' },
  complete:    { tone: 'ok',     icon: 'fa-check-circle' },
  done:        { tone: 'ok',     icon: 'fa-check-circle' },
  approved:    { tone: 'ok',     icon: 'fa-check-circle' },
  paid:        { tone: 'ok',     icon: 'fa-check-circle' },
  active:      { tone: 'ok',     icon: 'fa-check-circle' },
  present:     { tone: 'ok',     icon: 'fa-check-circle' },

  pending:     { tone: 'wait',   icon: 'fa-clock-o' },
  partial:     { tone: 'wait',   icon: 'fa-adjust' },
  inprogress:  { tone: 'wait',   icon: 'fa-spinner' },
  'in progress': { tone: 'wait', icon: 'fa-spinner' },
  unpaid:      { tone: 'wait',   icon: 'fa-exclamation-circle' },
  urgent:      { tone: 'wait',   icon: 'fa-bolt' },
  withdrawalrequested: { tone: 'wait', icon: 'fa-undo' },

  rejected:    { tone: 'danger', icon: 'fa-times-circle' },
  cancelled:   { tone: 'danger', icon: 'fa-ban' },
  canceled:    { tone: 'danger', icon: 'fa-ban' },
  deactivated: { tone: 'danger', icon: 'fa-user-times' },
  expired:     { tone: 'danger', icon: 'fa-calendar-times-o' },
  absent:      { tone: 'danger', icon: 'fa-times-circle' },
  overdue:     { tone: 'danger', icon: 'fa-exclamation-triangle' },

  normal:      { tone: 'idle',   icon: 'fa-minus-circle' },
  draft:       { tone: 'idle',   icon: 'fa-pencil' },
  withdrawn:   { tone: 'idle',   icon: 'fa-undo' },
  leave:       { tone: 'info',   icon: 'fa-plane' },
  holiday:     { tone: 'info',   icon: 'fa-calendar' },
  scheduled:   { tone: 'info',   icon: 'fa-calendar-check-o' },
};

/**
 * DcStatusComponent — a status shown as icon + word + colour, always all three.
 *
 * Why this exists
 * ───────────────
 * Status is the fastest thing to read on a list and the easiest to get wrong.
 * A coloured dot alone is meaningless to a new employee and invisible to the
 * ~8% of men with colour-blindness; a bare word is easy to miss when scanning.
 * Pairing an icon, a word and a colour makes the same status recognisable at a
 * glance, readable when unsure, and correct in every theme.
 *
 * Because the mapping lives in one table, a status looks identical wherever it
 * appears — which is what lets staff learn it once.
 *
 * Usage:
 *   <dc-status [status]="patient.status"></dc-status>
 *   <dc-status status="Urgent" tone="wait" icon="fa-bolt"></dc-status>
 *   <dc-status [status]="test.status" label="Report ready"></dc-status>
 */
@Component({
  selector: 'dc-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="dc-status" [ngClass]="'dc-status--' + resolvedTone">
      <i class="fa dc-status__icon" [ngClass]="resolvedIcon" aria-hidden="true"></i>
      <span class="dc-status__text">{{ label || status || '—' }}</span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }

    .dc-status {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.3rem 0.7rem;
      border-radius: 999px;
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
      border: 1px solid transparent;
    }
    .dc-status__icon { font-size: 0.95em; }

    .dc-status--ok {
      color: var(--dc-ok-ink, #15803d);
      background: var(--dc-ok-bg, #dcfce7);
      border-color: var(--dc-ok-line, #86efac);
    }
    .dc-status--wait {
      color: var(--dc-wait-ink, #b45309);
      background: var(--dc-wait-bg, #fef3c7);
      border-color: var(--dc-wait-line, #fcd34d);
    }
    .dc-status--info {
      color: var(--dc-info-ink, #1d4ed8);
      background: var(--dc-info-bg, #dbeafe);
      border-color: var(--dc-info-line, #93c5fd);
    }
    .dc-status--danger {
      color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
      border-color: var(--dc-danger-line, #fca5a5);
    }
    .dc-status--idle {
      color: var(--dc-idle-ink, #475569);
      background: var(--dc-idle-bg, #f1f5f9);
      border-color: var(--dc-idle-line, #cbd5e1);
    }
  `]
})
export class DcStatusComponent {
  /** The status value straight from the API, e.g. 'Pending'.
   *  Accepts undefined too, because most DTO fields are optional and a status
   *  pill is never worth a template type error. */
  @Input() status: string | null | undefined = '';

  /** Override the displayed words without changing the lookup. */
  @Input() label = '';

  /** Override the tone when the status is not in the shared table. */
  @Input() tone: DcTone | null = null;

  /** Override the glyph. */
  @Input() icon = '';

  get resolvedTone(): DcTone {
    return this.tone ?? this.lookup?.tone ?? 'idle';
  }

  get resolvedIcon(): string {
    return this.icon || this.lookup?.icon || 'fa-circle-o';
  }

  private get lookup() {
    const key = (this.status || '').toString().trim().toLowerCase();
    return STATUS_MAP[key];
  }
}
