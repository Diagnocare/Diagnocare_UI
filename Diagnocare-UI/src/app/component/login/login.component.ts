import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { LoginModel } from '../../models/auth/loginModel';
import { CommonModule } from '@angular/common';
import { OtpMfaDialogComponent } from '../../shared/otp-mfa/otp-mfa-dialog.component';
import { ActivatedRoute, NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonService } from '../../shared/common.service';
import { Role } from '../../constant/enums';
import { MODULE_ACCESS, DEFAULT_ACCESS } from 'src/app/constant/module-access';
import { Subscription, filter } from 'rxjs';
import { LoginService } from 'src/app/services/loginServices/login.service';
import { OtpChannel, VerifyAuthRequest } from 'src/app/models/auth/otp-request.dto';
import { OtpManagerService } from 'src/app/services/otpServices/otp-manager.service';
import { AppValidators } from 'src/app/shared/validators/app-validators';
import { TokenService } from 'src/app/core/interceptors/token.service';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  standalone: true,
  styleUrls: ['./login.component.css'],
  imports: [ReactiveFormsModule, CommonModule, RouterModule, OtpMfaDialogComponent, FormKeyboardDirective],
})
export class LoginComponent implements OnInit, OnDestroy {

  // ── Back/Forward nav guards ────────────────────────────────────────────────

  private onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      window.location.reload();
    }
  };

  private preventForwardNav = () => {
    history.pushState(null, '', window.location.href);
  };

  // Named handler so it can be removed in ngOnDestroy (anonymous listeners leak
  // and stack every time the login component is re-created).
  private closeMfaHandler = () => { this.showOtpDialog = false; };

  // ── Form state ─────────────────────────────────────────────────────────────

  loginForm!: FormGroup;
  mfaForm!: FormGroup;
  private routerSub!: Subscription;
  id :number = 0;
  disabled = false;

  // ── OTP / MFA dialog state ─────────────────────────────────────────────────

  showOtpDialog   = false;
  isSubmitting    = false;
  isVerifyingOtp  = false;
  showPassword    = false;
  isTotpMode      = false;   // true when loginType === 3 (Google Authenticator / TOTP)
  hasMfa          = false;   // true when user has MFA registered (regardless of preferred method)
  private passwordUpdated: boolean = true; // Assume true until we know otherwise
  private passwordChangedAt: string | null = null;

  selectedMethod: OtpChannel | null = null;
  showOtpInput    = false;

  maskedContactNumber = '';
  maskedEmail         = '';
  otpChannel: OtpChannel | '' = '';

  // ── Account lockout state ──────────────────────────────────────────────────

  isAccountLocked  = false;
  lockedUntil: Date | null = null;

  // ── Session terminated banner (shown when redirected with ?reason=session_terminated)
  sessionTerminatedBanner = false;

  // ── Session conflict dialog state ──────────────────────────────────────────

  showSessionConflictDialog = false;
  conflictLoginTime: Date | null = null;
  conflictDeviceInfo  = '';
  /** userId string (login name) captured at login time for the clear-session call */
  private pendingUserId   = '';
  /** raw password captured at login time so we can clear session then re-login */
  private pendingPassword = '';
  /** numeric user id returned by GetUserDetails */
  private conflictUserId  = 0;
  isClearingSession = false;
  /**
   * True from the moment the user clicks "Log in here" until the OTP dialog
   * opens (or an error occurs).  Keeps the conflict-dialog button permanently
   * disabled through the full clearSession → OTP-dispatch chain, preventing:
   *  • double-clicks on the button
   *  • the gap between getUserDetails() returning and generateOtp() completing
   *    (where neither isClearingSession nor isSubmitting is true) from
   *    re-enabling the button and triggering a second OTP send.
   */
  isForcingLogin = false;
  /**
   * Full response from the FIRST GetUserDetails call (at conflict detection).
   * Reused in proceedAfterClearSession() to skip a second HTTP round-trip.
   */
  private pendingUserDetails: any = null;

  // ── Cleanup flag ───────────────────────────────────────────────────────────
  /**
   * True once the on-load session cleanup (logout of any stale token) has
   * completed.  The submit button stays disabled until this is true so that
   * a user with autofilled credentials cannot submit the form before the
   * stale ActiveSessionId has been cleared from the DB, which would
   * otherwise cause a spurious session-conflict dialog.
   */
  initialCleanupDone = false;

  // ── Misc ───────────────────────────────────────────────────────────────────

  roleOptions = Object.values(Role).map(r => ({ id: r.id, label: r.label }));

  constructor(
    private fb:               FormBuilder,
    private _loginService:    LoginService,
    private _otpManager:      OtpManagerService,
    private _common:          CommonService,
    private toastr:           ToastrService,
    private _tokenService:    TokenService,
    private _router:          Router,
    private _route:           ActivatedRoute,
  ) {
    window.addEventListener('closeMfaDialog', this.closeMfaHandler);
    window.addEventListener('pageshow', this.onPageShow);
  }

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      userId:    ['', Validators.required],
      password:  ['', [Validators.required, Validators.minLength(6)]],
      code:      [''],
      otpDigits: this.fb.array(
        Array.from({ length: 6 }, () => this.fb.control('', [AppValidators.singleDigit()])),
      ),
    });

    this.mfaForm = this.fb.group({
      mfaDigits: this.fb.array(
        Array.from({ length: 6 }, () => this.fb.control('', [AppValidators.singleDigit()])),
      ),
    });

    this.loginForm.reset();

    // ── Step 1: fallback sibling-tab token request ────────────────────────────
    //
    // The primary sibling-tab handshake now runs in the auth guard (auth.guard.ts).
    // The guard races a BroadcastChannel request against a 300 ms timer; if the
    // sibling responds in time the guard returns true and the URL never changes —
    // the user stays on /pathology without ever seeing the login page.
    //
    // This block is a SECONDARY fallback for the edge case where:
    //   a) The user navigated directly to /login (no guard), or
    //   b) The guard's 300 ms race timed out but Tab 1 becomes available slightly
    //      later (slow machine / startup contention).
    //
    // autoLoginDone prevents runStartupCleanup() firing after a late response.
    let autoLoginDone = false;

    this._tokenService.requestTokenFromSiblingTab();
    const tokenSub = this._tokenService.tokenReceived$.subscribe(() => {
      tokenSub.unsubscribe();
      autoLoginDone = true;
      // Token now in sessionStorage.  resolveLandingRoute() prefers returnUrl
      // (set by the guard's redirect) so the user still lands on the right page.
      this._router.navigate([this.resolveLandingRoute()]);
    });
    // No sibling responded within 300 ms → proceed with normal login flow.
    setTimeout(() => {
      tokenSub.unsubscribe();
      if (!autoLoginDone) {
        this.runStartupCleanup();
      }
    }, 300);

    // Show banner when redirected here after a forced session logout
    this._route.queryParams.pipe(filter(p => !!p)).subscribe(params => {
      if (params['reason'] === 'session_terminated') {
        this.sessionTerminatedBanner = true;
      }
    });

    history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', this.preventForwardNav);

    this.routerSub = this._router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        if (
          event.urlAfterRedirects.includes('/login') &&
          (window.location.hash === '' ||
            window.location.hash === '#/login' ||
            window.location.hash === '#/' ||
            window.location.hash === '#')
        ) {
          this.loginForm.reset();
        }
      });
  }

  ngOnDestroy(): void {
    window.removeEventListener('closeMfaDialog', this.closeMfaHandler);
    window.removeEventListener('pageshow', this.onPageShow);
    window.removeEventListener('popstate', this.preventForwardNav);
    this.routerSub?.unsubscribe();
  }

  // ── Startup cleanup ────────────────────────────────────────────────────────

  /**
   * Called after the 300 ms sibling-tab window expires (no token inherited).
   * Clears any stale DB session so a fresh login never triggers a spurious
   * conflict dialog.  Three cases:
   *
   *  A) pendingCleanup flag (all tabs closed without logout) — cleanupToken
   *     is used to call the logout API.
   *  B) A sessionStorage token still exists (e.g. user navigated to /login
   *     manually while logged in) — call logout to clear DB.
   *  C) cleanupToken exists (browser was closed; same as A but detected via
   *     the existing fallback mechanism).
   *  D) Nothing — set initialCleanupDone immediately.
   *
   * The submit button stays disabled until initialCleanupDone = true so
   * autofill cannot race against the backend clear.
   */
  private runStartupCleanup(): void {
    const pendingCleanup = this._tokenService.hasPendingCleanup;
    this._tokenService.hasPendingCleanup = false; // consumed

    // If other tabs are still open the session is actively in use — do NOT
    // call logout().  The sibling tab didn't respond to request-token in time
    // (very rare race), but that doesn't mean the session is stale.
    // This also prevents the new-tab scenario from destroying the first tab's session.
    if (this._tokenService.hasOtherActiveTabs() && !this._tokenService.hasToken()) {
      this.initialCleanupDone = true;
      return;
    }

    const needsCleanup =
      pendingCleanup ||
      this._tokenService.hasToken() ||
      !!this._tokenService.getCleanupToken();

    if (needsCleanup) {
      this._loginService.logout().subscribe({
        next:     () => { this.initialCleanupDone = true; },
        error:    () => { this.initialCleanupDone = true; },  // fail-open
        complete: () => { this.initialCleanupDone = true; },
      });
    } else {
      this.initialCleanupDone = true;
    }
  }

  // ── Login flow ─────────────────────────────────────────────────────────────

  Login(): void {
    if (this.loginForm.invalid) return;

    const raw = this.loginForm.value as LoginModel;
    this.isSubmitting = true;

    this._loginService.getUserDetails(raw).subscribe({
      next: (response: any) => {
        // NOTE: isSubmitting is intentionally NOT reset here.
        // It stays true until openOtpDialog() — which covers the full
        // getUserDetails → generateOtp chain — preventing double-clicks.
        this.id = response.user_Id;

        // ── Account locked ─────────────────────────────────────────────────
        if (response?.accountLocked === true) {
          this.isSubmitting   = false;
          this.isAccountLocked = true;
          this.lockedUntil    = response.lockedUntil ? new Date(response.lockedUntil) : null;
          this.toastr.error(
            'Your account is locked due to multiple failed attempts. Please try again after 15 minutes.',
            'Access Denied',
            { timeOut: 6000 }
          );
          return;
        }

        // Clear lockout state on any other response (successful or bad-credentials)
        this.isAccountLocked = false;
        this.lockedUntil     = null;

        if (response?.success === false) {
          this.isSubmitting = false;
          this.toastr.error(response.message || 'Invalid credentials');
          return;
        }

        // ── Session conflict: another session is already active ────────────
        if (response?.sessionConflict === true) {
          this.isSubmitting       = false;
          this.pendingUserDetails = response;          // save for proceedAfterClearSession()
          this.isForcingLogin     = false;             // re-enable button if we got here mid-force
          this.conflictLoginTime  = response.loginTime ? new Date(response.loginTime) : null;
          this.conflictDeviceInfo = response.deviceInfo ?? 'Unknown device';
          this.conflictUserId     = response.userId;
          this.pendingUserId      = raw.userId;
          this.pendingPassword    = raw.password;
          this.showSessionConflictDialog = true;
          return;
        }
        this.passwordUpdated = response.password_updated ?? true;
        this.passwordChangedAt = response.PasswordChangedAt ?? response.passwordChangedAt ?? null;
        this.hasMfa = response.isMfaEnabled === true;
        // Mask contact details for display in OTP dialog
        this.maskedContactNumber = response?.contactPhone
          ? `(${this.maskContactNumber(String(response.contactPhone))})`
          : '';
        this.maskedEmail = response?.email
          ? `(${this.maskEmail(String(response.email))})`
          : '';

        // Use the user's preferred channel (loginType) to auto-select and send OTP
        const { method } = this.getPreferredMfaMethod(response?.loginType);

        if (response?.loginType === 3 && this.hasMfa) {
          // Authenticator App (TOTP) — no OTP to generate/send; open dialog in TOTP mode
          this.isTotpMode    = true;
          this.selectedMethod = null;
          this.showOtpInput   = true;
          this.openOtpDialog();
        } else if (response?.loginType !== 3 && method) {
          this.isTotpMode     = false;
          this.selectedMethod = method as OtpChannel;
          this.showOtpInput   = true;
          this._otpManager.generateOtp({
            id: this.id,
            userId: raw.userId,
            channel: method as OtpChannel,
          }).subscribe({
            next: (resp) => {
              if (resp?.success === false) {
                this.isSubmitting = false;
                this.toastr.error(resp.message || 'Failed to send OTP.');
              } else {
                this.openOtpDialog();
              }
            },
            error: () => {
              this.isSubmitting = false;
              this.toastr.error('Failed to send OTP.');
            },
          });
        } else {
          // No usable preferred channel — either nothing configured, or the preferred
          // method is the Authenticator App but MFA is no longer set up. Let the user
          // pick a channel (email / phone) instead of forcing an unusable TOTP prompt.
          this.isTotpMode     = false;
          this.selectedMethod = null;
          this.showOtpInput   = false;
          this.openOtpDialog();
        }
      },
      error: () => {
        this.isSubmitting = false;
        this.toastr.error('Invalid credentials');
      },
    });
  }

  // ── OTP dialog events ──────────────────────────────────────────────────────

  /**
   * Called by OtpMfaDialogComponent when the user submits their 6-digit code.
   * Always calls the unified Verify endpoint with the active AuthType.
   *   authType 1 = Mobile, 2 = Email, 3 = AuthenticationApp, 4 = Other
   *   id = 0 for TOTP (backend loads user by userId); numeric user-id for OTP flows.
   */
  onOtpVerify(event: { code: string; authType: number }): void {
    const userId = this.loginForm.get('userId')?.value as string;
    if (!userId || !event.code || event.code.length !== 6) {
      this.toastr.warning('Please enter all 6 digits of the code.');
      return;
    }

    this.isVerifyingOtp = true;

    this._loginService.verifyAuth({
      authType: event.authType,
      userId,
      id:   event.authType === 3 ? 0 : this.id,   // 0 for TOTP; numeric id for OTP
      code: event.code,
    }).subscribe({
      next: (resp) => {
        this.isVerifyingOtp = false;
        if (!resp?.success) {
          const msg = (resp as any)?.message || 'Invalid code. Please try again.';
          // Lockout detected from verification response — close dialog, show lockout banner
          if (msg.toLowerCase().includes('locked')) {
            this.isAccountLocked = true;
            this.lockedUntil     = null;   // exact time not returned by verify endpoint
            this.closeOtpDialog();
            this.toastr.error(msg, 'Access Denied', { timeOut: 6000 });
            return;
          }
          this.toastr.error(msg);
          return;
        }
        this.handleSuccessfulLogin(resp);
      },
      error: () => {
        this.isVerifyingOtp = false;
        this.toastr.error('Invalid code. Please try again.');
      },
    });
  }

  /**
   * Shared post-verify navigation.
   * Resolves the landing route from MODULE_ACCESS based on the JWT role claim
   * so each role arrives at the correct starting page.
   */
  private handleSuccessfulLogin(resp: any): void {
    console.log('handleSuccessfulLogin: resp =', resp);
    const expiryDaysLeft = this.getPasswordExpiryDaysLeft();
    console.log('handleSuccessfulLogin: expiryDaysLeft =', expiryDaysLeft);
    if (expiryDaysLeft !== null && expiryDaysLeft <= 0) {
      console.log('handleSuccessfulLogin: password expired, redirecting to forgot-password');
      this.closeOtpDialog();
      this.toastr.warning('Your password has expired. Please reset it to continue.');
      this._router.navigate(['forgot-password'], { queryParams: { expired: true } });
      return;
    }
console.log('handleSuccessfulLogin: password not expired, proceeding with login');
console.log('handleSuccessfulLogin: resp.token =', resp.token);
    if (resp.token) {
      // Token already stored in localStorage by verifyAuth()'s tap() — no action needed here.
      this.toastr.success('Login successful!');
      this.closeOtpDialog();
      if (this.passwordUpdated === false) {
        this._router.navigate(['change-password'], { queryParams: { forceChange: true } });
      } else {
        this.storePasswordExpiryWarning();
        this._router.navigate([this.resolveLandingRoute()]);
      }
    } else {
      this._loginService.refreshToken().subscribe({
        next: (tokenResp) => {
          if (tokenResp?.success) {
            // Token already stored in localStorage by refreshToken()'s tap().
            this.toastr.success('Login successful!');
            this.closeOtpDialog();
            if (this.passwordUpdated === false) {
              this._router.navigate(['change-password'], { queryParams: { forceChange: true } });
            } else {
              this.storePasswordExpiryWarning();
              this._router.navigate([this.resolveLandingRoute()]);
            }
          } else {
            this.toastr.error('Failed to retrieve authentication token.');
          }
        },
        error: () => { this.toastr.error('Failed to retrieve authentication token.'); },
      });
    }
  }

  /**
   * Returns the post-login destination.
   * Prefers the `returnUrl` query param set by the auth guard (so Tab 2 opening
   * /pathology lands back on /pathology, and a manual login after a redirect does
   * the same).  Falls back to the role-appropriate landing route.
   */
  private resolveLandingRoute(): string {
    const returnUrl = this._route.snapshot.queryParams['returnUrl'];
    if (returnUrl) return returnUrl;
    const role = this._tokenService.getUserRole();
    return role !== null
      ? (MODULE_ACCESS[role]?.landingRoute ?? DEFAULT_ACCESS.landingRoute)
      : DEFAULT_ACCESS.landingRoute;
  }

  /** Re-generates and re-sends the OTP via the same channel. */
  onOtpResend(): void {
    const userId = this.loginForm.get('userId')?.value as string;
    if (!userId || !this.selectedMethod) return;

    this._otpManager.resendOtp(this.id, userId).subscribe({
      next:  () => { this.toastr.info('OTP resent successfully.'); },
      error: () => { this.toastr.error('Failed to resend OTP. Please try again.'); },
    });
  }

  onChannelChange(_channel: string): void { /* handled inside the dialog */ }

  /**
   * Called when the OTP dialog emits (lockoutDetected) — i.e. the dialog
   * detected a lockout from a backend resend/send response on its own.
   * Close the dialog and surface the lockout banner on the login page.
   */
  onDialogLockoutDetected(): void {
    this.isAccountLocked = true;
    this.lockedUntil     = null;   // dialog detected it; exact time unavailable here
    this.closeOtpDialog();
    this.toastr.error(
      'Your account is locked due to multiple failed attempts. Please try again after 15 minutes.',
      'Access Denied',
      { timeOut: 6000 }
    );
  }

  // ── Session conflict dialog handlers ───────────────────────────────────────

  /**
   * User chose "Log in here" — clear the other session, then dispatch OTP.
   *
   * Flow:
   *  1. clearSession() — wipes ActiveSessionId on the backend.
   *  2. getUserDetails() — re-fetches FULL user details (loginType, contactPhone,
   *     email, etc.).  The conflict response stored in pendingUserDetails only
   *     has { sessionConflict, loginTime, deviceInfo, userId } — not enough to
   *     dispatch the OTP correctly.  The second call is safe because ActiveSessionId
   *     was just cleared so no conflict is returned.
   *  3. proceedAfterClearSession() — dispatches OTP / TOTP with fresh details.
   *
   *  `isForcingLogin` stays true through all steps so the button stays disabled.
   */
  forceLogin(): void {
    if (this.isForcingLogin) return;   // hard guard against double-click / re-entry
    this.isForcingLogin    = true;
    this.isClearingSession = true;

    this._loginService.clearSession(this.pendingUserId, this.pendingPassword).subscribe({
      next: () => {
        this.isClearingSession = false;

        // The conflict response only contains { sessionConflict, loginTime, deviceInfo, userId }.
        // It does NOT include the full user details (loginType, contactPhone, email, etc.) that
        // proceedAfterClearSession() needs to dispatch the correct OTP method.
        // Now that the old session is cleared, re-fetch full user details — the second call
        // will not return a conflict because ActiveSessionId was just wiped.
        this._loginService
          .getUserDetails({ userId: this.pendingUserId, password: this.pendingPassword })
          .subscribe({
            next: (freshDetails: any) => {
              this.pendingUserDetails = freshDetails;
              this.proceedAfterClearSession();
            },
            error: () => {
              this.isForcingLogin = false;
              this.toastr.error('Failed to retrieve account details. Please try again.');
            },
          });
      },
      error: () => {
        this.isClearingSession = false;
        this.isForcingLogin    = false;
        this.toastr.error('Failed to end the other session. Please try again.');
      },
    });
  }

  /**
   * Dispatches OTP using the user details captured before the conflict dialog
   * was shown.  Called only from forceLogin() — never directly.
   */
  private proceedAfterClearSession(): void {
    const response = this.pendingUserDetails;
    if (!response) {
      // Fallback: details lost somehow — fall back to a fresh Login() call
      this.isForcingLogin = false;
      this.loginForm.patchValue({ userId: this.pendingUserId, password: this.pendingPassword });
      this.Login();
      return;
    }

    this.id                   = response.user_Id;
    this.passwordUpdated      = response.password_updated ?? true;
    this.passwordChangedAt    = response.PasswordChangedAt ?? response.passwordChangedAt ?? null;
    this.hasMfa               = response.isMfaEnabled === true;
    this.maskedContactNumber  = response?.contactPhone
      ? `(${this.maskContactNumber(String(response.contactPhone))})`
      : '';
    this.maskedEmail          = response?.email
      ? `(${this.maskEmail(String(response.email))})`
      : '';

    const { method } = this.getPreferredMfaMethod(response?.loginType);

    if (response?.loginType === 3 && this.hasMfa) {
      // TOTP (Google Authenticator) — no OTP to send, open dialog immediately
      this.isTotpMode     = true;
      this.selectedMethod = null;
      this.showOtpInput   = true;
      this.openOtpDialog();
    } else if (response?.loginType !== 3 && method) {
      this.isTotpMode     = false;
      this.selectedMethod = method as OtpChannel;
      this.showOtpInput   = true;
      this._otpManager.generateOtp({
        id:      this.id,
        userId:  this.pendingUserId,
        channel: method as OtpChannel,
      }).subscribe({
        next: (resp) => {
          if (resp?.success === false) {
            this.isForcingLogin = false;   // allow retry
            this.toastr.error(resp.message || 'Failed to send OTP.');
          } else {
            this.openOtpDialog();
          }
        },
        error: () => {
          this.isForcingLogin = false;     // allow retry
          this.toastr.error('Failed to send OTP. Please try again.');
        },
      });
    } else {
      // No usable preferred method — nothing configured, or the preferred method is the
      // Authenticator App but MFA is no longer set up. Let the user pick in the dialog.
      this.isTotpMode     = false;
      this.selectedMethod = null;
      this.showOtpInput   = false;
      this.openOtpDialog();
    }
  }

  /**
   * User chose "Stay on other session" — close the dialog without logging in.
   */
  keepExistingSession(): void {
    this.isForcingLogin = false;
    this.showSessionConflictDialog = false;
    this.toastr.info('Your existing session is still active. You can continue there.');
  }

  // ── Dialog helpers ─────────────────────────────────────────────────────────

  private openOtpDialog(): void {
    // Never open the dialog while the account is locked — the lockout banner
    // on the login page already shows the countdown.
    if (this.isAccountLocked) return;
    this.isSubmitting              = false;   // clear loading state — dialog is now taking over
    this.isForcingLogin            = false;
    this.showSessionConflictDialog = false;
    this.showOtpDialog             = true;
  }
  private closeOtpDialog(): void { this.showOtpDialog = false; }

  redictedToForgotPassword(): void { this._router.navigate(['/forgot-password']); }

  // ── Template helpers ───────────────────────────────────────────────────────

  get errors(): string[] {
    const msgs = this._common.getFormValidationErrors(this.loginForm);
    this.disabled = msgs.length > 0;
    return msgs;
  }

  // ── Private utilities ──────────────────────────────────────────────────────

  /** Maps the user's stored loginType to a channel and method name. */
  private getPreferredMfaMethod(loginType: number): { method: string; channel: string } {
    switch (loginType) {
      case 1: return { method: 'phone',     channel: 'SM' };
      case 2: return { method: 'email',     channel: 'EM' };
      case 3: return { method: 'microsoft', channel: 'MA' };
      case 4: return { method: 'other',     channel: 'OT' };
      default: return { method: '',         channel: '' };
    }
  }

  /** Returns days until password expiry (negative = already expired). Null if no date available. */
  private getPasswordExpiryDaysLeft(): number | null {
    if (!this.passwordChangedAt) return null;
    const expiresAt = new Date(new Date(this.passwordChangedAt).getTime() + 90 * 24 * 60 * 60 * 1000);
    return Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  /** Stores a warning in sessionStorage when password expires within 15 days. */
  private storePasswordExpiryWarning(): void {
    sessionStorage.removeItem('passwordExpiryDaysLeft');
    const daysLeft = this.getPasswordExpiryDaysLeft();
    if (daysLeft !== null && daysLeft <= 15) {
      sessionStorage.setItem('passwordExpiryDaysLeft', String(daysLeft));
    }
  }

  private maskContactNumber(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const masked = new Set([1, 4, 5, 6, 8]);
    return digits.split('').map((c, i) => masked.has(i) ? '*' : c).join('');
  }

  private maskEmail(value: string): string {
    const trimmed = value.trim();
    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0) return '';
    const local  = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);
    const last   = local.length - 1;
    const sec    = local.length - 2;
    const visible = new Set([0, 1, 4, 5, sec, last]);
    return `${local.split('').map((c, i) => visible.has(i) ? c : '*').join('')}@${domain}`;
  }
}
