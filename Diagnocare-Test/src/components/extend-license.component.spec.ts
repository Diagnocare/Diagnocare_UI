import { TestBed }           from '@angular/core/testing';
import { of, throwError }    from 'rxjs';

import { ExtendLicenseComponent } from 'src/app/component/extend-license/extend-license.component';
import { PathologyService }        from 'src/app/services/pathologyServices/pathology.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoDateOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const REGISTERED_INFO = {
  isRegistered:    true,
  path_Name:       'City Lab',
  path_Address1:   '123 Lab Street',
  path_City:       'Mumbai',
  path_State:      'Maharashtra',
  path_Country:    'India',
  path_ContactNo:  '9876543210',
  path_Email:      'lab@citylab.com',
  license_Type:    'License',
  date_of_Expiry:  isoDateOffsetDays(10),
};

function mockPathologyService(overrides: Partial<{
  getPublicInfo: jest.Mock;
  extendLicense: jest.Mock;
}> = {}) {
  return {
    getPublicInfo:  overrides.getPublicInfo  ?? jest.fn().mockReturnValue(of(REGISTERED_INFO)),
    extendLicense:  overrides.extendLicense  ?? jest.fn().mockReturnValue(of({ success: true, licenseKey: 'LIC-XYZ-123' })),
  };
}

function createComponent(pathSvc: ReturnType<typeof mockPathologyService>) {
  TestBed.configureTestingModule({
    providers: [
      ExtendLicenseComponent,
      { provide: PathologyService, useValue: pathSvc },
    ],
  });
  return TestBed.inject(ExtendLicenseComponent);
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('ExtendLicenseComponent', () => {

  afterEach(() => TestBed.resetTestingModule());

  it('starts in "loading" state', () => {
    const pathSvc   = mockPathologyService();
    const component = createComponent(pathSvc);
    expect(component.loadState).toBe('loading');
  });

  // ── ngOnInit ───────────────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('sets loadState to "loaded" when pathology is registered', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.loadState).toBe('loaded');
    });

    it('stores pathologyInfo when registered', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.pathologyInfo?.path_Name).toBe('City Lab');
    });

    it('sets loadState to "not-registered" when isRegistered is false', () => {
      const pathSvc = mockPathologyService({
        getPublicInfo: jest.fn().mockReturnValue(of({ isRegistered: false })),
      });
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.loadState).toBe('not-registered');
    });

    it('sets loadState to "error" on API failure', () => {
      const pathSvc = mockPathologyService({
        getPublicInfo: jest.fn().mockReturnValue(throwError(() => new Error('API error'))),
      });
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.loadState).toBe('error');
      expect(component.loadError).toBeTruthy();
    });
  });

  // ── Computed getters ───────────────────────────────────────────────────────

  describe('newExpiryDate getter', () => {
    it('returns a date 365 days from now for "License"', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectedType = 'License';

      const expected = isoDateOffsetDays(365);
      expect(component.newExpiryDate).toBe(expected);
    });

    it('returns a date 15 days from now for "Trial"', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectedType = 'Trial';

      const expected = isoDateOffsetDays(15);
      expect(component.newExpiryDate).toBe(expected);
    });
  });

  describe('newExpiryDisplay getter', () => {
    it('returns a non-empty formatted date string', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);

      expect(component.newExpiryDisplay).toBeTruthy();
      expect(component.newExpiryDisplay.length).toBeGreaterThan(4);
    });
  });

  describe('currentExpiryDisplay getter', () => {
    it('returns "—" when pathologyInfo has no expiry date', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.pathologyInfo = null;

      expect(component.currentExpiryDisplay).toBe('—');
    });

    it('returns a formatted date when expiry is set', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.pathologyInfo = { ...REGISTERED_INFO, date_of_Expiry: '2026-01-15' };

      const display = component.currentExpiryDisplay;
      expect(display).toBeTruthy();
      expect(display).not.toBe('—');
    });
  });

  describe('daysLeft getter', () => {
    it('returns 0 when pathologyInfo is null', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.pathologyInfo = null;

      expect(component.daysLeft).toBe(0);
    });

    it('returns approximately 10 when expiry is 10 days away', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.pathologyInfo = { ...REGISTERED_INFO, date_of_Expiry: isoDateOffsetDays(10) };

      expect(component.daysLeft).toBeGreaterThanOrEqual(9);
      expect(component.daysLeft).toBeLessThanOrEqual(11);
    });
  });

  // ── selectType ─────────────────────────────────────────────────────────────

  describe('selectType()', () => {
    it('defaults to "License"', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      expect(component.selectedType).toBe('License');
    });

    it('changes selectedType to Trial', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectType('Trial');
      expect(component.selectedType).toBe('Trial');
    });

    it('changes selectedType back to License', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectType('Trial');
      component.selectType('License');
      expect(component.selectedType).toBe('License');
    });
  });

  // ── submit ─────────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('sets isSubmitting to true while in flight', () => {
      const subject = new (require('rxjs').Subject)();
      const pathSvc = mockPathologyService({
        extendLicense: jest.fn().mockReturnValue(subject.asObservable()),
      });
      const component = createComponent(pathSvc);

      component.submit();

      expect(component.isSubmitting).toBe(true);
    });

    it('stores result and clears isSubmitting on success', () => {
      const pathSvc = mockPathologyService({
        extendLicense: jest.fn().mockReturnValue(
          of({ success: true, licenseKey: 'NEW-KEY-123', date_of_Expiry: isoDateOffsetDays(365) })
        ),
      });
      const component = createComponent(pathSvc);

      component.submit();

      expect(component.isSubmitting).toBe(false);
      expect(component.result?.licenseKey).toBe('NEW-KEY-123');
    });

    it('sets submitError when API returns success: false', () => {
      const pathSvc = mockPathologyService({
        extendLicense: jest.fn().mockReturnValue(
          of({ success: false, message: 'Licence not found' })
        ),
      });
      const component = createComponent(pathSvc);

      component.submit();

      expect(component.submitError).toBe('Licence not found');
      expect(component.result).toBeNull();
    });

    it('sets a generic submitError on HTTP error', () => {
      const pathSvc = mockPathologyService({
        extendLicense: jest.fn().mockReturnValue(throwError(() => new Error('500'))),
      });
      const component = createComponent(pathSvc);

      component.submit();

      expect(component.submitError).toBeTruthy();
      expect(component.isSubmitting).toBe(false);
    });

    it('calls extendLicense with correct dto', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectedType = 'License';

      component.submit();

      expect(pathSvc.extendLicense).toHaveBeenCalledWith({
        license_Type:   'License',
        date_of_Expiry: component.newExpiryDate,
      });
    });

    it('clears submitError before each submission', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.submitError = 'Old error';

      component.submit();

      expect(component.submitError).toBe('');
    });
  });
});
