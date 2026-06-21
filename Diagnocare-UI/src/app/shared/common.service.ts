import { Injectable } from '@angular/core';
import { ValidatorFn, AbstractControl, ValidationErrors, FormGroup, AsyncValidatorFn } from '@angular/forms';
import { PathologyFormKeys, validationMessages } from '../constant/constants';
import { Observable, map } from 'rxjs';
import { InstitutionType } from '../constant/enums';

@Injectable({
  providedIn: 'root'
})
export class CommonService {
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
 getAccessToken() {
    const token = sessionStorage.getItem('authToken');
    return token ?? '';
  }

  stringOnlyValidator(): ValidatorFn {
      return (control: AbstractControl): ValidationErrors | null => {
        const value = control.value;

        if (value === null || value === '') {
          return null; // allow empty, use Validators.required separately if needed
        }
        
        const regex = /^[A-Za-z\s]+$/; // allows letters and spaces only
        return regex.test(value) ? null : { stringOnly: true };
      };
    }

    checkFutureDate(): ValidatorFn {
      return (control: AbstractControl): ValidationErrors | null => {
        const value = control.value;

        if (value === null || value === '') {
          return null; // allow empty, use Validators.required separately if needed
        }
        
        const inputDate = new Date(control.value);
        const today = new Date();

        // Normalize both to midnight to avoid time-of-day issues
        inputDate.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);

        // ❌ If input date is greater than today → invalid
        return inputDate > today ? { noFutureDate: true } : null;

      };
    }

    getFormValidationErrors(form: FormGroup): string[] {
      const messages: string[] = [];
      
      Object.keys(form.controls).forEach(key => {
        const control = form.get(key);
        const controlErrors = (control?.touched || control?.dirty) ? control?.errors : null;
        
        if (controlErrors) {
          Object.keys(controlErrors).forEach(errorKey => {
            switch (errorKey) {
              case 'required':
                messages.push(validationMessages.required(key as  PathologyFormKeys));
                break;
              case 'minlength':
                messages.push(validationMessages.minLength(key as PathologyFormKeys,controlErrors[errorKey].requiredLength));
                break;
              case 'pattern':
                messages.push(validationMessages.pattern(key as PathologyFormKeys,'10 digits'));
                break;
              case 'email':
                messages.push(validationMessages.email(key as PathologyFormKeys));
                break;
              case 'stringOnly':
                messages.push(validationMessages.stringOnly(key as PathologyFormKeys));
                break;
              case 'noFutureDate':
                messages.push(validationMessages.noFutureDate(key as PathologyFormKeys));
                break;
            }
          });
        }
      });
      return messages;
    }

    

    getNextButtonDisabledStatus(form:FormGroup):string[]{
      const messages: string[] = [];
      Object.keys(form.controls).forEach(key => {
        const control = form.get(key);
        const controlErrors = control?.errors;
        
        if (controlErrors) {
          Object.keys(controlErrors).forEach(errorKey => {
            switch (errorKey) {
              case 'required':
                messages.push(`${key} is required`);
                break;
              case 'minlength':
                messages.push(`${key} must be at least ${controlErrors[errorKey].requiredLength} characters`);
                break;
              case 'pattern':
                messages.push(`${key} must be 6 or 10 digits`);
                break;
              case 'email':
                messages.push(`${key} must be a valid email`);
                break;
              case 'stringOnly':
                messages.push(`${key} must have only character, number not allowed`);
                break;
              case 'noFutureDate':
                messages.push(`${key} cannot have future date`);
                break;
            }
          });
        }
      });
      return messages;
    }
}
