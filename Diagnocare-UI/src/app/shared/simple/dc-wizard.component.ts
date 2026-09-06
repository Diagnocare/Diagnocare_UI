import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/** One step in a <dc-wizard>. */
export interface DcWizardStep {
  /** Shown in the progress rail and as the heading. Name the task, not the data:
   *  "Who is the patient?" beats "Demographics". */
  title: string;
  /** One line under the heading explaining what to do on this step. */
  hint?: string;
}

/**
 * DcWizardComponent — a long form served one step at a time.
 *
 * Why this exists
 * ───────────────
 * Patient registration is currently one very long form. A confident user
 * scrolls it happily; an unsure one gets lost, misses a required field halfway
 * down, presses Save, and gets a wall of red. Splitting the same form into
 * three or four short steps fixes three things at once: less on screen, a
 * visible sense of progress, and validation caught at the step where the
 * mistake was made, right next to the box that caused it.
 *
 * The wizard owns the chrome — progress, headings, Back/Next/Finish — and
 * nothing else. You keep your existing FormGroup and simply show the fields
 * for the current step.
 *
 * Usage:
 *   <dc-wizard [steps]="steps"
 *              [(index)]="stepIndex"
 *              [canContinue]="isStepValid(stepIndex)"
 *              blockReason="Please fill in the patient's name and age first."
 *              finishLabel="Register patient"
 *              [busy]="saving"
 *              (finish)="save()">
 *
 *     <ng-container *ngIf="stepIndex === 0"> …fields… </ng-container>
 *     <ng-container *ngIf="stepIndex === 1"> …fields… </ng-container>
 *   </dc-wizard>
 *
 * `canContinue` gates Next. When it is false the button stays visible but
 * disabled and `blockReason` says, in plain words, what is missing — never a
 * silent dead end.
 */
@Component({
  selector: 'dc-wizard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-wizard">

      <!-- ── Progress ────────────────────────────────────────────────────── -->
      <div class="dc-wizard__progress">
        <p class="dc-wizard__counter">
          Step {{ index + 1 }} of {{ steps.length }}
        </p>

        <div class="dc-wizard__rail"
             role="progressbar"
             [attr.aria-valuenow]="index + 1"
             aria-valuemin="1"
             [attr.aria-valuemax]="steps.length"
             [attr.aria-label]="'Step ' + (index + 1) + ' of ' + steps.length">
          <span class="dc-wizard__rail-fill" [style.width.%]="percent"></span>
        </div>

        <ol class="dc-wizard__dots">
          <li *ngFor="let step of steps; let i = index"
              class="dc-wizard__dot"
              [class.dc-wizard__dot--done]="i < index"
              [class.dc-wizard__dot--current]="i === index">
            <button type="button"
                    class="dc-wizard__dot-btn"
                    [disabled]="i > index"
                    [attr.aria-current]="i === index ? 'step' : null"
                    (click)="goTo(i)">
              <span class="dc-wizard__dot-mark" aria-hidden="true">
                <i class="fa fa-check" *ngIf="i < index"></i>
                <ng-container *ngIf="i >= index">{{ i + 1 }}</ng-container>
              </span>
              <span class="dc-wizard__dot-label">{{ step.title }}</span>
            </button>
          </li>
        </ol>
      </div>

      <!-- ── Current step ────────────────────────────────────────────────── -->
      <div class="dc-wizard__panel">
        <h2 class="dc-wizard__title">{{ current?.title }}</h2>
        <p class="dc-wizard__hint" *ngIf="current?.hint">{{ current?.hint }}</p>

        <div class="dc-wizard__body">
          <ng-content></ng-content>
        </div>
      </div>

      <!-- ── Navigation ─────────────────────────────────────────────────────
           Sticky, so Back and Next never scroll out of reach on a long step. -->
      <div class="dc-wizard__nav">
        <p class="dc-wizard__blocked" *ngIf="!canContinue && blockReason" role="status">
          <i class="fa fa-info-circle" aria-hidden="true"></i>
          <span>{{ blockReason }}</span>
        </p>

        <div class="dc-wizard__buttons">
          <button type="button"
                  class="dc-wizard__btn dc-wizard__btn--back"
                  [disabled]="index === 0 || busy"
                  (click)="back()">
            <i class="fa fa-arrow-left" aria-hidden="true"></i>
            <span>{{ backLabel }}</span>
          </button>

          <button type="button"
                  class="dc-wizard__btn dc-wizard__btn--next"
                  *ngIf="!isLast"
                  [disabled]="!canContinue || busy"
                  (click)="next()">
            <span>{{ nextLabel }}</span>
            <i class="fa fa-arrow-right" aria-hidden="true"></i>
          </button>

          <button type="button"
                  class="dc-wizard__btn dc-wizard__btn--finish"
                  *ngIf="isLast"
                  [disabled]="!canContinue || busy"
                  (click)="finish.emit()">
            <i class="fa fa-spinner fa-spin" *ngIf="busy" aria-hidden="true"></i>
            <i class="fa fa-check" *ngIf="!busy" aria-hidden="true"></i>
            <span>{{ busy ? busyLabel : finishLabel }}</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .dc-wizard {
      background: var(--dc-surface, #fff);
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius-lg, 0.875rem);
      overflow: hidden;
    }

    /* ── Progress ───────────────────────────────────────────────────────── */
    .dc-wizard__progress {
      padding: var(--dc-gap, 1rem) var(--dc-gap-lg, 1.5rem);
      background: var(--dc-surface-muted, #f8f9fa);
      border-bottom: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
    }

    /* The plain sentence matters more than the graphics: people who ignore a
       progress bar still read "Step 2 of 4". */
    .dc-wizard__counter {
      margin: 0 0 var(--dc-gap-xs, 0.35rem);
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--dc-ink-soft, #666);
    }

    .dc-wizard__rail {
      height: 0.5rem;
      border-radius: 999px;
      background: var(--dc-idle-bg, #f1f5f9);
      border: 1px solid var(--dc-line, #e1e8ed);
      overflow: hidden;
    }
    .dc-wizard__rail-fill {
      display: block;
      height: 100%;
      background: var(--dc-brand, #1e5ba8);
      transition: width 0.25s ease;
    }

    .dc-wizard__dots {
      display: flex;
      flex-wrap: wrap;
      gap: var(--dc-gap-sm, 0.6rem);
      list-style: none;
      margin: var(--dc-gap-sm, 0.6rem) 0 0;
      padding: 0;
    }
    .dc-wizard__dot { flex: 0 1 auto; }

    .dc-wizard__dot-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: 2.25rem;
      padding: 0.25rem 0.6rem 0.25rem 0.25rem;
      font-family: inherit;
      font-size: var(--dc-text-sm, 0.875rem);
      color: var(--dc-ink-soft, #666);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 999px;
      cursor: pointer;
    }
    /* Completed steps stay clickable — going back to check something is normal
       and should not cost the user their place. Future steps do not. */
    .dc-wizard__dot-btn:disabled { cursor: default; opacity: 0.55; }
    .dc-wizard__dot-btn:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }

    .dc-wizard__dot-mark {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 50%;
      font-weight: 700;
      font-size: 0.8rem;
      background: var(--dc-idle-bg, #f1f5f9);
      color: var(--dc-idle-ink, #475569);
      border: 1px solid var(--dc-idle-line, #cbd5e1);
    }
    .dc-wizard__dot--done .dc-wizard__dot-mark {
      background: var(--dc-ok-bg, #dcfce7);
      color: var(--dc-ok-ink, #15803d);
      border-color: var(--dc-ok-line, #86efac);
    }
    .dc-wizard__dot--current .dc-wizard__dot-btn {
      color: var(--dc-ink, #2c3e50);
      font-weight: 700;
      background: var(--dc-surface, #fff);
      border-color: var(--dc-brand, #1e5ba8);
    }
    .dc-wizard__dot--current .dc-wizard__dot-mark {
      background: var(--dc-brand, #1e5ba8);
      color: #fff;
      border-color: var(--dc-brand, #1e5ba8);
    }

    /* ── Panel ──────────────────────────────────────────────────────────── */
    .dc-wizard__panel { padding: var(--dc-gap-lg, 1.5rem); }

    .dc-wizard__title {
      margin: 0;
      font-size: var(--dc-text-xl, 1.375rem);
      font-weight: 700;
      color: var(--dc-ink, #2c3e50);
      line-height: 1.3;
    }
    .dc-wizard__hint {
      margin: 0.35rem 0 0;
      font-size: var(--dc-text, 1rem);
      color: var(--dc-ink-soft, #666);
      line-height: 1.45;
    }
    .dc-wizard__body { margin-top: var(--dc-gap-lg, 1.5rem); }

    /* ── Navigation ─────────────────────────────────────────────────────── */
    .dc-wizard__nav {
      position: sticky;
      bottom: 0;
      padding: var(--dc-gap, 1rem) var(--dc-gap-lg, 1.5rem);
      background: var(--dc-surface, #fff);
      border-top: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
    }

    /* A disabled Next with no explanation is a dead end. This line is the
       explanation, and it sits directly above the button it explains. */
    .dc-wizard__blocked {
      display: flex;
      align-items: flex-start;
      gap: 0.45rem;
      margin: 0 0 var(--dc-gap-sm, 0.6rem);
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      color: var(--dc-wait-ink, #b45309);
      background: var(--dc-wait-bg, #fef3c7);
      border: 1px solid var(--dc-wait-line, #fcd34d);
      border-radius: var(--dc-radius, 0.625rem);
      padding: 0.5rem 0.75rem;
      line-height: 1.4;
    }
    .dc-wizard__blocked i { margin-top: 0.15em; }

    .dc-wizard__buttons {
      display: flex;
      gap: var(--dc-gap-sm, 0.6rem);
      justify-content: space-between;
      flex-wrap: wrap;
    }

    .dc-wizard__btn {
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
    .dc-wizard__btn:focus-visible {
      outline: none;
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }
    .dc-wizard__btn:disabled { opacity: 0.45; cursor: not-allowed; }

    .dc-wizard__btn--back {
      background: var(--dc-idle-bg, #f1f5f9);
      color: var(--dc-idle-ink, #475569);
      border-color: var(--dc-idle-line, #cbd5e1);
    }
    .dc-wizard__btn--next,
    .dc-wizard__btn--finish {
      flex: 1 1 12rem;
      background: var(--dc-brand, #1e5ba8);
      color: #fff;
      font-size: var(--dc-text-lg, 1.125rem);
    }
    .dc-wizard__btn--finish { background: #15803d; }
    .dc-wizard__btn--next:hover:not(:disabled),
    .dc-wizard__btn--finish:hover:not(:disabled) { filter: brightness(1.1); }

    @media (max-width: 30rem) {
      .dc-wizard__panel,
      .dc-wizard__nav,
      .dc-wizard__progress { padding-left: var(--dc-gap, 1rem); padding-right: var(--dc-gap, 1rem); }
      .dc-wizard__btn { flex: 1 1 100%; }
      .dc-wizard__dot-label { display: none; }
    }
  `]
})
export class DcWizardComponent {
  /** The steps, in order. Three to five is the useful range. */
  @Input() steps: DcWizardStep[] = [];

  /** Zero-based index of the visible step. Two-way bindable. */
  @Input() index = 0;
  @Output() indexChange = new EventEmitter<number>();

  /** False disables Next/Finish. Bind it to this step's validity. */
  @Input() canContinue = true;

  /** Plain-language reason shown when canContinue is false. Always supply one. */
  @Input() blockReason = '';

  @Input() backLabel = 'Back';
  @Input() nextLabel = 'Next';

  /** Name the outcome on the last step: "Register patient", not "Submit". */
  @Input() finishLabel = 'Finish';

  /** True while saving — disables the buttons and shows a spinner. */
  @Input() busy = false;
  @Input() busyLabel = 'Saving…';

  /** Fires when the user presses the finish button on the last step. */
  @Output() finish = new EventEmitter<void>();

  get current(): DcWizardStep | undefined { return this.steps[this.index]; }
  get isLast(): boolean { return this.index >= this.steps.length - 1; }
  get percent(): number {
    if (!this.steps.length) return 0;
    return ((this.index + 1) / this.steps.length) * 100;
  }

  next(): void {
    if (!this.canContinue || this.isLast) return;
    this.goTo(this.index + 1);
  }

  back(): void {
    if (this.index === 0) return;
    this.goTo(this.index - 1);
  }

  goTo(index: number): void {
    if (index < 0 || index >= this.steps.length) return;
    // Never jump forward past an unvalidated step via the progress rail.
    if (index > this.index && !this.canContinue) return;
    this.index = index;
    this.indexChange.emit(index);
    // Put the user at the top of the new step — mid-form scroll position after
    // a step change is disorienting.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}
