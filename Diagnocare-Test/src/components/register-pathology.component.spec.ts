import { TestBed }                    from '@angular/core/testing';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { of, throwError }            from 'rxjs';

import { RegisterPathologyComponent } from 'src/app/component/pathology/register-pathology/register-pathology.component';
import { PathologyService }            from 'src/app/services/pathologyServices/pathology.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockPathologyService(overrides: Partial<{
  registerPathology: jest.Mock;
}> = {}) {
  return {
    registerPathology: overrides.registerPathology
      ?? jest.fn().mockReturnValue(of({ success: true, licenseKey: 'LIC-ABCD-1234' })),
  };
}

function createComponent(pathSvc: ReturnType<typeof mockPathologyService>) {
  TestBed.configureTestingModule({
    imports:   [ReactiveFormsModule],
    providers: [
      RegisterPathologyComponent,
      FormBuilder,
      { provide: PathologyService, useValue: pathSvc },
    ],
  });
  const component = TestBed.inject(RegisterPathologyComponent);
  component.ngOnInit(); // Build the form
  return component;
}

function fillValidForm(component: RegisterPathologyComponent): void {
  component.form.patchValue({
    path_Name:      'Test Lab',
    path_Address1:  '123 Test Street',
    path_City:      'Mumbai',
    path_State:     'Maharashtra',
    path_Country:   'India',
    path_ContactNo: '9876543210',
    path_Email:     'lab@test.com',
    license_Type:   'Trial',
  });
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('RegisterPathologyComponent', () => {

  afterEach(() => TestBed.resetTestingModule());

  it('should be created', () => {
    const pathSvc   = mockPathologyService();
    const component = createComponent(pathSvc);
    expect(component).toBeTruthy();
  });

  // ── Form initialization ────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('initializes form with "Trial" as default license type', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      expect(component.form.get('license_Type')!.value).toBe('Trial');
    });

    it('initializes form with "India" as default country', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      expect(component.form.get('path_Country')!.value).toBe('India');
    });

    it('form is invalid when empty', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      expect(component.form.invalid).toBe(true);
    });
  });

  // ── licenseType getter ─────────────────────────────────────────────────────

  describe('licenseType getter', () => {
    it('returns "Trial" by default', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      expect(component.licenseType).toBe('Trial');
    });

    it('returns "License" when updated', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectLicenseType('License');
      expect(component.licenseType).toBe('License');
    });
  });

  // ── expiryDate getter ──────────────────────────────────────────────────────

  describe('expiryDate getter', () => {
    it('returns a date 15 days from now for Trial', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectLicenseType('Trial');

      const expected = new Date();
      expected.setDate(expected.getDate() + 15);
      const expectedIso = expected.toISOString().split('T')[0];

      expect(component.expiryDate).toBe(expectedIso);
    });

    it('returns a date 365 days from now for License', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectLicenseType('License');

      const expected = new Date();
      expected.setDate(expected.getDate() + 365);
      const expectedIso = expected.toISOString().split('T')[0];

      expect(component.expiryDate).toBe(expectedIso);
    });
  });

  // ── expiryDisplay getter ───────────────────────────────────────────────────

  describe('expiryDisplay getter', () => {
    it('returns a formatted non-empty string', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      expect(component.expiryDisplay).toBeTruthy();
      expect(component.expiryDisplay.length).toBeGreaterThan(4);
    });
  });

  // ── selectLicenseType ──────────────────────────────────────────────────────

  describe('selectLicenseType()', () => {
    it('updates the form control value', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.selectLicenseType('License');
      expect(component.form.get('license_Type')!.value).toBe('License');
    });
  });

  // ── hasError ───────────────────────────────────────────────────────────────

  describe('hasError()', () => {
    it('returns false when field is untouched', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      expect(component.hasError('path_Name')).toBe(false);
    });

    it('returns true when required field is touched and empty', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.form.get('path_Name')!.markAsTouched();
      expect(component.hasError('path_Name')).toBe(true);
    });

    it('returns false when field is valid', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.form.get('path_Name')!.setValue('City Lab');
      component.form.get('path_Name')!.markAsTouched();
      expect(component.hasError('path_Name')).toBe(false);
    });
  });

  // ── submit ─────────────────────────────────────────────────────────────────

  describe('submit()', () => {
    it('does not call service when form is invalid', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      // Form is empty → invalid

      component.submit();

      expect(pathSvc.registerPathology).not.toHaveBeenCalled();
    });

    it('marks all fields as touched when submitted invalid', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);

      component.submit();

      expect(component.form.get('path_Name')!.touched).toBe(true);
    });

    it('calls registerPathology with correct dto on valid form', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      fillValidForm(component);

      component.submit();

      expect(pathSvc.registerPathology).toHaveBeenCalledWith(
        expect.objectContaining({
          path_Name:      'Test Lab',
          path_Email:     'lab@test.com',
          license_Type:   'Trial',
          date_of_Expiry: component.expiryDate,
        })
      );
    });

    it('sets registrationResult on successful response', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      fillValidForm(component);

      component.submit();

      expect(component.registrationResult?.licenseKey).toBe('LIC-ABCD-1234');
    });

    it('clears isSubmitting after success', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      fillValidForm(component);

      component.submit();

      expect(component.isSubmitting).toBe(false);
    });

    it('sets serverError when response has success: false', () => {
      const pathSvc = mockPathologyService({
        registerPathology: jest.fn().mockReturnValue(
          of({ success: false, message: 'Pathology already exists' })
        ),
      });
      const component = createComponent(pathSvc);
      fillValidForm(component);

      component.submit();

      expect(component.serverError).toBe('Pathology already exists');
      expect(component.registrationResult).toBeNull();
    });

    it('sets a default serverError message when success: false with no message', () => {
      const pathSvc = mockPathologyService({
        registerPathology: jest.fn().mockReturnValue(of({ success: false })),
      });
      const component = createComponent(pathSvc);
      fillValidForm(component);

      component.submit();

      expect(component.serverError).toBeTruthy();
    });

    it('sets serverError on HTTP error', () => {
      const pathSvc = mockPathologyService({
        registerPathology: jest.fn().mockReturnValue(throwError(() => new Error('500'))),
      });
      const component = createComponent(pathSvc);
      fillValidForm(component);

      component.submit();

      expect(component.serverError).toBeTruthy();
      expect(component.isSubmitting).toBe(false);
    });

    it('clears serverError at the start of each submission', () => {
      const pathSvc   = mockPathologyService();
      const component = createComponent(pathSvc);
      component.serverError = 'Old error';
      fillValidForm(component);

      component.submit();

      // After successful call, serverError is cleared (it was reset to '' before call)
      expect(component.serverError).toBe('');
    });
  });
});
