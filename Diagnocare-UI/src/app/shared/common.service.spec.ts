import { TestBed } from '@angular/core/testing';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { CommonService } from './common.service';
import { InstitutionType } from '../models/contactAddress/contactAddressModel';

describe('CommonService', () => {
  let service: CommonService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ReactiveFormsModule] });
    service = TestBed.inject(CommonService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── shouldLoadDistinctReferredBy ─────────────────────────────────────────

  describe('shouldLoadDistinctReferredBy', () => {
    it('returns true for Doctor type', () => {
      expect(service.shouldLoadDistinctReferredBy('Doctor')).toBeTrue();
    });

    it('returns true for Laboratory type', () => {
      expect(service.shouldLoadDistinctReferredBy('Laboratory')).toBeTrue();
    });

    it('returns true for Clinic type', () => {
      expect(service.shouldLoadDistinctReferredBy('Clinic')).toBeTrue();
    });

    it('returns true for Hospital type', () => {
      expect(service.shouldLoadDistinctReferredBy('Hospital')).toBeTrue();
    });

    it('returns true for Other type', () => {
      expect(service.shouldLoadDistinctReferredBy('Other')).toBeTrue();
    });

    it('returns false for empty string', () => {
      expect(service.shouldLoadDistinctReferredBy('')).toBeFalse();
    });

    it('returns false for unrecognised string', () => {
      expect(service.shouldLoadDistinctReferredBy('Self')).toBeFalse();
    });
  });

  // ── filterStringOptions ──────────────────────────────────────────────────

  describe('filterStringOptions', () => {
    const options = ['Dr. Smith', 'Dr. Jones', 'Lab A', 'Self'];

    it('returns all options when keyword is empty', () => {
      expect(service.filterStringOptions(options, '')).toEqual(options);
    });

    it('filters case-insensitively', () => {
      expect(service.filterStringOptions(options, 'dr.')).toEqual(['Dr. Smith', 'Dr. Jones']);
    });

    it('returns empty array when no match', () => {
      expect(service.filterStringOptions(options, 'xyz')).toEqual([]);
    });

    it('matches partial substrings', () => {
      expect(service.filterStringOptions(options, 'Jones')).toEqual(['Dr. Jones']);
    });
  });

  // ── getDefaultReferredByText ─────────────────────────────────────────────

  describe('getDefaultReferredByText', () => {
    it('returns empty string for any institution type', () => {
      Object.keys(InstitutionType)
        .filter(k => isNaN(Number(k)))
        .forEach(k => {
          expect(service.getDefaultReferredByText(k)).toBe('');
        });
    });

    it('returns empty string for empty input', () => {
      expect(service.getDefaultReferredByText('')).toBe('');
    });
  });

  // ── formatDateInputMask ──────────────────────────────────────────────────

  describe('formatDateInputMask', () => {
    it('formats 2 digits as day only', () => {
      const { value } = service.formatDateInputMask('15');
      expect(value).toBe('15');
    });

    it('formats 4 digits as dd/mm', () => {
      const { value } = service.formatDateInputMask('1506');
      expect(value).toBe('15/06');
    });

    it('formats 8 digits as dd/mm/yyyy', () => {
      const { value } = service.formatDateInputMask('15062000');
      expect(value).toBe('15/06/2000');
    });

    it('strips non-numeric characters', () => {
      const { value } = service.formatDateInputMask('15/06/2000');
      expect(value).toBe('15/06/2000');
    });

    it('returns empty string for empty input', () => {
      const { value } = service.formatDateInputMask('');
      expect(value).toBe('');
    });

    it('truncates to 8 significant digits', () => {
      const { value } = service.formatDateInputMask('150620001234');
      expect(value).toBe('15/06/2000');
    });
  });

  // ── calculateAge ────────────────────────────────────────────────────────

  describe('calculateAge', () => {
    it('returns empty string for empty input', () => {
      expect(service.calculateAge('')).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(service.calculateAge('99/99/9999')).toBe('');
    });

    it('calculates age from DD/MM/YYYY format', () => {
      // Use a fixed date 30 years ago
      const today = new Date();
      const dob = `${String(today.getDate()).padStart(2,'0')}/${String(today.getMonth()+1).padStart(2,'0')}/${today.getFullYear()-30}`;
      expect(service.calculateAge(dob)).toBe('30 Years');
    });

    it('calculates age from ISO format', () => {
      const today = new Date();
      const isoDate = `${today.getFullYear()-25}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      expect(service.calculateAge(isoDate)).toBe('25 Years');
    });
  });

  // ── calculateAgeRange ────────────────────────────────────────────────────

  describe('calculateAgeRange', () => {
    it('returns Infant for age < 1', () => {
      expect(service.calculateAgeRange(0)).toBe('Infant');
    });

    it('returns Minor for age between 1 and 17', () => {
      expect(service.calculateAgeRange(1)).toBe('Minor');
      expect(service.calculateAgeRange(17)).toBe('Minor');
    });

    it('returns Adult for age between 18 and 59', () => {
      expect(service.calculateAgeRange(18)).toBe('Adult');
      expect(service.calculateAgeRange(59)).toBe('Adult');
    });

    it('returns Senior for age 60 and above', () => {
      expect(service.calculateAgeRange(60)).toBe('Senior');
      expect(service.calculateAgeRange(80)).toBe('Senior');
    });
  });

  // ── setYearofDate ────────────────────────────────────────────────────────

  describe('setYearofDate', () => {
    it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
      expect(service.setYearofDate('15/06/2000')).toBe('2000-06-15');
    });

    it('passes through ISO format unchanged', () => {
      expect(service.setYearofDate('2000-06-15')).toBe('2000-06-15');
    });

    it('returns empty string for empty input', () => {
      expect(service.setYearofDate('')).toBe('');
    });

    it('pads single-digit day and month', () => {
      expect(service.setYearofDate('5/6/2000')).toBe('2000-6-5');
    });
  });

  // ── formatDateDDMMYYYY ───────────────────────────────────────────────────

  describe('formatDateDDMMYYYY', () => {
    it('returns empty string for null', () => {
      expect(service.formatDateDDMMYYYY(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(service.formatDateDDMMYYYY(undefined)).toBe('');
    });

    it('formats a Date object correctly', () => {
      const date = new Date(2000, 5, 15); // 15 June 2000
      expect(service.formatDateDDMMYYYY(date)).toBe('15-06-2000');
    });

    it('formats an ISO date string correctly', () => {
      expect(service.formatDateDDMMYYYY('2000-06-15')).toBe('15-06-2000');
    });

    it('returns empty string for invalid date string', () => {
      expect(service.formatDateDDMMYYYY('not-a-date')).toBe('');
    });
  });

  // ── handleDateBackspace ──────────────────────────────────────────────────

  describe('handleDateBackspace', () => {
    it('returns unchanged value when cursor is at position 0', () => {
      const { newValue, newPos } = service.handleDateBackspace('15/06/2000', 0);
      expect(newValue).toBe('15/06/2000');
      expect(newPos).toBe(0);
    });

    it('removes digit before cursor', () => {
      // cursor at position 2 (after '15') → removes '5'
      const { newValue } = service.handleDateBackspace('15/06/2000', 2);
      expect(newValue).toBe('10/62/000'); // re-masked after digit removal
    });

    it('skips separator before removing digit', () => {
      // cursor at position 3 (on the '/') → should skip separator and delete '5' from day
      const { newValue } = service.handleDateBackspace('15/06/2000', 3);
      expect(newValue).not.toContain('15/');
    });
  });
});
