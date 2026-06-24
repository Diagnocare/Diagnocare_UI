import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl } from '@angular/forms';
import { CommonService } from '../common.service';

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

  constructor(private cs: CommonService) {}

  get shouldShow(): boolean {
    return !!(
      this.control?.invalid &&
      (this.control.touched || this.control.dirty || this.forceShow)
    );
  }

  get message(): string {
    return this.cs.getControlError(this.control, this.label);
  }
}
