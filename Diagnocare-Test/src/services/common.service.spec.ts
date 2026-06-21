import { TestBed }    from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { of }          from 'rxjs';

import { CommonService } from 'src/app/shared/common.service';
import { UserService }   from 'src/app/services/userServices/user.service';

function mockUserService() {
  return { checkUserName: jest.fn().mockReturnValue(of(true)) };
}

describe('CommonService', () => {
  let service: CommonService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CommonService,
        { provide: UserService, useValue: mockUserService() },
      ],
    });
    service = TestBed.inject(CommonService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── shouldLoadDistinctReferredBy ────────────────────────────────────────────

  describe('shouldLoadDistinctReferredBy()', () => {
    it('returns true for "Doctor"', () => {
      expect(service.shouldLoadDistinctReferredBy('Doctor')).toBe(true);
    });

    it('returns true for "Lab"', () => {
      expect(service.shouldLoadDistinctReferredBy('Lab')).toBe(true);
    });

    it('returns false for "Self"', () => {
      expect(service.shouldLoadDistinctReferredBy('Self')).toBe(false);
    });

    it('returns false for "Other"', () => {
      expect(service.shouldLoadDistinctReferredBy('Other')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(service.shouldLoadDistinctReferredBy('')).toBe(false);
    });
  });

  // ── filterStringOptions ─────────────────────────────────────────────────────

  describe('filterStringOptions()', () => {
    const options = ['Dr. Smith', 'Dr. Jones', 'Dr. Adams', 'City Lab'];

    it('returns all options when keyword is empty', () => {
      expect(service.filterStringOptions(options, '')).toEqual(options);
    });

    it('returns all options when keyword is null-ish empty', () => {
      expect(service.filterStringOptions(options, '')).toHaveLength(4);
    });

    it('filters case-insensitively', () => {
      expect(service.filterStringOptions(options, 'smith')).toEqual(['Dr. Smith']);
    });

    it('returns multiple matches', () => {
      expect(service.filterStringOptions(options, 'Dr.')).toEqual(['Dr. Smith', 'Dr. Jones', 'Dr. Adams']);
    });

    it('returns empty array when no match', () => {
      expect(service.filterStringOptions(options, 'XYZ')).toEqual([]);
    });

    it('does substring matching', () => {
      expect(service.filterStringOptions(options, 'Lab')).toEqual(['City Lab']);
    });
  });

  // ── getDefaultReferredByText ────────────────────────────────────────────────

  describe('getDefaultReferredByText()', () => {
    it('returns "Self" for Self type', () => {
      expect(service.getDefaultReferredByText('Self')).toBe('Self');
    });

    it('returns empty string for Other type', () => {
      expect(service.getDefaultReferredByText('Other')).toBe('');
    });

    it('returns empty string for Doctor type', () => {
      expect(service.getDefaultReferredByText('Doctor')).toBe('');
    });

    it('returns empty string for unknown type', () => {
      expect(service.getDefaultReferredByText('Unknown')).toBe('');
    });
  });

  // ── formatDateInputMask ─────────────────────────────────────────────────────

  describe('formatDateInputMask()', () => {
    it('formats 2 digits as DD', () => {
      const result = service.formatDateInputMask('15');
      expect(result.value).toBe('15');
    });

    it('formats 4 digits as DD/MM', () => {
      const result = service.formatDateInputMask('1501');
      expect(result.value).toBe('15/01');
    });

    it('formats 8 digits as DD/MM/YYYY', () => {
      const result = service.formatDateInputMask('15012000');
      expect(result.value).toBe('15/01/2000');
    });

    it('strips non-digit characters', () => {
      const result = service.formatDateInputMask('15-01/2000');
      expect(result.value).toBe('15/01/2000');
    });

    it('truncates to 8 digits', () => {
      const result = service.formatDateInputMask('150120001234');
      expect(result.value).toBe('15/01/2000');
    });

    it('returns empty string for empty input', () => {
      const result = service.formatDateInputMask('');
      expect(result.value).toBe('');
    });

    it('sets cursorPos to value length', () => {
      const result = service.formatDateInputMask('15012000');
      expect(result.cursorPos).toBe(result.value.length);
    });
  });

  // ── calculateAge ────────────────────────────────────────────────────────────

  describe('calculateAge()', () => {
    it('returns empty string for null/empty input', () => {
      expect(service.calculateAge('')).toBe('');
      expect(service.calculateAge(null as any)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(service.calculateAge('not-a-date')).toBe('');
    });

    it('returns age string in format "X Years"', () => {
      const thirtyYearsAgo = new Date();
      thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
      const iso = thirtyYearsAgo.toISOString().split('T')[0];
      const result = service.calculateAge(iso);
      expect(result).toContain('Years');
      expect(result).toContain('30');
    });

    it('handles DD/MM/YYYY format', () => {
      const result = service.calculateAge('01/01/1990');
      expect(result).toContain('Years');
    });
  });

  // ── calculateAgeRange ───────────────────────────────────────────────────────

  describe('calculateAgeRange()', () => {
    it('returns "Infant" for age < 1', () => {
      expect(service.calculateAgeRange(0)).toBe('Infant');
    });

    it('returns "Minor" for age 1–17', () => {
      expect(service.calculateAgeRange(1)).toBe('Minor');
      expect(service.calculateAgeRange(17)).toBe('Minor');
    });

    it('returns "Adult" for age 18–59', () => {
      expect(service.calculateAgeRange(18)).toBe('Adult');
      expect(service.calculateAgeRange(59)).toBe('Adult');
    });

    it('returns "Senior" for age 60+', () => {
      expect(service.calculateAgeRange(60)).toBe('Senior');
      expect(service.calculateAgeRange(90)).toBe('Senior');
    });
  });

  // ── setYearofDate ───────────────────────────────────────────────────────────

  describe('setYearofDate()', () => {
    it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
      expect(service.setYearofDate('15/01/2000')).toBe('2000-01-15');
    });

    it('pads single-digit day and month', () => {
      expect(service.setYearofDate('01/01/1990')).toBe('1990-01-01');
    });

    it('passes through ISO format unchanged', () => {
      expect(service.setYearofDate('2000-01-15')).toBe('2000-01-15');
    });

    it('returns falsy input as-is', () => {
      expect(service.setYearofDate('')).toBe('');
    });
  });

  // ── stringOnlyValidator ─────────────────────────────────────────────────────

  describe('stringOnlyValidator()', () => {
    const validate = (value: string) => {
      let service_: CommonService;
      TestBed.runInInjectionContext(() => {
        service_ = TestBed.inject(CommonService);
      });
      const validator = service.stringOnlyValidator();
      const control = new FormControl(value);
      return validator(control);
    };

    it('returns null for empty string (required handled separately)', () => {
      expect(validate('')).toBeNull();
    });

    it('returns null for letters-only string', () => {
      expect(validate('John')).toBeNull();
    });

    it('returns null for letters with spaces', () => {
      expect(validate('John Doe')).toBeNull();
    });

    it('returns error for string with numbers', () => {
      expect(validate('John123')).toEqual({ stringOnly: true });
    });

    it('returns error for string with special characters', () => {
      expect(validate('John@Doe')).toEqual({ stringOnly: true });
    });
  });

  // ── checkFutureDate ─────────────────────────────────────────────────────────

  describe('checkFutureDate()', () => {
    const validate = (value: string) => {
      const validator = service.checkFutureDate();
      const control = new FormControl(value);
      return validator(control);
    };

    it('returns null for empty string', () => {
      expect(validate('')).toBeNull();
    });

    it('returns null for today\'s date', () => {
      const today = new Date().toISOString().split('T')[0];
      expect(validate(today)).toBeNull();
    });

    it('returns null for a past date', () => {
      expect(validate('2000-01-01')).toBeNull();
    });

    it('returns error for a future date', () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      expect(validate(future.toISOString().split('T')[0])).toEqual({ noFutureDate: true });
    });
  });

  // ── getAccessToken ──────────────────────────────────────────────────────────

  describe('getAccessToken()', () => {
    it('returns empty string when no token in sessionStorage', () => {
      sessionStorage.removeItem('authToken');
      expect(service.getAccessToken()).toBe('');
    });

    it('returns the token stored in sessionStorage', () => {
      sessionStorage.setItem('authToken', 'test-token-123');
      expect(service.getAccessToken()).toBe('test-token-123');
      sessionStorage.removeItem('authToken');
    });
  });

  // ── checkInvalidControls ────────────────────────────────────────────────────

  describe('checkInvalidControls()', () => {
    it('returns empty array for a valid form', () => {
      const form = new FormGroup({ name: new FormControl('John', Validators.required) });
      expect(service.checkInvalidControls(form)).toEqual([]);
    });

    it('returns invalid control names', () => {
      const form = new FormGroup({
        name:  new FormControl('', Validators.required),
        email: new FormControl('not-an-email', Validators.email),
      });
      const invalid = service.checkInvalidControls(form);
      expect(invalid).toContain('name');
      expect(invalid).toContain('email');
    });

    it('returns only invalid controls (not valid ones)', () => {
      const form = new FormGroup({
        name:  new FormControl('John', Validators.required),
        email: new FormControl('', Validators.required),
      });
      const invalid = service.checkInvalidControls(form);
      expect(invalid).not.toContain('name');
      expect(invalid).toContain('email');
    });
  });
});
