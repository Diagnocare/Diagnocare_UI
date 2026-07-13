import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

import { PathologyService }             from 'src/app/services/pathologyServices/pathology.service';
import { PathologyProfileCacheService } from 'src/app/services/pathologyServices/pathology-profile-cache.service';
import { PathologyProfileDto }          from 'src/app/models/pathology/pathology-profile.dto';
import { PathologyEditDto }             from 'src/app/models/pathology/pathology-edit.dto';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { FieldErrorComponent }     from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective }   from 'src/app/shared/directives/form-keyboard.directive';
import { NumericOnlyDirective }    from 'src/app/shared/directives/numeric-only.directive';
import { AppValidators }           from 'src/app/shared/validators/app-validators';

@Component({
  selector: 'app-lab-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LoadingSpinnerComponent, FieldErrorComponent, FormKeyboardDirective, NumericOnlyDirective],
  templateUrl: './lab-profile.component.html',
  styleUrls: ['./lab-profile.component.scss'],
})
export class LabProfileComponent implements OnInit, OnDestroy {

  form!: FormGroup;
  loadState: 'loading' | 'loaded' | 'error' = 'loading';
  isSaving = false;
  isRefreshing = false;
  submitted = false;

  /** Tab order for keyboard navigation across all editable lab-profile fields. */
  readonly tabFields = [
    'path_Motto', 'path_Tagline',
    'path_AltContactNo', 'path_Website',
    'path_GSTNo', 'path_PANNo', 'path_RegNo', 'path_NABLNo',
    'path_DirectorName', 'path_LabInCharge',
    'path_ReportHeader', 'path_ReportFooter', 'path_SignatoryName',
    'path_CountryCode', 'path_Currency',
  ];

  /** Preview URL for the logo — loaded via GetProfile, updated on upload. */
  logoPreview: string | null = null;

  // Identity + license — read-only display, sourced from the shared PathologyManager
  // API (see PathologyService.getProfile). Editing these here would be silently
  // overwritten on the next refresh, so they aren't part of the editable form.
  pathName: string | null = null;
  pathBranch: string | null = null;
  pathCode: string | null = null;
  pathCategory: string | null = null;
  pathAddress1: string | null = null;
  pathAddress2: string | null = null;
  pathCity: string | null = null;
  pathState: string | null = null;
  pathCountry: string | null = null;
  pathPincode: string | null = null;
  pathContactNo: string | null = null;
  pathEmail: string | null = null;

  licenseType:      string | null = null;
  licenseStatus:    string | null = null;
  licenseIsActive   = false;
  licenseExpiry:    string | null = null;

  /** True when the identity/license fields above came from the shared API rather
   *  than a local fallback (see PathologyProfileDto.sourcedFromSharedApi). */
  sharedDataAvailable = true;

  /** True while the fields on screen are the client-side cached copy, before the
   *  background refresh (if any) has completed. */
  fromCache = false;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private pathologyService: PathologyService,
    private profileCache:     PathologyProfileCacheService,
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

  // ── Form (local-only fields — the shared identity/license fields above are
  //    read-only display, not part of this form) ─────────────────────

  private buildForm(): void {
    this.form = this.fb.group({
      path_Motto:       ['', Validators.maxLength(250)],
      path_Tagline:     ['', Validators.maxLength(150)],

      path_AltContactNo:['', AppValidators.contactNumber()],
      path_Website:     ['', Validators.maxLength(200)],

      path_GSTNo:       ['', Validators.maxLength(50)],
      path_PANNo:       ['', Validators.maxLength(20)],
      path_RegNo:       ['', Validators.maxLength(80)],
      path_NABLNo:      ['', Validators.maxLength(80)],

      path_DirectorName:['', Validators.maxLength(150)],
      path_LabInCharge: ['', Validators.maxLength(150)],

      path_ReportHeader:  ['', Validators.maxLength(500)],
      path_ReportFooter:  ['', Validators.maxLength(500)],
      path_SignatoryName: ['', Validators.maxLength(150)],

      path_CountryCode: ['+91', Validators.maxLength(10)],
      path_Currency:    ['INR', Validators.maxLength(10)],
    });
  }

  // ── Load (cache-first, time-based expiry) ──────────────────────────

  private loadProfile(): void {
    const cached = this.profileCache.get();
    if (cached) {
      this.applyProfile(cached);
      this.fromCache = true;
      this.loadState = 'loaded';

      // Cheap change-check: only re-download the full profile if the shared version
      // changed (a super-admin edited the pathology or extended the license). If it's
      // unchanged, we don't hit the profile endpoint at all.
      this.pathologyService.getProfileVersion()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res) => {
            if (res?.version != null && res.version !== cached.version) {
              this.fetchProfile(/* showSpinner */ false);
            }
          },
          error: () => { /* keep the cached copy on a version-check failure */ },
        });
      return;
    }

    this.fetchProfile(/* showSpinner */ true);
  }

  private fetchProfile(showSpinner: boolean): void {
    if (showSpinner) this.loadState = 'loading';

    this.pathologyService.getProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.applyProfile(data);
          this.profileCache.set(data);
          this.fromCache = false;
          this.loadState = 'loaded';
          this.isRefreshing = false;
        },
        error: () => {
          // Keep any cached copy on screen; only surface the error state if we
          // have nothing to show at all.
          if (this.loadState !== 'loaded') this.loadState = 'error';
          this.isRefreshing = false;
        },
      });
  }

  /** Bypasses the cache and re-fetches immediately (e.g. after a Super Admin change). */
  refresh(): void {
    this.isRefreshing = true;
    this.profileCache.clear();
    this.fetchProfile(false);
  }

  private applyProfile(data: PathologyProfileDto): void {
    this.form.patchValue({
      path_Motto:         data.path_Motto         ?? '',
      path_Tagline:       data.path_Tagline       ?? '',
      path_AltContactNo:  data.path_AltContactNo  ?? '',
      path_Website:       data.path_Website       ?? '',
      path_GSTNo:         data.path_GSTNo         ?? '',
      path_PANNo:         data.path_PANNo         ?? '',
      path_RegNo:         data.path_RegNo         ?? '',
      path_NABLNo:        data.path_NABLNo        ?? '',
      path_DirectorName:  data.path_DirectorName  ?? '',
      path_LabInCharge:   data.path_LabInCharge   ?? '',
      path_ReportHeader:  data.path_ReportHeader  ?? '',
      path_ReportFooter:  data.path_ReportFooter  ?? '',
      path_SignatoryName: data.path_SignatoryName ?? '',
      path_CountryCode:   data.path_CountryCode   ?? '+91',
      path_Currency:      data.path_Currency      ?? 'INR',
    });

    // Identity + address + contact — read-only, sourced from the shared registry.
    this.pathName      = data.path_Name;
    this.pathBranch     = data.path_Branch;
    this.pathCode       = data.path_Code;
    this.pathCategory   = data.path_Category;
    this.pathAddress1   = data.path_Address1;
    this.pathAddress2   = data.path_Address2 ?? null;
    this.pathCity       = data.path_City;
    this.pathState      = data.path_State;
    this.pathCountry    = data.path_Country;
    this.pathPincode    = data.path_Pincode;
    this.pathContactNo  = data.path_ContactNo;
    this.pathEmail      = data.path_Email;

    this.sharedDataAvailable = data.sourcedFromSharedApi;

    // Logo — path_Logo is a raw base64 string (no data-URI prefix) from the API.
    const rawLogo = data.path_Logo;
    this.logoPreview = rawLogo
      ? (rawLogo.startsWith('data:') ? rawLogo : `data:image/png;base64,${rawLogo}`)
      : null;

    // License — masked/summary only. There is no raw key in this DTO at all.
    this.licenseType     = data.license_Type      || null;
    this.licenseStatus   = data.license_Status    || null;
    this.licenseIsActive = data.license_IsActive;
    this.licenseExpiry   = data.license_ExpiryDate || null;
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
          next:  () => {
            this.toastr.success('Logo uploaded successfully.');
            this.profileCache.clear(); // Next load should reflect the new logo.
          },
          error: () => { /* message shown centrally by ErrorInterceptor */ },
        });
    };
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.logoPreview = null;
  }

  // ── Save (local-only fields only — identity/address/contact/license are
  //    managed centrally and aren't part of this form) ────────────────

  save(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Please fix the highlighted fields before saving.');
      return;
    }

    this.isSaving = true;
    const dto: PathologyEditDto = {
      ...this.form.value,
      // Identity/address/contact are read-only in this UI (managed via the shared
      // registry — see applyProfile), but the local Update endpoint still requires
      // Path_Name and matches the row by it. Echo back the currently displayed
      // values unchanged so the local row stays in sync and validation passes.
      path_Name:      this.pathName      ?? undefined,
      path_Branch:    this.pathBranch    ?? undefined,
      path_Address1:  this.pathAddress1  ?? undefined,
      path_Address2:  this.pathAddress2  ?? undefined,
      path_City:      this.pathCity      ?? undefined,
      path_State:     this.pathState     ?? undefined,
      path_Country:   this.pathCountry   ?? undefined,
      path_Pincode:   this.pathPincode   ?? undefined,
      path_ContactNo: this.pathContactNo ?? undefined,
      path_Email:     this.pathEmail     ?? undefined,
    };

    this.pathologyService.updatePathology(dto).pipe(takeUntil(this.destroy$)).subscribe({
      next:  () => this.onSaveSuccess(),
      error: () => this.onSaveError(),
    });
  }

  private onSaveSuccess(): void {
    this.isSaving = false;
    this.profileCache.clear(); // Local-only fields changed — next load should reflect them.
    this.toastr.success('Lab profile saved successfully.');
  }

  private onSaveError(): void {
    // Message shown centrally by ErrorInterceptor.
    this.isSaving = false;
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

  /** Joins the address parts, skipping any that are empty. */
  get formattedAddress(): string {
    const parts = [this.pathAddress1, this.pathAddress2, this.pathCity, this.pathState, this.pathCountry, this.pathPincode]
      .map((x) => (x ?? '').trim())
      .filter((x) => x.length > 0);
    return parts.length ? parts.join(', ') : '—';
  }
}
