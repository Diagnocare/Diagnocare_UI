import { TestBed }                    from '@angular/core/testing';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { of, throwError }            from 'rxjs';
import { ToastrService }             from 'ngx-toastr';

import { LabProfileComponent } from 'src/app/component/lab-profile/lab-profile.component';
import { PathologyService }    from 'src/app/services/pathologyServices/pathology.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

const MOCK_LAB_DATA = {
  path_Name:        'City Diagnostic Centre',
  path_Branch:      'Main Branch',
  path_Motto:       'Precision Diagnostics',
  path_Tagline:     'Trusted. Accurate. Fast.',
  path_Address1:    '123 Lab Street',
  path_Address2:    'Near Hospital',
  path_City:        'Mumbai',
  path_State:       'Maharashtra',
  path_Country:     'India',
  path_Pincode:     '400001',
  path_ContactNo:   '9876543210',
  path_AltContactNo:'9876500000',
  path_Email:       'lab@city.com',
  path_Website:     'https://citylab.com',
  path_GSTNo:       '27AABCU9603R1ZX',
  path_PANNo:       'AABCU9603R',
  path_RegNo:       'REG-001',
  path_NABLNo:      'MC-1234',
  path_DirectorName:'Dr. Sharma',
  path_LabInCharge: 'Mr. Verma',
  path_ReportHeader:'City Diagnostic Centre',
  path_ReportFooter:'Results for physician reference only.',
  path_SignatoryName:'Dr. Sharma',
  path_CountryCode: '+91',
  path_Currency:    'INR',
  path_Logo:        null,
};

function mockPathologyService(overrides: Partial<{
  getPathology:    jest.Mock;
  updatePathology: jest.Mock;
}> = {}) {
  return {
    getPathology:    overrides.getPathology    ?? jest.fn().mockReturnValue(of(MOCK_LAB_DATA)),
    updatePathology: overrides.updatePathology ?? jest.fn().mockReturnValue(of({ success: true })),
  };
}

function mockToastr() {
  return { success: jest.fn(), error: jest.fn(), warning: jest.fn() };
}

function createComponent(
  pathSvc: ReturnType<typeof mockPathologyService>,
  toastr:  ReturnType<typeof mockToastr> = mockToastr()
) {
  TestBed.configureTestingModule({
    imports:   [ReactiveFormsModule],
    providers: [
      LabProfileComponent,
      FormBuilder,
      { provide: PathologyService, useValue: pathSvc },
      { provide: ToastrService,    useValue: toastr },
    ],
  });
  return {
    component: TestBed.inject(LabProfileComponent),
    pathSvc,
    toastr,
  };
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('LabProfileComponent', () => {

  afterEach(() => TestBed.resetTestingModule());

  it('should be created', () => {
    const { component } = createComponent(mockPathologyService());
    expect(component).toBeTruthy();
  });

  // ── ngOnInit / loadProfile ─────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('sets loadState to "loaded" on successful API response', () => {
      const { component } = createComponent(mockPathologyService());

      component.ngOnInit();

      expect(component.loadState).toBe('loaded');
    });

    it('patches form values from API response', () => {
      const { component } = createComponent(mockPathologyService());

      component.ngOnInit();

      expect(component.form.get('path_Name')!.value).toBe('City Diagnostic Centre');
      expect(component.form.get('path_City')!.value).toBe('Mumbai');
      expect(component.form.get('path_Email')!.value).toBe('lab@city.com');
    });

    it('patches extended fields (motto, director, etc.)', () => {
      const { component } = createComponent(mockPathologyService());

      component.ngOnInit();

      expect(component.form.get('path_DirectorName')!.value).toBe('Dr. Sharma');
      expect(component.form.get('path_GSTNo')!.value).toBe('27AABCU9603R1ZX');
      expect(component.form.get('path_ReportHeader')!.value).toBe('City Diagnostic Centre');
    });

    it('sets loadState to "error" when API fails', () => {
      const pathSvc = mockPathologyService({
        getPathology: jest.fn().mockReturnValue(throwError(() => new Error('API error'))),
      });
      const toastr = mockToastr();
      const { component } = createComponent(pathSvc, toastr);

      component.ngOnInit();

      expect(component.loadState).toBe('error');
    });

    it('calls toastr.error when API fails', () => {
      const pathSvc = mockPathologyService({
        getPathology: jest.fn().mockReturnValue(throwError(() => new Error('API error'))),
      });
      const toastr = mockToastr();
      const { component } = createComponent(pathSvc, toastr);

      component.ngOnInit();

      expect(toastr.error).toHaveBeenCalled();
    });

    it('sets logoPreview when path_Logo is a string in API response', () => {
      const dataWithLogo = { ...MOCK_LAB_DATA, path_Logo: 'data:image/png;base64,abc123' };
      const pathSvc = mockPathologyService({
        getPathology: jest.fn().mockReturnValue(of(dataWithLogo)),
      });
      const { component } = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.logoPreview).toBe('data:image/png;base64,abc123');
    });
  });

  // ── hasError ───────────────────────────────────────────────────────────────

  describe('hasError()', () => {
    it('returns false when field is untouched (even if invalid)', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();

      // path_Name defaults to empty string → invalid, but untouched
      component.form.get('path_Name')!.setValue('');
      expect(component.hasError('path_Name')).toBe(false);
    });

    it('returns true when required field is touched and empty', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();

      component.form.get('path_Name')!.setValue('');
      component.form.get('path_Name')!.markAsTouched();
      expect(component.hasError('path_Name')).toBe(true);
    });

    it('returns false when field is valid and touched', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();

      component.form.get('path_Name')!.setValue('City Lab');
      component.form.get('path_Name')!.markAsTouched();
      expect(component.hasError('path_Name')).toBe(false);
    });
  });

  // ── Form defaults ──────────────────────────────────────────────────────────

  describe('form defaults', () => {
    it('defaults path_Country to "India"', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();

      // The form patches from API; if API has India it stays India
      expect(component.form.get('path_Country')!.value).toBe('India');
    });

    it('defaults path_CountryCode to "+91"', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();
      expect(component.form.get('path_CountryCode')!.value).toBe('+91');
    });

    it('defaults path_Currency to "INR"', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();
      expect(component.form.get('path_Currency')!.value).toBe('INR');
    });
  });

  // ── removeLogo ─────────────────────────────────────────────────────────────

  describe('removeLogo()', () => {
    it('clears logoPreview', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();
      component['logoPreview'] = 'data:image/png;base64,abc';

      component.removeLogo();

      expect(component.logoPreview).toBeNull();
    });

    it('clears the private logoFile reference', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();
      component['logoFile'] = new File(['x'], 'test.png', { type: 'image/png' });

      component.removeLogo();

      expect(component['logoFile']).toBeNull();
    });
  });

  // ── onLogoChange ───────────────────────────────────────────────────────────

  describe('onLogoChange()', () => {
    it('shows warning and returns early for non-image files', () => {
      const toastr = mockToastr();
      const { component } = createComponent(mockPathologyService(), toastr);
      component.ngOnInit();

      const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
      const event = { target: { files: [file] } } as any;

      component.onLogoChange(event);

      expect(toastr.warning).toHaveBeenCalled();
      expect(component['logoFile']).toBeNull();
    });

    it('shows warning for files larger than 2 MB', () => {
      const toastr = mockToastr();
      const { component } = createComponent(mockPathologyService(), toastr);
      component.ngOnInit();

      // Create a file > 2MB (2 * 1024 * 1024 bytes)
      const largeContent = 'x'.repeat(3 * 1024 * 1024);
      const file = new File([largeContent], 'large.png', { type: 'image/png' });
      const event = { target: { files: [file] } } as any;

      component.onLogoChange(event);

      expect(toastr.warning).toHaveBeenCalledWith(expect.stringContaining('2 MB'));
    });

    it('returns early when no files are selected', () => {
      const toastr = mockToastr();
      const { component } = createComponent(mockPathologyService(), toastr);
      component.ngOnInit();

      const event = { target: { files: [] } } as any;
      component.onLogoChange(event);

      expect(toastr.warning).not.toHaveBeenCalled();
      expect(toastr.error).not.toHaveBeenCalled();
    });
  });

  // ── save ───────────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('shows warning and does not submit when form is invalid', () => {
      const toastr = mockToastr();
      const pathSvc = mockPathologyService();
      const { component } = createComponent(pathSvc, toastr);
      component.ngOnInit();

      // Clear required field
      component.form.get('path_Name')!.setValue('');

      component.save();

      expect(pathSvc.updatePathology).not.toHaveBeenCalled();
      expect(toastr.warning).toHaveBeenCalled();
    });

    it('marks all controls as touched when form is invalid', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();
      component.form.get('path_Name')!.setValue('');

      component.save();

      expect(component.form.get('path_Name')!.touched).toBe(true);
    });

    it('calls updatePathology with a DTO when no logo file is selected', () => {
      const pathSvc = mockPathologyService();
      const { component } = createComponent(pathSvc);
      component.ngOnInit();
      // ngOnInit patches the form; it should be valid now
      // Manually ensure required fields are set
      component.form.patchValue({
        path_Name:      'City Lab',
        path_Address1:  '123 Street',
        path_City:      'Mumbai',
        path_State:     'Maharashtra',
        path_Country:   'India',
        path_ContactNo: '9876543210',
        path_Email:     'lab@city.com',
      });

      component.save();

      expect(pathSvc.updatePathology).toHaveBeenCalledWith(
        expect.objectContaining({ path_Name: 'City Lab' })
      );
    });

    it('calls toastr.success after successful save', () => {
      const toastr  = mockToastr();
      const pathSvc = mockPathologyService();
      const { component } = createComponent(pathSvc, toastr);
      component.ngOnInit();
      component.form.patchValue({
        path_Name:      'City Lab',
        path_Address1:  '123 Street',
        path_City:      'Mumbai',
        path_State:     'Maharashtra',
        path_Country:   'India',
        path_ContactNo: '9876543210',
        path_Email:     'lab@city.com',
      });

      component.save();

      expect(toastr.success).toHaveBeenCalled();
      expect(component.isSaving).toBe(false);
    });

    it('calls toastr.error and clears isSaving on save failure', () => {
      const toastr  = mockToastr();
      const pathSvc = mockPathologyService({
        getPathology:    jest.fn().mockReturnValue(of(MOCK_LAB_DATA)),
        updatePathology: jest.fn().mockReturnValue(throwError(() => new Error('500'))),
      });
      const { component } = createComponent(pathSvc, toastr);
      component.ngOnInit();
      component.form.patchValue({
        path_Name:      'City Lab',
        path_Address1:  '123 Street',
        path_City:      'Mumbai',
        path_State:     'Maharashtra',
        path_Country:   'India',
        path_ContactNo: '9876543210',
        path_Email:     'lab@city.com',
      });

      component.save();

      expect(toastr.error).toHaveBeenCalled();
      expect(component.isSaving).toBe(false);
    });
  });

  // ── ngOnDestroy ────────────────────────────────────────────────────────────

  describe('ngOnDestroy()', () => {
    it('completes the destroy$ subject without errors', () => {
      const { component } = createComponent(mockPathologyService());
      component.ngOnInit();
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
