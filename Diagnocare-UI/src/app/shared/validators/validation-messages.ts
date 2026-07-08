/**
 * validation-messages.ts
 * ------------------------------------------------------------------
 * Single source of truth for user-facing validation error messages.
 *
 * Every validator error key (Angular built-ins + AppValidators customs)
 * maps to a message factory here. UI helpers resolve messages through
 * this map so wording is consistent and adding a new validator means
 * adding exactly one entry.
 */
import { AbstractControl, FormGroup, ValidationErrors } from '@angular/forms';

/** (label, errorValue) => message. errorValue is the payload Angular stores per key. */
export type ErrorMessageFactory = (label: string, error?: any) => string;

export const VALIDATION_MESSAGES: Record<string, ErrorMessageFactory> = {
  required:      (l) => `${l} is required.`,
  email:         () => 'Please enter a valid email address.',
  minlength:     (l, e) => `${l} must be at least ${e?.requiredLength} characters.`,
  maxlength:     (l, e) => `${l} must not exceed ${e?.requiredLength} characters.`,
  pattern:       (l) => `${l} format is invalid.`,
  min:           (l, e) => `${l} must be at least ${e?.min}.`,
  max:           (l, e) => `${l} must not exceed ${e?.max}.`,

  // AppValidators custom keys
  stringOnly:    (l) => `${l} must contain letters only.`,
  contactNumber: (l) => `${l} must be a 10-digit number and cannot start with 0.`,
  noFutureDate:  (l) => `${l} cannot be a future date.`,
  pincode:       (l) => `${l} must be a valid 6-digit pincode.`,
  time24h:       (l) => `${l} must be a valid time in HH:MM format.`,
  singleDigit:   (l) => `${l} must be a single digit.`,
  passwordMismatch: () => 'Passwords do not match.',
};

/**
 * Returns the message for the first error on a control, or '' when clean.
 * @param control The control to inspect.
 * @param label   Human-readable field label, e.g. 'Primary Contact'.
 */
export function resolveFirstError(
  control: AbstractControl | null | undefined,
  label: string,
): string {
  const errors = control?.errors;
  if (!errors) return '';
  for (const key of Object.keys(errors)) {
    const factory = VALIDATION_MESSAGES[key];
    if (factory) return factory(label, errors[key]);
  }
  return `${label} is invalid.`;
}

/** Message for a specific error key (used by form-level collectors). */
export function messageForError(
  errorKey: string,
  label: string,
  errorValue?: any,
): string {
  const factory = VALIDATION_MESSAGES[errorKey];
  return factory ? factory(label, errorValue) : `${label} is invalid.`;
}

/**
 * Collects one message per erroring control across a form.
 * By default only reports touched/dirty controls (matches previous behaviour).
 *
 * @param form        The FormGroup to scan.
 * @param labelFor    Maps a control name to its display label.
 * @param onlyTouched When true (default) skip pristine, untouched controls.
 */
export function collectFormErrors(
  form: FormGroup,
  labelFor: (controlName: string) => string,
  onlyTouched = true,
): string[] {
  const messages: string[] = [];
  Object.keys(form.controls).forEach((name) => {
    const control = form.get(name);
    if (!control) return;
    if (onlyTouched && !(control.touched || control.dirty)) return;
    const errors: ValidationErrors | null = control.errors;
    if (!errors) return;
    Object.keys(errors).forEach((key) => {
      messages.push(messageForError(key, labelFor(name), errors[key]));
    });
  });
  return messages;
}
