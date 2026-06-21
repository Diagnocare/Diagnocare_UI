import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { PathologyRegisterDto } from 'src/app/models/pathology/pathology-register.dto';
import { PathologyRegisterResponseDto } from 'src/app/models/pathology/pathology-register-response.dto';

@Component({
  selector: 'app-register-pathology',
  standalone: true,
  templateUrl: './register-pathology.component.html',
  styleUrls: ['./register-pathology.component.css'],
  imports: [ReactiveFormsModule, CommonModule, RouterModule],
})
export class RegisterPathologyComponent implements OnInit {

  form!: FormGroup;
  isSubmitting = false;
  registrationResult: PathologyRegisterResponseDto | null = null;
  serverError = '';

  readonly TRIAL_DAYS   = 15;
  readonly LICENSE_DAYS = 365;

  constructor(
    private fb: FormBuilder,
    private _pathologyService: PathologyService,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      path_Name:      ['', [Validators.required, Validators.maxLength(150)]],
      path_Branch:    ['', Validators.maxLength(100)],
      path_Address1:  ['', [Validators.required, Validators.maxLength(200)]],
      path_Address2:  ['', Validators.maxLength(200)],
      path_City:      ['', [Validators.required, Validators.maxLength(80)]],
      path_State:     ['', [Validators.required, Validators.maxLength(80)]],
      path_Country:   ['India', [Validators.required, Validators.maxLength(80)]],
      path_Pincode:   ['', [Validators.pattern('^[0-9]{4,10}$')]],
      path_ContactNo: ['', [Validators.required, Validators.pattern('^[0-9]{7,15}$')]],
      path_Email:     ['', [Validators.required, Validators.email]],
      license_Type:   ['Trial', Validators.required],
    });

    // Recalculate expiry whenever license type changes
    this.form.get('license_Type')!.valueChanges.subscribe(() => {
      // Expiry is derived; no extra field needed
    });
  }

  get licenseType(): 'Trial' | 'License' {
    return this.form.get('license_Type')!.value;
  }

  get expiryDate(): string {
    const days = this.licenseType === 'Trial' ? this.TRIAL_DAYS : this.LICENSE_DAYS;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  get expiryDisplay(): string {
    const d = new Date(this.expiryDate);
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
  }

  selectLicenseType(type: 'Trial' | 'License'): void {
    this.form.get('license_Type')!.setValue(type);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting  = true;
    this.serverError   = '';

    const dto: PathologyRegisterDto = {
      ...this.form.value,
      date_of_Expiry: this.expiryDate,
    };

    this._pathologyService.registerPathology(dto).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (res?.success === false) {
          this.serverError = res.message || 'Registration failed. Please try again.';
        } else {
          this.registrationResult = res;
        }
      },
      error: () => {
        this.isSubmitting = false;
        this.serverError  = 'An error occurred while registering. Please try again.';
      },
    });
  }

  hasError(field: string): boolean {
    const c = this.form.get(field);
    return !!(c && c.invalid && c.touched);
  }

  copyLicenseKey(): void {
    if (this.registrationResult?.licenseKey) {
      navigator.clipboard.writeText(this.registrationResult.licenseKey).catch(() => {});
    }
  }
}
