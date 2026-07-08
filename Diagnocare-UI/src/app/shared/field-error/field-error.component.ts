import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl } from '@angular/forms';
import { resolveFirstError } from '../validators/validation-messages';

/**
 * FieldErrorComponent — centralised inline validation message.
 *
 * Usage:
 *   <app-field-error [control]="form.get('email')" label="Email"></app-field-error>
 *
 * With forced display (e.g. after a submit attempt):
 *   <app-field-error [control]="form.get('name')" label="Name" [forceShow]="submitted"></app-field-error>
 *
 * The component shows nothing when there is no error or the control hasn't
 * been touched/dirtied (unless forceShow is true).
 */
@Component({
  selector: 'app-field-error',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="field-error" *ngIf="shouldShow">{{ message }}</span>`,
  styles: [`
    :host { display: contents; }
    .field-error {
      display: block;
      /* Span the full width of a grid-based field so the message shows as a
         single line under the whole row, instead of being squeezed into a
         narrow label column and wrapping onto several lines. Ignored in
         flex/block layouts, so non-grid forms are unaffected. */
      grid-column: 1 / -1;
      color: var(--error-color, #dc3545);
      font-size: 0.78rem;
      margin-top: 0.2rem;
      line-height: 1.3;
    }
  `]
})
export class FieldErrorComponent {
  /** The reactive form control to inspect. */
  @Input() control: AbstractControl | null = null;

  /** Human-readable field label shown in error messages, e.g. "Email Address". */
  @Input() label = 'This field';

  /**
   * When true, shows the error even if the control hasn't been touched.
   * Typically bound to a component-level "submitted" or "stepTouched" flag.
   */
  @Input() forceShow = false;

  get shouldShow(): boolean {
    // Show errors on blur/tab-out (touched) or after a submit attempt (forceShow),
    // NOT while the user is still typing (dirty).
    return !!(
      this.control?.invalid &&
      (this.control.touched || this.forceShow)
    );
  }

  get message(): string {
    return resolveFirstError(this.control, this.label);
  }
}
