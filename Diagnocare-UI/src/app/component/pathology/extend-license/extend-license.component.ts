import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { PathologyPublicInfoDto } from 'src/app/models/pathology/pathology-public-info.dto';
import { PathologyExtendLicenseResponseDto } from 'src/app/models/pathology/pathology-extend-license.dto';

@Component({
  selector: 'app-extend-license',
  standalone: true,
  templateUrl: './extend-license.component.html',
  styleUrls: ['./extend-license.component.css'],
  imports: [CommonModule, RouterModule],
})
export class ExtendLicenseComponent implements OnInit {

  readonly TRIAL_DAYS   = 15;
  readonly LICENSE_DAYS = 365;

  // Page state
  loadState: 'loading' | 'loaded' | 'error' | 'not-registered' = 'loading';
  pathologyInfo: PathologyPublicInfoDto | null = null;
  loadError = '';

  // Selection
  selectedType: 'Trial' | 'License' = 'License';

  // Submission
  isSubmitting = false;
  result: PathologyExtendLicenseResponseDto | null = null;
  submitError = '';

  constructor(private _pathologyService: PathologyService) {}

  ngOnInit(): void {
    this._pathologyService.getPublicInfo().subscribe({
      next: (info) => {
        if (!info?.isRegistered) {
          this.loadState = 'not-registered';
          return;
        }
        this.pathologyInfo = info;
        this.loadState = 'loaded';
      },
      error: () => {
        this.loadState = 'error';
        this.loadError = 'Could not fetch pathology details. Please try again.';
      },
    });
  }

  get newExpiryDate(): string {
    const days = this.selectedType === 'Trial' ? this.TRIAL_DAYS : this.LICENSE_DAYS;
    const base = this.pathologyInfo?.date_of_Expiry
      ? new Date(this.pathologyInfo.date_of_Expiry)
      : new Date();
    base.setDate(base.getDate() + days);
    return base.toISOString().split('T')[0];
  }

  get newExpiryDisplay(): string {
    const d = new Date(this.newExpiryDate);
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
  }

  get currentExpiryDisplay(): string {
    if (!this.pathologyInfo?.date_of_Expiry) return '—';
    const d = new Date(this.pathologyInfo.date_of_Expiry);
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
  }

  get daysLeft(): number {
    if (!this.pathologyInfo?.date_of_Expiry) return 0;
    const diff = new Date(this.pathologyInfo.date_of_Expiry).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  selectType(type: 'Trial' | 'License'): void {
    this.selectedType = type;
  }

  submit(): void {
    this.isSubmitting = true;
    this.submitError  = '';

    this._pathologyService.extendLicense({
      license_Type:   this.selectedType,
      newExpiryDate: this.newExpiryDate,
    }).subscribe({
      next: (res) => {
        this.isSubmitting = false;
        if (res?.success === false) {
          this.submitError = res.message || 'Extension failed. Please try again.';
        } else {
          this.result = res;
        }
      },
      error: () => {
        this.isSubmitting = false;
        this.submitError  = 'An error occurred. Please try again.';
      },
    });
  }

  copyKey(): void {
    const key = this.result?.licenseKey;
    if (key) navigator.clipboard.writeText(key).catch(() => {});
  }
}
