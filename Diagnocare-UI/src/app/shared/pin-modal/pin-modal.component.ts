import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { PinModalService, PinModalMode } from './pin-modal.service';
import { PinService }      from 'src/app/services/pinServices/pin.service';
import { TokenService }    from 'src/app/core/interceptors/token.service';

const MAX_ATTEMPTS     = 3;
const MODAL_TIMEOUT_S  = 300; // 5 minutes

/**
 * PinModalComponent
 * ─────────────────
 * Global overlay modal for session-expiry re-authentication.
 *
 * Two modes driven by PinModalService:
 *
 *  enter-pin      — user has a PIN set; they must enter it to refresh the token.
 *                   Correct PIN → resolve(true)   ← interceptor refreshes + retries
 *                   Wrong × 3 or cancel → resolve(false) ← interceptor logs out
 *
 *  setup-required — no PIN is configured; inform the user and offer two options.
 *                   "Go to Settings" → resolve(true)  ← interceptor refreshes + navigates
 *                   "Log Out"        → resolve(false) ← interceptor logs out
 *
 * Timer:
 *  The modal has a 5-minute countdown. If the user does not act in time:
 *   • The countdown reaches zero → isTimedOut = true → auto-logout after 2 s.
 *  A correct PIN stops the timer and refreshes the session immediately.
 *
 * Must be included in AppComponent template so it lives for the entire session.
 */
@Component({
  selector: 'app-pin-modal',
  templateUrl: './pin-modal.component.html',
  styleUrls: ['./pin-modal.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class PinModalComponent implements OnInit, OnDestroy {

  mode: PinModalMode = 'enter-pin';

  // ── PIN entry state ────────────────────────────────────────────────────────
  pin            = '';
  errorMessage   = '';
  attemptsLeft   = MAX_ATTEMPTS;
  isVerifying    = false;
  isLockedOut    = false;
  showPin        = false;

  // ── Countdown timer ────────────────────────────────────────────────────────
  timeRemaining  = MODAL_TIMEOUT_S;
  isTimedOut     = false;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  /** Absolute wall-clock time (ms) at which the modal times out. The countdown
   *  is derived from this, NOT from decrementing a counter — background tabs
   *  throttle/suspend setInterval, which would otherwise freeze the timer and
   *  let the 5-minute window overrun. */
  private deadline = 0;
  /** Recomputes the timer the instant the tab regains focus. */
  private visibilityHandler: (() => void) | null = null;

  private modal: any;
  private sub!: Subscription;

  constructor(
    private pinModalService: PinModalService,
    private pinService:      PinService,
    private tokenService:    TokenService,
    private router:          Router,
    private ngZone:          NgZone,
    private cdr:             ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.sub = this.pinModalService.open$.subscribe((mode) => {
      this.mode = mode;
      this.resetState();
      this.openModal();
    });
  }

  // ── Modal control ──────────────────────────────────────────────────────────

  private openModal(): void {
    const el = document.getElementById('pinAuthModal');
    if (!el) return;
    this.modal = new (window as any).bootstrap.Modal(el, { backdrop: 'static', keyboard: false });
    this.modal.show();
    // Suppress the loading spinner while the PIN modal is active.
    // Class is removed in closeModal() regardless of resolution path.
    document.body.classList.add('pin-modal-open');
    this.startCountdown();
  }

  private closeModal(): void {
    this.stopCountdown();
    this.modal?.hide();
    document.body.classList.remove('modal-open');
    document.body.classList.remove('pin-modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  }

  // ── Countdown timer ────────────────────────────────────────────────────────

  private startCountdown(): void {
    this.stopCountdown();
    // Anchor the timeout to an absolute wall-clock deadline. Elapsed time is
    // then measured against Date.now(), so the countdown stays accurate even
    // when the tab is backgrounded and setInterval is throttled or suspended.
    this.deadline      = Date.now() + MODAL_TIMEOUT_S * 1000;
    this.timeRemaining = MODAL_TIMEOUT_S;

    // Run the interval inside Angular's zone so each tick triggers change
    // detection and the countdown renders in the DOM.  Bootstrap modal events
    // (show/hide) can fire outside the zone, which would otherwise freeze the
    // displayed timer at its initial value.
    this.ngZone.run(() => {
      this.countdownInterval = setInterval(() => this.tickCountdown(), 1000);
    });

    // Background tabs throttle/suspend the interval, so the deadline may have
    // already passed by the time the user returns. Recompute the instant the
    // page becomes visible again to catch up (and time out immediately if due).
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') this.ngZone.run(() => this.tickCountdown());
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /** Derives the remaining time from the wall-clock deadline and handles expiry. */
  private tickCountdown(): void {
    if (this.isTimedOut) return;
    this.timeRemaining = Math.max(0, Math.round((this.deadline - Date.now()) / 1000));
    if (this.timeRemaining <= 0) {
      this.stopCountdown();
      this.isTimedOut = true;
      // Give the user 2 s to read the "timed out" message, then log out.
      setTimeout(() => this.resolveWith(false), 2000);
    }
    this.cdr.detectChanges();   // guarantee re-render on every tick
  }

  private stopCountdown(): void {
    if (this.countdownInterval !== null) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  /** Formatted MM:SS label shown in the timer pill. */
  get timeDisplay(): string {
    const m = Math.floor(this.timeRemaining / 60);
    const s = this.timeRemaining % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  /** True when less than 60 seconds remain — triggers red urgent styling. */
  get timerUrgent(): boolean {
    return this.timeRemaining <= 60 && !this.isTimedOut;
  }

  // ── PIN entry actions ──────────────────────────────────────────────────────

  async onSubmit(): Promise<void> {
    if (!this.pin || this.isVerifying || this.isLockedOut || this.isTimedOut) return;

    const userId = this.tokenService.getUserId();
    if (!userId) {
      this.resolveWith(false);
      return;
    }

    this.isVerifying  = true;
    this.errorMessage = '';

    const correct = await this.pinService.verifyPin(userId, this.pin);
    this.isVerifying = false;

    if (correct) {
      // PIN verified — stop the countdown and refresh the session.
      this.stopCountdown();
      this.closeModal();
      this.pinModalService.resolve(true);
      return;
    }

    this.attemptsLeft--;
    this.pin = '';

    if (this.attemptsLeft <= 0) {
      this.isLockedOut = true;
      this.stopCountdown();
      this.errorMessage = 'Too many incorrect attempts. You will be logged out.';
      setTimeout(() => this.resolveWith(false), 2000);
    } else {
      this.errorMessage = `Incorrect PIN. ${this.attemptsLeft} attempt${this.attemptsLeft !== 1 ? 's' : ''} remaining.`;
    }
  }

  onCancel(): void {
    this.resolveWith(false);
  }

  toggleShowPin(): void {
    this.showPin = !this.showPin;
  }

  /** Strips any non-digit characters so the PIN field accepts numbers only. */
  onlyDigits(value: string): string {
    return (value || '').replace(/\D/g, '');
  }

  // ── Setup-required actions ─────────────────────────────────────────────────

  onGoToSettings(): void {
    this.stopCountdown();
    this.closeModal();
    this.pinModalService.resolve(true);   // interceptor will refresh token then navigate
  }

  onLogOut(): void {
    this.resolveWith(false);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private resolveWith(success: boolean): void {
    this.closeModal();
    this.pinModalService.resolve(success);
  }

  private resetState(): void {
    this.pin           = '';
    this.errorMessage  = '';
    this.attemptsLeft  = MAX_ATTEMPTS;
    this.isVerifying   = false;
    this.isLockedOut   = false;
    this.showPin       = false;
    this.timeRemaining = MODAL_TIMEOUT_S;
    this.isTimedOut    = false;
  }

  get attemptsDisplay(): string {
    if (this.attemptsLeft === MAX_ATTEMPTS) return '';
    return `${this.attemptsLeft} attempt${this.attemptsLeft !== 1 ? 's' : ''} remaining`;
  }

  ngOnDestroy(): void {
    this.stopCountdown();
    this.sub?.unsubscribe();
  }
}
