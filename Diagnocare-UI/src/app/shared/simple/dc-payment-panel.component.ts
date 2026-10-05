import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/** What the operator decided. Emitted on every change, and on confirm. */
export interface DcPaymentDecision {
  /** 'Full' | 'Partial' | 'No Payment' — matches the app's paymentType enum values. */
  type: string;
  /** Amount taken now. */
  amountPaid: number;
  /** Net minus paid. */
  amountPending: number;
  /** 'Cash' | 'Card' | 'UPI' | 'Cheque' | 'TPA' — matches the paymentMode enum. */
  mode: string;
  /** Cash the patient handed over, when known. Null unless paying by cash. */
  cashGiven: number | null;
  /** Change to hand back. 0 when not applicable. */
  changeDue: number;
  /** True when everything needed to save is present. */
  complete: boolean;
}

/**
 * DcPaymentPanelComponent — one screen, one question at a time, no modals.
 *
 * What it replaces
 * ────────────────
 * The payment step today has three problems that compound:
 *
 *   1. Discount (%) and Net Amount each rewrite the other, so two editable
 *      boxes fight over one number and nobody can predict which value survives.
 *      Here the amount is the only input; a discount, if any, is applied by the
 *      caller before `netAmount` arrives.
 *   2. Amount Paid — the field the operator most wants to fill — is readonly
 *      with a padlock, and is actually edited in a second dialog containing a
 *      second copy of the same field.
 *   3. That dialog sits on a full-screen overlay, and the cash calculator sits
 *      on top of it: three layers deep to answer "how much did he give you".
 *
 * This asks how much, then how, then (for cash) what he handed over, each in
 * place, with the change worked out beside the amount it refers to.
 *
 * The component holds no business rules beyond arithmetic and the maximum —
 * the caller still validates and saves, exactly as it does now.
 *
 * Usage:
 *   <dc-payment-panel [netAmount]="net"
 *                     [modes]="paymentModeOptions"
 *                     [busy]="isSaving"
 *                     (decisionChange)="onPaymentDecision($event)"
 *                     (confirmed)="submit()">
 *   </dc-payment-panel>
 */
@Component({
  selector: 'dc-payment-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dc-pay">

      <!-- ── 1 · How much ────────────────────────────────────────────────── -->
      <h3 class="dc-pay__q">How much is the patient paying today?</h3>
      <p class="dc-pay__ask">
        The bill is <strong>₹{{ netAmount }}</strong>. Whatever is not paid now is
        recorded as due at report pickup.
      </p>

      <div class="dc-pay__choices">
        <button type="button" class="dc-pay__choice"
                [class.dc-pay__choice--on]="choice === 'all'"
                (click)="pick('all')">
          <span class="dc-pay__amt">₹{{ netAmount }}</span>
          <span class="dc-pay__lab">All of it</span>
          <span class="dc-pay__sub">Nothing left to collect</span>
        </button>

        <button type="button" class="dc-pay__choice"
                [class.dc-pay__choice--on]="choice === 'part'"
                (click)="pick('part')">
          <span class="dc-pay__amt">Part</span>
          <span class="dc-pay__lab">Some of it</span>
          <span class="dc-pay__sub">Rest due at pickup</span>
        </button>

        <button type="button" class="dc-pay__choice" *ngIf="allowNoPayment"
                [class.dc-pay__choice--on]="choice === 'none'"
                (click)="pick('none')">
          <span class="dc-pay__amt">₹0</span>
          <span class="dc-pay__lab">Nothing today</span>
          <span class="dc-pay__sub">Full ₹{{ netAmount }} due at pickup</span>
        </button>
      </div>

      <!-- ── 2 · How much exactly (part only) ────────────────────────────── -->
      <ng-container *ngIf="choice === 'part'">
        <h3 class="dc-pay__q dc-pay__q--later">How much is he handing over?</h3>
        <p class="dc-pay__ask">Use the buttons or type it. It will not let you go over ₹{{ netAmount }}.</p>

        <div class="dc-pay__stepper">
          <button type="button" [disabled]="paidNow <= 0" aria-label="Decrease by 100" (click)="nudgePaid(-100)">
            <i class="fa fa-minus" aria-hidden="true"></i>
          </button>
          <span class="dc-pay__box">
            <span>₹</span>
            <input inputmode="decimal" aria-label="Amount paid now"
                   [ngModel]="paidNow" [ngModelOptions]="{ standalone: true }"
                   (ngModelChange)="onPaidTyped($event)" (blur)="settlePaid()">
          </span>
          <button type="button" [disabled]="paidNow >= netAmount" aria-label="Increase by 100" (click)="nudgePaid(100)">
            <i class="fa fa-plus" aria-hidden="true"></i>
          </button>
        </div>

        <p class="dc-pay__live" [class.dc-pay__live--ok]="pending === 0">
          <i class="fa" [ngClass]="pending === 0 ? 'fa-check-circle' : 'fa-clock-o'" aria-hidden="true"></i>
          <span *ngIf="pending > 0"><strong>₹{{ pending }}</strong> still due at report pickup.</span>
          <span *ngIf="pending === 0">That covers the whole bill — nothing left to collect.</span>
        </p>
      </ng-container>

      <!-- ── 3 · How ─────────────────────────────────────────────────────── -->
      <ng-container *ngIf="choice && choice !== 'none'">
        <h3 class="dc-pay__q dc-pay__q--later">How is he paying?</h3>
        <div class="dc-pay__methods">
          <button type="button" class="dc-pay__method" *ngFor="let m of modes"
                  [class.dc-pay__method--on]="mode === m"
                  (click)="pickMode(m)">
            <span class="dc-pay__mark" aria-hidden="true"><i class="fa fa-check"></i></span>
            <span>{{ m }}</span>
          </button>
        </div>
      </ng-container>

      <!-- ── 4 · Cash given, in place — no calculator to open ────────────── -->
      <ng-container *ngIf="mode === cashMode && choice && choice !== 'none'">
        <h3 class="dc-pay__q dc-pay__q--later">Cash given by the patient</h3>
        <p class="dc-pay__ask">Optional — fill it in and the change works itself out.</p>

        <div class="dc-pay__stepper">
          <button type="button" aria-label="Decrease by 100" (click)="nudgeCash(-100)">
            <i class="fa fa-minus" aria-hidden="true"></i>
          </button>
          <span class="dc-pay__box">
            <span>₹</span>
            <input inputmode="decimal" placeholder="0" aria-label="Cash received"
                   [ngModel]="cashGiven" [ngModelOptions]="{ standalone: true }"
                   (ngModelChange)="onCashTyped($event)">
          </span>
          <button type="button" aria-label="Increase by 100" (click)="nudgeCash(100)">
            <i class="fa fa-plus" aria-hidden="true"></i>
          </button>
        </div>

        <p class="dc-pay__live"
           [class.dc-pay__live--info]="cashGiven === null"
           [class.dc-pay__live--ok]="cashGiven !== null && cashGiven >= amountPaid">
          <i class="fa fa-info-circle" *ngIf="cashGiven === null" aria-hidden="true"></i>
          <i class="fa fa-exclamation-triangle" *ngIf="cashGiven !== null && cashGiven < amountPaid" aria-hidden="true"></i>
          <i class="fa fa-money" *ngIf="cashGiven !== null && cashGiven > amountPaid" aria-hidden="true"></i>
          <i class="fa fa-check-circle" *ngIf="cashGiven !== null && cashGiven === amountPaid" aria-hidden="true"></i>

          <span *ngIf="cashGiven === null">Enter what he handed you and the change appears here.</span>
          <span *ngIf="cashGiven !== null && cashGiven < amountPaid">
            Short by <strong>₹{{ amountPaid - cashGiven }}</strong> — collect the rest.
          </span>
          <span *ngIf="cashGiven !== null && cashGiven > amountPaid">
            Give <strong>₹{{ cashGiven - amountPaid }}</strong> back as change.
          </span>
          <span *ngIf="cashGiven !== null && cashGiven === amountPaid">Exact amount — no change needed.</span>
        </p>
      </ng-container>

      <!-- ── Save bar — always says where things stand ───────────────────── -->
      <div class="dc-pay__bar">
        <div class="dc-pay__state">
          <p class="dc-pay__state-line">
            <ng-container *ngIf="!choice">Choose how much he is paying</ng-container>
            <ng-container *ngIf="choice">₹{{ amountPaid }} now · ₹{{ pending }} due at pickup</ng-container>
          </p>
          <p class="dc-pay__state-sub">
            <ng-container *ngIf="!choice">Nothing is saved until you press the button.</ng-container>
            <ng-container *ngIf="choice && !complete">Still needed: how he is paying.</ng-container>
            <ng-container *ngIf="choice === 'none' && complete">Nothing collected today.</ng-container>
            <ng-container *ngIf="choice && choice !== 'none' && complete">Paying by {{ mode }}.</ng-container>
          </p>
        </div>

        <button type="button" class="dc-btn dc-btn--save dc-pay__save"
                [disabled]="!complete || busy" (click)="confirmed.emit()">
          <i class="fa" [ngClass]="busy ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true"></i>
          <span>{{ busy ? busyLabel : confirmLabel }}</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* ──────────────────────────────────────────────────────────────────────────
       Styling reads the app's own theme tokens (styles.css) and the em type
       scale the rest of the app uses — NOT a separate rem scale. The panel is
       dropped inside a .step-body (Add New Test) and inside .pm-form (payment
       modal), so its text has to sit on the same scale as the .form-label /
       .form-control / .step-header type around it, and its selected states
       have to use the brand blue, not a second blue.

       Reference sizes it is matched to:
         .step-header h3   1.15em / 700      step title above this panel
         .step-header p    0.8em             step subtitle
         .form-label       0.875em / 600
         .form-control     0.875em
         .amount-value     1.4em / 800
         .field-error      0.75em
       The save button is the canonical .dc-btn--save, styled globally, so it
       matches every other primary action in the app and in every theme.
       ────────────────────────────────────────────────────────────────────────── */

    /* Transparent, so the panel sits on whatever card contains it rather than
       painting its own slab of white over the page. No padding of its own:
       both callers already wrap it in a padded container (.step-body on the
       Add New Test card, .pm-form in the payment modal), so padding here
       would inset it further than the fields on the step before it. */
    :host {
      display: block;
      background: transparent;
      color: var(--text-primary, #2c3e50);
      padding: 0;
    }

    /* ── Question headings ──────────────────────────────────────────────────
       One step below .step-header h3 (1.15em), so the step title stays the
       largest thing on the card. */
    .dc-pay__q {
      margin: 0 0 0.3em;
      font-size: 0.95em;
      font-weight: 700;
      color: var(--text-primary, #1a2e4a);
    }
    .dc-pay__q--later { margin-top: 1.6em; }
    .dc-pay__ask {
      margin: 0 0 1em;
      font-size: 0.8em;
      color: var(--text-secondary, #7a8fa8);
      max-width: 58ch;
      line-height: 1.5;
    }
    .dc-pay__ask strong { color: var(--text-primary, #1a2e4a); font-weight: 700; }

    /* ── How much: the three choice cards ───────────────────────────────────
       Geometry and the selected gradient follow .amount-card / .radio-pill in
       the Add New Test card. */
    .dc-pay__choices {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11em, 1fr));
      gap: 0.75em;
    }
    .dc-pay__choice {
      display: flex; flex-direction: column; align-items: flex-start; gap: 0.2em;
      padding: 0.9em 1.1em; min-height: 5em; text-align: left;
      font-family: inherit;
      background: var(--bg-white, #fff);
      color: var(--text-primary, #2c3e50);
      border: 2px solid var(--border-color, #d1d9e6);
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.18s;
    }
    .dc-pay__choice:hover {
      border-color: #667eea;
      background: #eef2ff;
      color: #1E5BA8;
    }
    .dc-pay__choice:focus-visible {
      outline: none;
      box-shadow: 0 0 0 0.1875em rgba(102, 126, 234, 0.2);
    }
    .dc-pay__choice--on,
    .dc-pay__choice--on:hover {
      background: linear-gradient(135deg, #1E5BA8, #667eea);
      border-color: #1E5BA8;
      color: #fff;
      box-shadow: 0 2px 8px rgba(30, 91, 168, 0.25);
    }
    .dc-pay__amt { font-size: 1.4em; font-weight: 800; line-height: 1.1; }
    .dc-pay__lab { font-size: 0.875em; font-weight: 600; }
    .dc-pay__sub { font-size: 0.75em; color: var(--text-secondary, #7a8fa8); }
    .dc-pay__choice--on .dc-pay__sub { color: rgba(255, 255, 255, 0.85); }

    /* ── Amount stepper ────────────────────────────────────────────────────
       Sized off .form-control (0.875em text, 0.75em/0.9375em padding) so the
       box lines up with every other input in the form. */
    .dc-pay__stepper { display: flex; gap: 0.4em; max-width: 24em; }
    .dc-pay__stepper > button {
      flex: 0 0 2.6em; width: 2.6em; min-height: 2.6em;
      font-family: inherit; font-size: 0.875em;
      background: var(--bg-light, #f7f9fc);
      color: var(--text-primary, #5a6a7e);
      border: 2px solid var(--border-color, #d1d9e6);
      border-radius: var(--radius-md, 0.5em);
      cursor: pointer;
      transition: all 0.18s;
    }
    .dc-pay__stepper > button:hover:not(:disabled) {
      background: #eef2ff; border-color: #667eea; color: #1E5BA8;
    }
    .dc-pay__stepper > button:disabled { opacity: 0.45; cursor: not-allowed; }
    .dc-pay__box {
      flex: 1 1 auto; display: flex; align-items: center; gap: 0.3em;
      padding: 0 0.9375em; min-height: 2.6em;
      background: var(--bg-white, #fff);
      border: 2px solid var(--border-color, #e1e8ed);
      border-radius: var(--radius-md, 0.5em);
      transition: border-color 0.2s;
    }
    .dc-pay__box:focus-within {
      border-color: #667eea;
      box-shadow: 0 0 0 0.1875em rgba(102, 126, 234, 0.2);
    }
    .dc-pay__box > span {
      font-size: 0.875em; font-weight: 600;
      color: var(--text-secondary, #7a8fa8);
    }
    .dc-pay__box input {
      flex: 1 1 auto; width: 100%; min-width: 0;
      border: 0; outline: none; background: transparent;
      color: var(--text-primary, #1a2e4a); font-family: inherit;
      font-size: 0.9375em; font-weight: 700; text-align: center;
    }

    /* ── Live status line ──────────────────────────────────────────────────
       Same tints, border weight and radius as the confirmed / info banners on
       the Add New Test card. */
    .dc-pay__live {
      display: flex; align-items: center; gap: 0.6em;
      margin: 0.85em 0 0; padding: 0.85em 1.1em;
      border-radius: 10px;
      font-size: 0.8em; font-weight: 600; line-height: 1.5;
      background: #fff7ed;
      border: 1.5px solid #fed7aa;
      color: #92400e;
    }
    .dc-pay__live strong { font-weight: 800; }
    .dc-pay__live--ok {
      background: linear-gradient(135deg, #f0fdf4, #dcfce7);
      border-color: #86efac;
      color: #166534;
    }
    .dc-pay__live--info {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
    }

    /* ── Payment mode ──────────────────────────────────────────────────────── */
    .dc-pay__methods {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9em, 1fr));
      gap: 0.5em;
    }
    .dc-pay__method {
      display: flex; align-items: center; gap: 0.6em;
      min-height: 2.8em; padding: 0.5em 0.9em;
      font-family: inherit; font-size: 0.82em; font-weight: 600;
      background: var(--bg-light, #f7f9fc);
      color: var(--text-secondary, #5a6a7e);
      border: 2px solid var(--border-color, #d1d9e6);
      border-radius: var(--radius-md, 0.5em);
      cursor: pointer;
      transition: all 0.18s;
    }
    .dc-pay__method:hover {
      border-color: #667eea; color: #1E5BA8; background: #eef2ff;
    }
    .dc-pay__method--on,
    .dc-pay__method--on:hover {
      background: linear-gradient(135deg, #1E5BA8, #667eea);
      border-color: #1E5BA8;
      color: #fff;
      box-shadow: 0 2px 8px rgba(30, 91, 168, 0.25);
    }
    .dc-pay__mark {
      flex: 0 0 auto; width: 1.3em; height: 1.3em; border-radius: 50%;
      border: 2px solid var(--border-color, #d1d9e6);
      display: inline-flex; align-items: center; justify-content: center;
      color: transparent; font-size: 0.7em;
    }
    .dc-pay__method--on .dc-pay__mark {
      background: #fff; border-color: #fff; color: #1E5BA8;
    }

    /* ── Save bar ──────────────────────────────────────────────────────────── */
    .dc-pay__bar {
      position: sticky; bottom: 0; margin-top: 1.6em;
      display: flex; align-items: center; justify-content: space-between;
      gap: 1em; flex-wrap: wrap; padding: 0.9em 1.1em;
      background: var(--bg-white, #fff);
      border: 1.5px solid var(--border-color, #e1e8ed);
      border-radius: 10px;
      box-shadow: 0 -4px 16px rgba(30, 91, 168, 0.08);
    }
    .dc-pay__state { min-width: 0; }
    .dc-pay__state-line {
      margin: 0; font-size: 0.875em; font-weight: 700;
      color: var(--text-primary, #1a2e4a);
    }
    .dc-pay__state-sub {
      margin: 0.15em 0 0; font-size: 0.75em;
      color: var(--text-secondary, #7a8fa8);
    }
    /* Colour, size and hover come from the global .dc-btn--save rule in
       styles.css, so this only says where the button sits. */
    .dc-pay__save { flex-shrink: 0; }

    @media (max-width: 34em) {
      .dc-pay__bar { flex-direction: column; align-items: stretch; }
      .dc-pay__save { width: 100%; }
    }
  `]
})
export class DcPaymentPanelComponent implements OnChanges {
  /** The amount owed, after any discount the caller has already applied. */
  @Input() netAmount = 0;

  /** Payment modes, straight from the app's paymentMode enum. */
  @Input() modes: string[] = ['Cash', 'Card', 'UPI', 'Cheque', 'TPA'];

  /** Which of `modes` means cash — drives the change calculator. */
  @Input() cashMode = 'Cash';

  /** Offer the "nothing today" option. Off where a payment is mandatory. */
  @Input() allowNoPayment = true;

  /** Value strings written into the decision — keep them matching your enum. */
  @Input() fullType = 'Full';
  @Input() partialType = 'Partial';
  @Input() noPaymentType = 'No Payment';

  @Input() busy = false;
  @Input() busyLabel = 'Saving…';
  @Input() confirmLabel = 'Save payment';

  /** Emits on every change, so the caller can keep its own form in step. */
  @Output() decisionChange = new EventEmitter<DcPaymentDecision>();

  /** Emitted when the operator presses the save button. */
  @Output() confirmed = new EventEmitter<void>();

  choice: 'all' | 'part' | 'none' | null = null;
  mode = '';
  paidNow = 0;
  cashGiven: number | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    // If the bill changes underneath us (a discount was applied on a previous
    // step), keep the part-payment inside the new maximum rather than silently
    // carrying an impossible number forward.
    if (changes['netAmount']) {
      this.paidNow = Math.min(this.paidNow, this.netAmount);
      this.emit();
    }
  }

  get amountPaid(): number {
    if (this.choice === 'all') return this.netAmount;
    if (this.choice === 'none') return 0;
    if (this.choice === 'part') return this.clamp(this.paidNow);
    return 0;
  }

  get pending(): number {
    return Math.max(0, this.netAmount - this.amountPaid);
  }

  get complete(): boolean {
    if (!this.choice) return false;
    if (this.choice === 'none') return true;
    if (!this.mode) return false;
    if (this.choice === 'part') return this.amountPaid > 0;
    return true;
  }

  pick(choice: 'all' | 'part' | 'none'): void {
    this.choice = choice;
    if (choice === 'none') { this.mode = ''; this.cashGiven = null; }
    // Start a part payment at half the bill, rounded down to ₹10 — a sane
    // opening number the operator adjusts, rather than a zero they must fill.
    if (choice === 'part' && this.paidNow === 0) {
      this.paidNow = Math.floor(this.netAmount / 20) * 10;
    }
    this.emit();
  }

  pickMode(mode: string): void {
    this.mode = mode;
    if (mode !== this.cashMode) this.cashGiven = null;
    this.emit();
  }

  nudgePaid(by: number): void {
    this.paidNow = this.clamp(this.paidNow + by);
    this.emit();
  }

  /** While typing, mirror the text — clamping mid-keystroke fights the user. */
  onPaidTyped(value: string | number): void {
    this.paidNow = this.parse(value);
    this.emit();
  }

  settlePaid(): void {
    this.paidNow = this.clamp(this.paidNow);
    this.emit();
  }

  nudgeCash(by: number): void {
    this.cashGiven = Math.max(0, (this.cashGiven ?? 0) + by);
    this.emit();
  }

  onCashTyped(value: string | number): void {
    const text = `${value ?? ''}`.trim();
    this.cashGiven = text === '' ? null : this.parse(value);
    this.emit();
  }

  private clamp(value: number): number {
    return Math.min(this.netAmount, Math.max(0, value));
  }

  private parse(value: string | number): number {
    const cleaned = `${value ?? ''}`.replace(/[^0-9.]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private emit(): void {
    const paid = this.amountPaid;
    const type = this.choice === 'all' ? this.fullType
      : this.choice === 'none' ? this.noPaymentType
      : this.partialType;

    this.decisionChange.emit({
      type: this.choice ? type : '',
      amountPaid: paid,
      amountPending: this.pending,
      mode: this.mode,
      cashGiven: this.cashGiven,
      changeDue: this.cashGiven !== null && this.cashGiven > paid ? this.cashGiven - paid : 0,
      complete: this.complete,
    });
  }
}
