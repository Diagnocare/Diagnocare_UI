import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

import { PathologyService }        from 'src/app/services/pathologyServices/pathology.service';
import { PathologyEditDto }        from 'src/app/models/pathology/pathology-edit.dto';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { FieldErrorComponent }     from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective }   from 'src/app/shared/directives/form-keyboard.directive';
import { AppValidators }           from 'src/app/shared/validators/app-validators';
import { VALIDATION_PATTERNS }     from 'src/app/shared/validators/validation-patterns';

@Component({
  selector: 'app-lab-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LoadingSpinnerComponent, FieldErrorComponent, FormKeyboardDirective],
  templateUrl: './lab-profile.component.html',
  styleUrls: ['./lab-profile.component.scss'],
})
export class LabProfileComponent implements OnInit, OnDestroy {

  form!: FormGroup;
  loadState: 'loading' | 'loaded' | 'error' = 'loading';
  isSaving = false;
  submitted = false;

  /** Tab order for keyboard navigation across all editable lab-profile fields. */
  readonly tabFields = [
    'path_Name', 'path_Branch', 'path_Motto', 'path_Tagline',
    'path_Address1', 'path_Address2', 'path_City', 'path_State',
    'path_Country', 'path_Pincode',
    'path_ContactNo', 'path_AltContactNo', 'path_Email', 'path_Website',
    'path_GSTNo', 'path_PANNo', 'path_RegNo', 'path_NABLNo',
    'path_DirectorName', 'path_LabInCharge',
    'path_ReportHeader', 'path_ReportFooter', 'path_SignatoryName',
    'path_CountryCode', 'path_Currency',
  ];

  /** Preview URL for the logo — loaded from DB via GetById, updated on upload. */
  logoPreview: string | null = null;

  // Licence info (read-only display)
  licenseKey:        string | null = null;
  licenseType:       string | null = null;
  licenseExpiry:     string | null = null;
  licenseKeyVisible  = false;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private pathologyService: PathologyService,
    private toastr:           ToastrService,
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadProfile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Form ──────────────────────────────────────────────────────────

  private buildForm(): void {
    this.form = this.fb.group({
      // Identity
      path_Name:        ['', [Validators.required, Validators.maxLength(150)]],
      path_Branch:      ['', Validators.maxLength(100)],
      path_Motto:       ['', Validators.maxLength(250)],
      path_Tagline:     ['', Validators.maxLength(150)],

      // Address
      path_Address1:    ['', [Validators.required, Validators.maxLength(200)]],
      path_Address2:    ['', Validators.maxLength(200)],
      path_City:        ['', [Validators.required, Validators.maxLength(80)]],
      path_State:       ['', [Validators.required, Validators.maxLength(80)]],
      path_Country:     ['India', [Validators.required, Validators.maxLength(80)]],
      path_Pincode:     ['', Validators.pattern(VALIDATION_PATTERNS.pincodeIntl)],

      // Contact
      path_ContactNo:   ['', [Validators.required, AppValidators.contactNumber()]],
      path_AltContactNo:['', AppValidators.contactNumber()],
      path_Email:       ['', [Validators.required, Validators.email]],
      path_Website:     ['', Validators.maxLength(200)],

      // Legal
      path_GSTNo:       ['', Validators.maxLength(50)],
      path_PANNo:       ['', Validators.maxLength(20)],
      path_RegNo:       ['', Validators.maxLength(80)],
      path_NABLNo:      ['', Validators.maxLength(80)],

      // People
      path_DirectorName:['', Validators.maxLength(150)],
      path_LabInCharge: ['', Validators.maxLength(150)],

      // Report branding
      path_ReportHeader:  ['', Validators.maxLength(500)],
      path_ReportFooter:  ['', Validators.maxLength(500)],
      path_SignatoryName: ['', Validators.maxLength(150)],

      // Regional
      path_CountryCode: ['+91', Validators.maxLength(10)],
      path_Currency:    ['INR', Validators.maxLength(10)],
    });
  }

  private loadProfile(): void {
    this.pathologyService.getPathology()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.form.patchValue({
            path_Name:          data.path_Name         ?? '',
            path_Branch:        data.path_Branch        ?? '',
            path_Motto:         (data as any).path_Motto       ?? '',
            path_Tagline:       (data as any).path_Tagline     ?? '',
            path_Address1:      data.path_Address1      ?? '',
            path_Address2:      data.path_Address2      ?? '',
            path_City:          data.path_City           ?? '',
            path_State:         data.path_State          ?? '',
            path_Country:       data.path_Country        ?? 'India',
            path_Pincode:       data.path_Pincode        ?? '',
            path_ContactNo:     data.path_ContactNo      ?? '',
            path_AltContactNo:  (data as any).path_AltContactNo ?? '',
            path_Email:         data.path_Email          ?? '',
            path_Website:       (data as any).path_Website      ?? '',
            path_GSTNo:         (data as any).path_GSTNo        ?? '',
            path_PANNo:         (data as any).path_PANNo        ?? '',
            path_RegNo:         (data as any).path_RegNo        ?? '',
            path_NABLNo:        (data as any).path_NABLNo       ?? '',
            path_DirectorName:  (data as any).path_DirectorName ?? '',
            path_LabInCharge:   (data as any).path_LabInCharge  ?? '',
            path_ReportHeader:  (data as any).path_ReportHeader ?? '',
            path_ReportFooter:  (data as any).path_ReportFooter ?? '',
            path_SignatoryName: (data as any).path_SignatoryName ?? '',
            path_CountryCode:   data.path_CountryCode   ?? '+91',
            path_Currency:      data.path_Currency       ?? 'INR',
          });

          // Load logo from the DB via GetById — path_Logo is a raw base64 string
          const rawLogo = data.path_Logo as string | null | undefined;
          if (rawLogo) {
            this.logoPreview = rawLogo.startsWith('data:')
              ? rawLogo
              : `data:image/png;base64,${rawLogo}`;
          } else {
            this.logoPreview = null;
          }

          // Licence info — read-only display
          this.licenseKey    = (data as any).licenseKey    ?? null;
          this.licenseType   = data.license_Type           ?? null;
          this.licenseExpiry = data.date_of_Expiry         ?? null;

          this.loadState = 'loaded';
        },
        error: () => {
          this.loadState = 'error';
          this.toastr.error('Could not load lab profile.');
        },
      });
  }

  // ── Logo handling ─────────────────────────────────────────────────

  onLogoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.toastr.warning('Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.toastr.warning('Logo must be smaller than 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      this.logoPreview = dataUrl;
      // Upload logo to the database via the dedicated endpoint
      this.pathologyService.uploadLogo(dataUrl)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next:  () => this.toastr.success('Logo uploaded successfully.'),
          error: () => this.toastr.error('Failed to upload logo. Please try again.'),
        });
    };
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.logoPreview = null;
  }

  // ── Save ──────────────────────────────────────────────────────────

  save(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Please fix the highlighted fields before saving.');
      return;
    }

    this.isSaving = true;
    const dto: PathologyEditDto = this.form.value;

    this.pathologyService.updatePathology(dto).pipe(takeUntil(this.destroy$)).subscribe({
      next:  () => this.onSaveSuccess(),
      error: () => this.onSaveError(),
    });
  }

  private onSaveSuccess(): void {
    this.isSaving = false;
    this.toastr.success('Lab profile saved successfully.');
  }

  private onSaveError(): void {
    this.isSaving = false;
    this.toastr.error('Failed to save lab profile. Please try again.');
  }

  // ── Template helpers ──────────────────────────────────────────────

  /** @deprecated Use <app-field-error> instead. Kept for backward compat. */
  hasError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c?.invalid && (c?.touched || this.submitted));
  }

  /** Expose for template use with [class.is-error]. */
  isInvalid(field: string): boolean { return this.hasError(field); }

  get formattedLicenseExpiry(): string {
    if (!this.licenseExpiry) return '—';
    const d = new Date(this.licenseExpiry);
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
  }

  get maskedLicenseKey(): string {
    if (!this.licenseKey) return '—';
    if (this.licenseKeyVisible) return this.licenseKey;
    const len = this.licenseKey.length;
    return this.licenseKey.substring(0, 4) + '•'.repeat(Math.max(0, len - 8)) + this.licenseKey.substring(len - 4);
  }

  toggleKeyVisibility(): void {
    this.licenseKeyVisible = !this.licenseKeyVisible;
  }

  copyLicenseKey(): void {
    if (!this.licenseKey) return;
    navigator.clipboard.writeText(this.licenseKey).then(
      () => this.toastr.success('License key copied to clipboard.'),
      () => this.toastr.error('Could not copy to clipboard.'),
    );
  }
}
