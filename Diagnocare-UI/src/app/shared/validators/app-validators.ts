/**
 * app-validators.ts
 * ------------------------------------------------------------------
 * Centralized custom form validators for the whole application.
 *
 * These are plain static functions (no dependency injection needed),
 * so any component can use them directly:
 *
 *   this.fb.group({
 *     name:    ['', [Validators.required, AppValidators.stringOnly()]],
 *     mobile:  ['', [Validators.required, AppValidators.contactNumber()]],
 *     dob:     ['', [Validators.required, AppValidators.noFutureDate()]],
 *   });
 *
 * Built-in rules (required, email, minLength, maxLength, pattern) should
 * still use Angular's own `Validators`. This class only holds the custom
 * rules and any app-specific patterns. Error messages for every key
 * produced here live in validation-messages.ts.
 */
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { VALIDATION_PATTERNS } from './validation-patterns';

/** True when a control value should be treated as "empty" (skip optional checks). */
function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

export class AppValidators {
  /** Letters and spaces only. Empty is allowed (pair with Validators.required). */
  static stringOnly(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmpty(control.value)) return null;
      return VALIDATION_PATTERNS.lettersOnly.test(String(control.value))
        ? null
        : { stringOnly: true };
    };
  }

  /** 10-digit contact number that must not start with 0. Empty is allowed. */
  static contactNumber(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmpty(control.value)) return null;
      return VALIDATION_PATTERNS.contactNumber.test(String(control.value))
        ? null
        : { contactNumber: true };
    };
  }

  /** Rejects dates later than today. Empty is allowed. */
  static noFutureDate(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmpty(control.value)) return null;
      const input = new Date(control.value);
      if (isNaN(input.getTime())) return null; // let pattern/other rules handle bad dates
      const today = new Date();
      input.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      return input > today ? { noFutureDate: true } : null;
    };
  }

  /** Exactly 6-digit pincode. Empty is allowed. */
  static pincode(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmpty(control.value)) return null;
      return VALIDATION_PATTERNS.pincode.test(String(control.value))
        ? null
        : { pincode: true };
    };
  }

  /** 24-hour HH:MM time. Empty is allowed. */
  static time24h(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmpty(control.value)) return null;
      return VALIDATION_PATTERNS.time24h.test(String(control.value))
        ? null
        : { time24h: true };
    };
  }

  /** A single digit 0-9 (OTP boxes). Empty is allowed. */
  static singleDigit(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (isEmpty(control.value)) return null;
      return VALIDATION_PATTERNS.singleDigit.test(String(control.value))
        ? null
        : { singleDigit: true };
    };
  }

  /**
   * Cross-field: confirms two controls match (e.g. password / confirm password).
   * Attach to the FormGroup, not a single control:
   *   this.fb.group({...}, { validators: AppValidators.match('password', 'confirm') });
   */
  static match(controlName: string, matchingControlName: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const a = group.get(controlName)?.value;
      const b = group.get(matchingControlName)?.value;
      if (isEmpty(a) || isEmpty(b)) return null;
      return a === b ? null : { passwordMismatch: true };
    };
  }
}
