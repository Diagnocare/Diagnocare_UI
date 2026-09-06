import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl } from '@angular/forms';
import { resolveFirstError } from '../validators/validation-messages';

/**
 * DcFieldComponent — one labelled form field, done the same way every time.
 *
 * Why this exists
 * ───────────────
 * Across the app a field is currently four or five hand-written elements
 * (label, asterisk, input, <app-field-error>, sometimes a hint) and every
 * screen assembles them slightly differently. A user who cannot see the
 * pattern has to re-learn each screen. This component makes one field one
 * tag, so every field in the app looks and behaves identically:
 *
 *   • the label sits above the box, never beside it (never truncated)
 *   • "Required" is a word, not only a red star screen readers skip
 *   • the hint explains what to type BEFORE the user types it
 *   • the error appears under the box, in plain language, with an icon
 *   • the box itself is at least 48px tall whatever markup you project
 *
 * Usage — the control is projected, so it works with any input you already use
 * (plain input, select, <app-date-picker>, ng-select …):
 *
 *   <dc-field label="Patient name"
 *             hint="As written on the ID proof"
 *             [control]="form.get('patient_Name')"
 *             [submitted]="submitted">
 *     <input class="form-control" formControlName="patient_Name" placeholder="e.g. Ramesh Kumar">
 *   </dc-field>
 *
 * You can also skip reactive forms entirely and pass the message yourself:
 *
 *   <dc-field label="Patient ID" [required]="true" [error]="idError">
 *     <input class="form-control" [(ngModel)]="patientId">
 *   </dc-field>
 */
@Component({
  selector: 'dc-field',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dc-field" [class.dc-field--invalid]="showError">
      <label class="dc-field__label" [attr.for]="for || null">
        <span class="dc-field__label-text">{{ label }}</span>
        <span class="dc-field__required" *ngIf="required">Required</span>
        <span class="dc-field__optional" *ngIf="!required && showOptional">Optional</span>
      </label>

      <p class="dc-field__hint" *ngIf="hint">{{ hint }}</p>

      <div class="dc-field__control">
        <ng-content></ng-content>
      </div>

      <p class="dc-field__error" *ngIf="showError" role="alert">
        <i class="fa fa-exclamation-circle" aria-hidden="true"></i>
        <span>{{ message }}</span>
      </p>
    </div>
  `,
  styles: [`
    :host { display: block; margin-bottom: var(--dc-gap, 1rem); }

    .dc-field__label {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      flex-wrap: wrap;
      font-size: var(--dc-text-lg, 1.125rem);
      font-weight: 600;
      color: var(--dc-ink, #2c3e50);
      margin-bottom: var(--dc-gap-xs, 0.35rem);
      line-height: 1.3;
    }

    /* "Required" as a readable word rather than a lone asterisk: people who do
       not know the convention still understand it, and so do screen readers. */
    .dc-field__required {
      font-size: 0.7em;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
      border: 1px solid var(--dc-danger-line, #fca5a5);
      border-radius: 999px;
      padding: 0.1em 0.55em;
      white-space: nowrap;
    }
    .dc-field__optional {
      font-size: 0.75em;
      font-weight: 500;
      color: var(--dc-ink-soft, #666);
    }

    .dc-field__hint {
      font-size: var(--dc-text-sm, 0.875rem);
      color: var(--dc-ink-soft, #666);
      margin: 0 0 var(--dc-gap-xs, 0.35rem);
      line-height: 1.4;
    }

    /* Size and style whatever control the caller projected, so a field is the
       same height everywhere without every screen remembering to say so. */
    .dc-field__control ::ng-deep input:not([type="checkbox"]):not([type="radio"]),
    .dc-field__control ::ng-deep select,
    .dc-field__control ::ng-deep textarea,
    .dc-field__control ::ng-deep .form-control,
    .dc-field__control ::ng-deep .form-select {
      width: 100%;
      min-height: var(--dc-touch, 3rem);
      font-size: var(--dc-text, 1rem);
      padding: 0.65rem 0.85rem;
      border: var(--dc-border, 2px) solid var(--dc-line, #e1e8ed);
      border-radius: var(--dc-radius, 0.625rem);
      background: var(--dc-surface, #fff);
      color: var(--dc-ink, #2c3e50);
    }
    .dc-field__control ::ng-deep textarea { min-height: 6rem; }

    .dc-field__control ::ng-deep input:focus,
    .dc-field__control ::ng-deep select:focus,
    .dc-field__control ::ng-deep textarea:focus,
    .dc-field__control ::ng-deep .form-control:focus,
    .dc-field__control ::ng-deep .form-select:focus {
      outline: none;
      border-color: var(--dc-brand, #1e5ba8);
      box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,0.35));
    }

    /* A field in error is outlined AND captioned — colour is never the only cue. */
    .dc-field--invalid .dc-field__control ::ng-deep input,
    .dc-field--invalid .dc-field__control ::ng-deep select,
    .dc-field--invalid .dc-field__control ::ng-deep textarea,
    .dc-field--invalid .dc-field__control ::ng-deep .form-control,
    .dc-field--invalid .dc-field__control ::ng-deep .form-select {
      border-color: var(--dc-danger-ink, #b91c1c);
      background: var(--dc-danger-bg, #fee2e2);
    }

    .dc-field__error {
      display: flex;
      align-items: flex-start;
      gap: 0.45rem;
      margin: var(--dc-gap-xs, 0.35rem) 0 0;
      font-size: var(--dc-text-sm, 0.875rem);
      font-weight: 600;
      color: var(--dc-danger-ink, #b91c1c);
      line-height: 1.4;
    }
    .dc-field__error i { margin-top: 0.15em; }
  `]
})
export class DcFieldComponent {
  /** The label shown above the control. Write it as a person would say it. */
  @Input() label = '';

  /** One short sentence telling the user what to type. Optional but valuable. */
  @Input() hint = '';

  /** id of the projected control, so clicking the label focuses it. */
  @Input() for = '';

  /** Reactive control to read validity and error messages from. */
  @Input() control: AbstractControl | null = null;

  /**
   * Force the error to show even before the user has touched the field —
   * bind this to your component's "submitted" flag so pressing Save reveals
   * every problem at once instead of one at a time.
   */
  @Input() submitted = false;

  /** Override the message entirely (for template-driven forms). */
  @Input() error = '';

  /** Show a "Required" badge. Auto-detected from the control when one is given. */
  @Input() set required(value: boolean) { this.requiredOverride = value; }
  get required(): boolean {
    if (this.requiredOverride !== null) return this.requiredOverride;
    return this.controlIsRequired;
  }

  /** Label optional fields explicitly on forms where most fields are required. */
  @Input() showOptional = false;

  private requiredOverride: boolean | null = null;

  get showError(): boolean {
    if (this.error) return true;
    return !!(this.control?.invalid && (this.control.touched || this.submitted));
  }

  get message(): string {
    return this.error || resolveFirstError(this.control, this.label || 'This field');
  }

  /**
   * Probe the composed validator with an empty value to see whether `required`
   * is among them. Wrapped, because a custom validator is free to reach for
   * control.parent and a missing badge must never take a screen down.
   */
  private get controlIsRequired(): boolean {
    const validator = this.control?.validator;
    if (!validator) return false;
    try {
      const result = validator({ value: null } as AbstractControl);
      return !!(result && result['required']);
    } catch {
      return false;
    }
  }
}
