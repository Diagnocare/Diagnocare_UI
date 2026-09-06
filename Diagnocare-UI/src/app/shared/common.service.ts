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

  // ── Age in years / months / days ────────────────────────────────────────────
  // A single "41 Years" string cannot describe an infant, and a paediatric
  // sample is reported against age in months or days. These four helpers are the
  // whole conversion: DOB → parts, parts → DOB, parts → stored string, and back.

  /** Splits the gap between a date of birth and today into whole Y / M / D. */
  calculateAgeParts(dob: string): { years: number; months: number; days: number } {
    const empty = { years: 0, months: 0, days: 0 };
    if (!dob) return empty;

    let date: Date;
    if (dob.includes('/')) {
      const [day, month, year] = dob.split('/').map(Number);
      date = new Date(year, month - 1, day);
    } else {
      date = new Date(dob);
    }
    if (isNaN(date.getTime())) return empty;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    if (date > today) return empty;

    let years  = today.getFullYear() - date.getFullYear();
    let months = today.getMonth()    - date.getMonth();
    let days   = today.getDate()     - date.getDate();

    // Borrow days from the month that actually precedes today, not a nominal 30,
    // so "born on the 31st" does not read a day out in a short month.
    if (days < 0) {
      months--;
      days += new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    return { years, months, days };
  }

  /**
   * The stored form: "41Y 3M 12D". Zero parts are dropped, so a plain adult is
   * "41Y" — shorter to read and well inside the API's field length. A patient
   * born today is "0D" rather than an empty string, which would look like a
   * missing value.
   */
  formatAgeParts(years: number, months: number, days: number): string {
    const parts: string[] = [];
    if (years)  parts.push(`${years}Y`);
    if (months) parts.push(`${months}M`);
    if (days)   parts.push(`${days}D`);
    return parts.length ? parts.join(' ') : '0D';
  }

  /**
   * Reads an age back into parts. Accepts the new "41Y 3M 12D" form, the legacy
   * "41 Years" written by earlier builds, and a bare number — so existing
   * patients open in the edit form with their age intact.
   */
  parseAgeParts(stored: string | null | undefined): { years: number; months: number; days: number } {
    const text = (stored ?? '').trim();
    if (!text) return { years: 0, months: 0, days: 0 };

    const compact = /(\d+)\s*Y|(\d+)\s*M|(\d+)\s*D/gi;
    if (compact.test(text)) {
      const grab = (unit: string) => {
        const m = text.match(new RegExp(`(\\d+)\\s*${unit}`, 'i'));
        return m ? Number(m[1]) : 0;
      };
      return { years: grab('Y'), months: grab('M'), days: grab('D') };
    }

    // Legacy "41 Years" / "41"
    const legacy = text.match(/^(\d+)/);
    return { years: legacy ? Number(legacy[1]) : 0, months: 0, days: 0 };
  }

  /**
   * Today minus the given age, as dd/mm/yyyy for the DOB text field.
   *
   * This is what lets an operator record a patient who does not know their date
   * of birth — extremely common — by typing the age they do know. The result is
   * an approximation by construction, which is exactly what an age-only record
   * is anyway.
   */
  dobFromAgeParts(years: number, months: number, days: number): string {
    if (!years && !months && !days) return '';
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setFullYear(d.getFullYear() - (years || 0));
    d.setMonth(d.getMonth() - (months || 0));
    d.setDate(d.getDate() - (days || 0));

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
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
