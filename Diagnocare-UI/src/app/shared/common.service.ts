import { Injectable } from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { loginFormProperty } from '../constant/constants';
import { Observable, map } from 'rxjs';
import { InstitutionType } from '../constant/enums';
import { TokenService } from '../core/interceptors/token.service';
import { collectFormErrors, resolveFirstError } from './validators/validation-messages';

@Injectable({
  providedIn: 'root'
})
export class CommonService {

  constructor(private tokenService: TokenService) {}

isFormDisabled(arg0: FormGroup<any>) {
throw new Error('Method not implemented.');
}
  
  /** Returns true when a referred-by type requires loading distinct options from the backend.
   *  All InstitutionType values map to AddressManager, so always returns true for any valid type. */
  shouldLoadDistinctReferredBy(selectedType: string): boolean {
    return Object.keys(InstitutionType).includes(selectedType);
  }

  /** Case-insensitive prefix / substring filter on a string array. */
  filterStringOptions(options: string[], keyword: string): string[] {
    if (!keyword) return options;
    const lower = keyword.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(lower));
  }

  /** Returns the default text to pre-fill in the referred-by field for a given type. */
  getDefaultReferredByText(_selectedType: string): string {
    return '';
  }

  /**
   * Formats a raw character stream into a DD/MM/YYYY date mask.
   * Returns the masked value and the suggested cursor position.
   */
  formatDateInputMask(raw: string): { value: string; cursorPos: number } {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let value = '';
    if (digits.length > 0) value += digits.slice(0, 2);
    if (digits.length > 2) value += '/' + digits.slice(2, 4);
    if (digits.length > 4) value += '/' + digits.slice(4, 8);
    return { value, cursorPos: value.length };
  }

  /** Handles backspace on a DD/MM/YYYY masked date input. */
  handleDateBackspace(value: string, cursorPos: number): { newValue: string; newPos: number } {
    if (cursorPos === 0) return { newValue: value, newPos: 0 };
    let str = value.split('');
    let pos = cursorPos;
    // Skip over separator
    if (pos > 0 && str[pos - 1] === '/') { pos--; }
    str.splice(pos - 1, 1);
    const newValue = str.join('').replace(/\//g, '');
    // Re-apply mask
    const { value: masked } = this.formatDateInputMask(newValue);
    const newPos = Math.max(0, pos - 1);
    return { newValue: masked, newPos };
  }

  /** Calculates age string (e.g. "25 Years") from a DD/MM/YYYY or ISO date string. */
  calculateAge(dob: string): string {
    if (!dob) return '';
    let date: Date;
    if (dob.includes('/')) {
      const [day, month, year] = dob.split('/').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dob);
    }
    if (isNaN(date.getTime())) return '';
    const today = new Date();
    let years = today.getFullYear() - date.getFullYear();
    const m = today.getMonth() - date.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < date.getDate())) years--;
    return `${years} Years`;
  }

  /** Returns the age group label for a given age in years. */
  calculateAgeRange(ageYears: number): string {
    if (ageYears < 1)  return 'Infant';
    if (ageYears < 18) return 'Minor';
    if (ageYears < 60) return 'Adult';
    return 'Senior';
  }

  /**
   * Normalises a date entered as DD/MM/YYYY to YYYY-MM-DD (ISO).
   * Passes through any value already in acceptable format.
   */
  /** Formats any Date or parseable date string as DD-MM-YYYY. */
  formatDateDDMMYYYY(date: Date | string | null | undefined): string {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    const day   = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${day}-${month}-${d.getFullYear()}`;
  }

  setYearofDate(dob: string): string {
    if (!dob) return dob;
    if (dob.includes('/')) {
      const [day, month, year] = dob.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return dob;
  }

    checkInvalidControls(form: FormGroup) {
      const invalidControls: string[] = [];
      const controls = form.controls;

      for (const name in controls) {
        if (controls[name].invalid) {
          invalidControls.push(name);
        }
      }

      return invalidControls;
    }
 getAccessToken(): string {
    return this.tokenService.getToken() ?? '';
  }

  // ── Validators ────────────────────────────────────────────────────────────
  // Custom validators now live in ./validators/app-validators.ts (AppValidators).
  // Import and use them directly in forms, e.g.:
  //   name:   ['', [Validators.required, AppValidators.stringOnly()]],
  //   mobile: ['', [Validators.required, AppValidators.contactNumber()]],
  //   dob:    ['', [Validators.required, AppValidators.noFutureDate()]],

  // ── Centralised control-level helpers ─────────────────────────────────────

  /**
   * Returns a human-readable error message for a single reactive form control.
   *
   * @param control  The AbstractControl to inspect (may be null/undefined)
   * @param label    Display name of the field, e.g. 'Email Address'
   *
   * Used by FieldErrorComponent; can also be called directly in templates:
   *   {{ cs.getControlError(form.get('email'), 'Email') }}
   */
  getControlError(control: AbstractControl | null | undefined, label: string): string {
    // Delegates to the centralised message map (validators/validation-messages.ts).
    return resolveFirstError(control, label);
  }

  /**
   * Returns true when a control should display its error state.
   *
   * @param control    The AbstractControl to check
   * @param forceShow  Pass true after a submit attempt to force-reveal errors
   *                   on untouched controls (e.g. bound to a "submitted" flag)
   */
  isControlInvalid(control: AbstractControl | null | undefined, forceShow = false): boolean {
    if (!control) return false;
    // Reveal on blur/tab-out (touched) or submit (forceShow), not while typing (dirty).
    return !!(control.invalid && (control.touched || forceShow));
  }

  // ── Form-level helpers (existing) ──────────────────────────────────────────

    /** Labels an error message with the login-form display name where known. */
    private labelFor = (key: string): string =>
      (loginFormProperty as Record<string, string>)[key] ?? key;

    /** Touched/dirty error messages for a form. Delegates to the central map. */
    getFormValidationErrors(form: FormGroup): string[] {
      return collectFormErrors(form, this.labelFor);
    }

    /** All error messages for a form (ignores touched/dirty). */
    getNextButtonDisabledStatus(form: FormGroup): string[] {
      return collectFormErrors(form, this.labelFor, false);
    }
}
