import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { jwtDecode } from 'jwt-decode';
import { ToastrService } from 'ngx-toastr';
import { CommonService } from 'src/app/shared/common.service';
import { ConfirmModalService } from 'src/app/shared/confirm-modal/confirm-modal.service';
import { FingerprintService } from 'src/app/services/loginServices/fingerprint.service';

type FpState = 'loading' | 'unsupported' | 'configured' | 'setup';

/**
 * Fingerprint (WebAuthn) enrolment panel — the fingerprint equivalent of
 * <app-setup-mfa>. Registers the device's platform authenticator (Windows Hello,
 * Touch ID, built-in laptop reader) and lists / removes enrolled credentials.
 *
 * Emits {@link statusChanged} so the host Settings page can enable or disable the
 * "Fingerprint" preferred-login option without a page refresh — mirroring how
 * SetupMfaComponent drives the "Authenticator App" option.
 */
@Component({
  selector: 'app-setup-fingerprint',
  templateUrl: './setup-fingerprint.component.html',
  styleUrls: ['../account-pages.shared.css', './setup-fingerprint.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class SetupFingerprintComponent implements OnInit {
  @Input() embedded = false;

  /** Emits true when at least one credential is enrolled, false when none remain. */
  @Output() statusChanged = new EventEmitter<boolean>();

  userName = '';
  state: FpState = 'loading';
  error = '';

  credentials: Array<{ id: number; deviceLabel?: string; registeredAt: string; lastUsedAt?: string }> = [];

  deviceLabel = '';
  registering = false;

  constructor(
    private common: CommonService,
    private toastr: ToastrService,
    private confirmModal: ConfirmModalService,
    private fingerprint: FingerprintService,
  ) {
    const token = this.common.getAccessToken();
    if (token) {
      try { this.userName = jwtDecode<any>(token).sub || ''; } catch { this.userName = ''; }
    }
  }

  ngOnInit(): void {
    if (!FingerprintService.isSupported()) {
      this.state = 'unsupported';
      return;
    }
    this.loadStatus();
  }

  loadStatus(): void {
    this.state = 'loading';
    this.error = '';
    this.fingerprint.getStatus(this.userName).subscribe({
      next: (res: any) => {
        this.credentials = res?.credentials ?? [];
        this.state = this.credentials.length > 0 ? 'configured' : 'setup';
      },
      error: () => {
        this.error = 'Failed to load fingerprint status. Please try again.';
        this.state = 'setup';
      },
    });
  }

  register(): void {
    if (this.registering) return;
    this.registering = true;
    this.error = '';

    const label = this.deviceLabel.trim() || this.getBrowserLabel();
    this.fingerprint.registerFingerprint(this.userName, label).subscribe({
      next: (ok: boolean) => {
        this.registering = false;
        if (ok) {
          this.toastr.success('Fingerprint registered successfully!', 'Fingerprint enabled');
          this.deviceLabel = '';
          this.statusChanged.emit(true);
          this.loadStatus();
        } else {
          this.error = 'Registration failed. Please try again.';
        }
      },
      error: (err: any) => {
        this.registering = false;
        // Show the real reason (WebAuthn error name or server message) so failures are diagnosable.
        this.error = err?.message || (typeof err === 'string' ? err : 'Fingerprint registration failed. Please try again.');
      },
    });
  }

  removeAll(): void {
    this.confirmModal.confirm({
      title: 'Remove fingerprint sign-in',
      message: 'Remove all registered fingerprints from your account? You will need to register again to use fingerprint sign-in.',
      confirmText: 'Yes, Remove',
      cancelText: 'Cancel',
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.fingerprint.disable(this.userName).subscribe({
        next: (res: any) => {
          if (res?.success) {
            this.toastr.success('Fingerprint sign-in removed.', 'Success');
            this.statusChanged.emit(false);
            this.loadStatus();
          } else {
            this.error = res?.message || 'Failed to remove fingerprint.';
          }
        },
        error: () => { this.error = 'Failed to remove fingerprint. Please try again.'; },
      });
    });
  }

  private getBrowserLabel(): string {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua))  return 'iPhone';
    if (/iPad/.test(ua))    return 'iPad';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Mac/.test(ua))     return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    return 'This device';
  }
}
