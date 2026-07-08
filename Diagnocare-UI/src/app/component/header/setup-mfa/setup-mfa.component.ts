import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';
import { CommonService } from 'src/app/shared/common.service';
import { HeaderService } from 'src/app/services/headerServices/header-service';
import { ToastrService } from 'ngx-toastr';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';

type PageState = 'loading' | 'configured' | 'setup' | 'verify' | 'disable-confirm';

@Component({
  selector: 'app-setup-mfa',
  templateUrl: './setup-mfa.component.html',
  styleUrls: ['../account-pages.shared.css', './setup-mfa.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class SetupMfaComponent implements OnInit {
  /**
   * When true, the component is rendered inside another page (e.g. the Settings
   * page) and skips its own page wrapper + gradient header banner.
   * Consumed by the Settings host template as <app-setup-mfa [embedded]="true">.
   */
  @Input() embedded = false;

  /**
   * Emits whenever MFA is enabled (true) or removed (false), so a host page
   * (e.g. Settings) can refresh anything that depends on MFA status — such as
   * whether "Authenticator App" can be chosen as the preferred login method —
   * without requiring a manual page refresh.
   */
  @Output() mfaStatusChanged = new EventEmitter<boolean>();

  userName: string = '';

  state: PageState = 'loading';
  error: string = '';

  // Configured state — populated from getMFAStatus
  issuerLabel: string = '';
  accountName: string = '';
  registeredDevice: string = '';   // stored when MFA was last verified
  configuredAt: string = '';

  // Setup state — populated from setupMFA
  qrCodeDataUrl: string = '';   // data:image/png;base64,…
  qrCodeUri: string = '';       // otpauth:// URI
  manualEntryKey: string = '';
  issuer: string = '';
  keyVisible: boolean = false;
  keyCopied: boolean = false;

  // Verify state
  verifyCode: string = '';
  deviceName: string = '';     // user-supplied label, e.g. "My iPhone"
  verifying: boolean = false;

  // Disable-confirm state
  disableCode: string = '';
  disabling: boolean = false;

  constructor(
    private headerService:  HeaderService,
    private common:         CommonService,
    private router:         Router,
    private toastr:         ToastrService,
    private confirmModal:   ConfirmModalService,
  ) {
    const token = this.common.getAccessToken();
    if (token) {
      try {
        const payload = jwtDecode<any>(token);
        this.userName = payload.sub || '';
      } catch {
        this.userName = '';
      }
    }
  }

  ngOnInit(): void {
    this.loadStatus();
  }

  loadStatus(): void {
    this.state = 'loading';
    this.error = '';
    this.headerService.getMFAStatus(this.userName).subscribe({
      next: (res) => {
        if (res.isMfaEnabled) {
          this.issuerLabel      = res.issuer      || 'Diagnocare';
          this.accountName      = res.accountName || this.userName;
          this.registeredDevice = res.deviceName  || '';
          this.configuredAt     = res.configuredAt || '';
          this.state = 'configured';
        } else {
          this.beginSetup();
        }
      },
      error: () => {
        this.error = 'Failed to load MFA status. Please try again.';
        this.state = 'setup';
      }
    });
  }

  beginSetup(): void {
    this.state = 'loading';
    this.error = '';
    this.verifyCode = '';
    this.deviceName = '';
    this.keyVisible = false;
    this.keyCopied  = false;
    this.headerService.setupMFA(this.userName).subscribe({
      next: (res) => {
        this.qrCodeDataUrl = `data:image/png;base64,${res.qrCodeImageBase64}`;
        this.qrCodeUri     = res.qrCodeUri    || '';
        this.manualEntryKey = res.manualEntryKey;
        this.issuer        = res.issuer       || 'Diagnocare';
        this.state = 'setup';
      },
      error: () => {
        this.error = 'Failed to initiate MFA setup. Please try again.';
        this.state = 'setup';
      }
    });
  }

  proceedToVerify(): void {
    this.state = 'verify';
    this.verifyCode = '';
    this.error = '';
  }

  verifyAndActivate(): void {
    const code = this.verifyCode.trim().replace(/\s/g, '');
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
      this.error = 'Enter the 6-digit code from your authenticator app.';
      return;
    }
    this.verifying = true;
    this.error = '';
    const device = this.deviceName.trim() || this.getBrowserLabel();
    this.headerService.verifyMFA(this.userName, code, device).subscribe({
      next: (res) => {
        this.verifying = false;
        if (res.success) {
          this.toastr.success('Authenticator app linked successfully!', 'MFA Enabled');
          this.mfaStatusChanged.emit(true);
          this.loadStatus();
        } else {
          this.error = res.message || 'Invalid code. Please try again.';
        }
      },
      error: () => {
        this.verifying = false;
        this.error = 'Verification failed. Please try again.';
      }
    });
  }

  disableMFA(): void {
    this.confirmModal.confirm({
      title:       'Remove MFA',
      message:     'Remove the authenticator app from your account? You will need to set it up again to re-enable two-factor authentication.',
      confirmText: 'Yes, Remove',
      cancelText:  'Cancel',
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.disableCode = '';
      this.error       = '';
      this.state       = 'disable-confirm';
    });
  }

  confirmDisable(): void {
    const code = this.disableCode.trim().replace(/\s/g, '');
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
      this.error = 'Enter the 6-digit code from your authenticator app.';
      return;
    }
    this.disabling = true;
    this.error     = '';
    this.headerService.disableMFA(this.userName, code).subscribe({
      next: (res) => {
        this.disabling = false;
        if (res.success) {
          this.toastr.success('MFA removed successfully.', 'Success');
          this.mfaStatusChanged.emit(false);
          this.beginSetup();
        } else {
          this.error = res.message || 'Invalid code. Please try again.';
        }
      },
      error: () => {
        this.disabling = false;
        this.error = 'Failed to remove MFA. Please try again.';
      }
    });
  }

  cancelDisable(): void {
    this.state       = 'configured';
    this.disableCode = '';
    this.error       = '';
  }

  copyKey(): void {
    navigator.clipboard.writeText(this.manualEntryKey).then(() => {
      this.keyCopied = true;
      setTimeout(() => (this.keyCopied = false), 2000);
    });
  }

  formatKey(key: string): string {
    return key.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  }

  /** Fallback device label derived from browser user-agent. */
  private getBrowserLabel(): string {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua))  return 'iPhone';
    if (/iPad/.test(ua))    return 'iPad';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Mac/.test(ua))     return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    return 'Browser';
  }

  goBack(): void {
    if (this.state === 'verify') {
      this.state = 'setup';
      this.error = '';
    } else if (this.state === 'disable-confirm') {
      this.cancelDisable();
    } else {
      this.router.navigate(['/settings']);
    }
  }
}
