import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';

import { PinService } from 'src/app/services/pinServices/pin.service';
import { CommonService } from 'src/app/shared/common.service';
import { TokenService } from 'src/app/core/interceptors/token.service';

/**
 * ChangePinComponent
 * ──────────────────
 * Dedicated page for changing a session PIN.
 *
 * Two entry modes:
 *   1. Forced — navigated here automatically when the PIN has expired
 *      (reason=expired in query params).  All other modules are blocked
 *      until the user successfully sets a new PIN.
 *   2. Normal — user navigates here voluntarily (e.g. from a banner link).
 *
 * Enforces:
 *   • Current PIN verification (unless mode is forced-expired, where the current
 *     PIN can no longer satisfy the expiry policy and we still require it for
 *     identity confirmation).
 *   • New PIN must not match any of the last 3 PINs.
 *   • New PIN must be 4–6 digits.
 */
@Component({
  selector: 'app-change-pin',
  templateUrl: './change-pin.component.html',
  styleUrls: ['../account-pages.shared.css', './change-pin.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class ChangePinComponent implements OnInit {

  isExpiredFlow = false;

  currentPin       = '';
  newPin           = '';
  confirmPin       = '';

  showCurrentPin   = false;
  showNewPin       = false;
  showConfirmPin   = false;

  pinError         = '';
  pinSuccess       = '';
  saving           = false;

  userName         = '';

  constructor(
    private pinService:   PinService,
    private tokenService: TokenService,
    private common:       CommonService,
    private route:        ActivatedRoute,
    private router:       Router,
  ) {}

  ngOnInit(): void {
    this.isExpiredFlow = this.route.snapshot.queryParamMap.get('reason') === 'expired';

    // Resolve username from token.
    const token = this.common.getAccessToken();
    if (token) {
      try {
        this.userName = (jwtDecode<any>(token)).sub ?? '';
      } catch {
        this.userName = this.tokenService.getUserId() ?? '';
      }
    } else {
      this.userName = this.tokenService.getUserId() ?? '';
    }
  }

  // ── Visibility toggles ─────────────────────────────────────────────────────

  toggleCurrent() { this.showCurrentPin  = !this.showCurrentPin;  }
  toggleNew()     { this.showNewPin      = !this.showNewPin;      }
  toggleConfirm() { this.showConfirmPin  = !this.showConfirmPin;  }

  // ── Validation helpers ─────────────────────────────────────────────────────

  private isValidPin(pin: string): boolean {
    return /^\d{4,6}$/.test(pin);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    this.pinError = '';

    // Validate new PIN format.
    if (!this.isValidPin(this.newPin)) {
      this.pinError = 'PIN must be 4–6 digits.';
      return;
    }
    if (this.newPin !== this.confirmPin) {
      this.pinError = 'PINs do not match.';
      return;
    }

    this.saving = true;

    // Verify current PIN.
    const currentOk = await this.pinService.verifyPin(this.userName, this.currentPin);
    if (!currentOk) {
      this.pinError = 'Current PIN is incorrect.';
      this.saving   = false;
      return;
    }

    // Enforce last-3-PIN history.
    const isReuse = await this.pinService.isRecentPin(this.userName, this.newPin);
    if (isReuse) {
      this.pinError = `You cannot reuse any of your last ${PinService.PIN_HISTORY_SIZE} PINs. Please choose a different PIN.`;
      this.saving   = false;
      return;
    }

    await this.pinService.setPin(this.userName, this.newPin);
    this.saving = false;

    this.pinSuccess = 'PIN changed successfully.';
    this.currentPin = '';
    this.newPin     = '';
    this.confirmPin = '';

    // Redirect after a brief moment so the user sees the success message.
    setTimeout(() => this.router.navigate(['/pathology']), 1500);
  }

  cancel(): void {
    // Forced flow: cannot cancel — PIN must be changed.
    if (this.isExpiredFlow) return;
    this.router.navigate(['/settings']);
  }

  // Expose constant to template.
  readonly historySize = PinService.PIN_HISTORY_SIZE;
  readonly expiryDays  = PinService.PIN_EXPIRY_DAYS;
}
