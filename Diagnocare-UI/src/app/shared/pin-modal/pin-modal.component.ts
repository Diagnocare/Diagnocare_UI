import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { PinModalService, PinModalMode } from './pin-modal.service';
import { PinService }      from 'src/app/services/pinServices/pin.service';
import { TokenService }    from 'src/app/core/interceptors/token.service';

const MAX_ATTEMPTS = 3;

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

  private modal: any;
  private sub!: Subscription;

  constructor(
    private pinModalService: PinModalService,
    private pinService:      PinService,
    private tokenService:    TokenService,
    private router:          Router,
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
  }

  private closeModal(): void {
    this.modal?.hide();
    document.body.classList.remove('modal-open');
    document.body.classList.remove('pin-modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
  }

  // ── PIN entry actions ──────────────────────────────────────────────────────

  async onSubmit(): Promise<void> {
    if (!this.pin || this.isVerifying || this.isLockedOut) return;

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
      this.closeModal();
      this.pinModalService.resolve(true);
      return;
    }

    this.attemptsLeft--;
    this.pin = '';

    if (this.attemptsLeft <= 0) {
      this.isLockedOut = true;
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

  // ── Setup-required actions ─────────────────────────────────────────────────

  onGoToSettings(): void {
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
  }

  get attemptsDisplay(): string {
    if (this.attemptsLeft === MAX_ATTEMPTS) return '';
    return `${this.attemptsLeft} attempt${this.attemptsLeft !== 1 ? 's' : ''} remaining`;
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
