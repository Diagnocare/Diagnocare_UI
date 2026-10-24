import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/** Result state of a single calculation. */
export interface PaymentCalcResult {
  state:      'idle' | 'balance' | 'return' | 'complete';
  difference: number;
}

/**
 * PaymentCalculatorComponent
 * ──────────────────────────
 * A self-contained cash-change calculator modal.
 *
 * Renders a small trigger link/button; clicking it opens an
 * overlay modal with a "Cash Received" input and instant result.
 *
 * Usage (drop anywhere inside a payment form):
 *   <app-payment-calculator [requiredAmount]="netAmount"></app-payment-calculator>
 *
 * The modal manages its own open/close state — no parent wiring needed.
 * Bind `[resetTrigger]` to reset the cash input whenever the parent
 * panel/modal opens (e.g. `[resetTrigger]="visible"`).
 */
@Component({
  selector: 'app-payment-calculator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-calculator.component.html',
  styleUrls: ['./payment-calculator.component.css'],
})
export class PaymentCalculatorComponent implements OnChanges {

  // ── Inputs ──────────────────────────────────────────────────────────────────

  /** Total amount due from the patient. */
  @Input() requiredAmount: number = 0;

  /**
   * Flip this boolean each time the parent modal/panel opens to reset
   * the cash-received input (e.g. bind to `visible` or `showPartialPaymentPanel`).
   */
  @Input() resetTrigger: boolean = false;

  // ── Internal state ───────────────────────────────────────────────────────────

  isOpen        = false;
  cashReceived: number | null = null;
  result: PaymentCalcResult  = { state: 'idle', difference: 0 };

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resetTrigger']) {
      this.reset();
    }
    if (changes['requiredAmount'] && this.cashReceived !== null) {
      this.calculate();
    }
  }

  // ── Modal controls ───────────────────────────────────────────────────────────

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.reset();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('pcm-overlay')) {
      this.close();
    }
  }

  // ── Calculator logic ─────────────────────────────────────────────────────────

  onCashInput(): void {
    this.calculate();
  }

  reset(): void {
    this.cashReceived = null;
    this.result       = { state: 'idle', difference: 0 };
  }

  private calculate(): void {
    const cash     = this.cashReceived ?? 0;
    const required = this.requiredAmount ?? 0;

    if (cash <= 0 || required <= 0) {
      this.result = { state: 'idle', difference: 0 };
      return;
    }

    const diff = +(cash - required).toFixed(2);

    if (diff < 0) {
      this.result = { state: 'balance',  difference: Math.abs(diff) };
    } else if (diff > 0) {
      this.result = { state: 'return',   difference: diff };
    } else {
      this.result = { state: 'complete', difference: 0 };
    }
  }
}
