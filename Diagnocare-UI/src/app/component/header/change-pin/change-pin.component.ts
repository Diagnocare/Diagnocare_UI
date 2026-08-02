import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';

import { PinService } from 'src/app/services/pinServices/pin.service';
import { CommonService } from 'src/app/shared/common.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { PinChangeFormComponent } from 'src/app/shared/pin-change-form/pin-change-form.component';

/**
 * ChangePinComponent
 * ──────────────────
 * Dedicated page for changing a session PIN. Thin host around the shared
 * <app-pin-change-form>; this page only supplies the forced-expiry framing
 * (banner + no-cancel) and post-success navigation.
 *
 * Entry modes:
 *   1. Forced — navigated here automatically when the PIN has expired
 *      (reason=expired). Cancel is hidden; all other modules are blocked
 *      until a new PIN is set.
 *   2. Normal — user navigates here voluntarily (e.g. from a banner link).
 *
 * The change/validation/Forgot-PIN logic lives in PinChangeFormComponent, which
 * is shared with the Settings → Session PIN section for a consistent experience.
 */
@Component({
  selector: 'app-change-pin',
  templateUrl: './change-pin.component.html',
  styleUrls: ['../account-pages.shared.css', './change-pin.component.css'],
  standalone: true,
  imports: [CommonModule, PinChangeFormComponent],
})
export class ChangePinComponent implements OnInit {

  isExpiredFlow = false;
  userName      = '';
  pinSuccess    = '';

  readonly historySize = PinService.PIN_HISTORY_SIZE;
  readonly expiryDays  = PinService.PIN_EXPIRY_DAYS;

  constructor(
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

  /** Handlers bound in the template to <app-pin-change-form>'s @Output events. */

  /** Shared form reports a successful change → show a message and redirect. */
  onChanged(): void {
    this.pinSuccess = 'PIN changed successfully.';
    setTimeout(() => this.router.navigate(['/pathology']), 1500);
  }

  /** Shared form Cancel — ignored in the forced flow; otherwise back to Settings. */
  onCancelled(): void {
    if (this.isExpiredFlow) return;
    this.router.navigate(['/settings']);
  }
}
