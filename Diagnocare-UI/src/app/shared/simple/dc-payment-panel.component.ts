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

        <button type="button" class="dc-pay__save" [disabled]="!complete || busy" (click)="confirmed.emit()">
          <i class="fa" [ngClass]="busy ? 'fa-spinner fa-spin' : 'fa-check'" aria-hidden="true"></i>
          <span>{{ busy ? busyLabel : confirmLabel }}</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* Transparent, so the panel sits on whatever card contains it rather than
       painting its own slab of white over the page. Padding matches the
       .step-body it replaces. */
    :host {
      display: block;
      background: transparent;
      color: var(--dc-ink, var(--text-primary, #234a57));
      padding: 1.25rem 1.75rem 1.5rem;
    }
    @media (max-width: 40rem) { :host { padding: 1rem; } }

    .dc-pay__q {
      margin: 0 0 .3rem;
      font-size: var(--dc-text-xl, 1.375rem); font-weight: 700;
      color: var(--dc-ink, var(--text-primary, #234a57));
    }
    .dc-pay__q--later { margin-top: 1.75rem; }
    .dc-pay__ask {
      margin: 0 0 1.1rem; font-size: var(--dc-text, 1rem);
      color: var(--dc-ink-soft, var(--text-secondary, #6b7c93)); max-width: 52ch;
    }
    .dc-pay__ask strong { color: var(--dc-ink, var(--text-primary, #234a57)); }

    .dc-pay__choices {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: .75rem;
    }
    .dc-pay__choice {
      display: flex; flex-direction: column; align-items: flex-start; gap: .15rem;
      padding: 1rem; min-height: 5.5rem; text-align: left;
      font-family: inherit;
      background: var(--dc-surface, var(--bg-white, #fff)); color: var(--dc-ink, var(--text-primary, #234a57));
      border: var(--dc-border, 2px) solid var(--dc-line, var(--border-color, #eef1f8));
      border-radius: var(--dc-radius-lg, .875rem); cursor: pointer;
    }
    .dc-pay__choice:hover { border-color: var(--dc-brand, var(--primary-color, #1e5ba8)); }
    .dc-pay__choice:focus-visible { outline: none; box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,.35)); }
    .dc-pay__choice--on { border-color: var(--dc-brand, var(--primary-color, #1e5ba8)); background: var(--dc-info-bg, #dbeafe); }
    .dc-pay__amt { font-size: 1.6rem; font-weight: 700; line-height: 1.1; }
    .dc-pay__lab { font-size: var(--dc-text, 1rem); font-weight: 600; }
    .dc-pay__sub { font-size: var(--dc-text-sm, .875rem); color: var(--dc-ink-soft, var(--text-secondary, #6b7c93)); }
    .dc-pay__choice--on .dc-pay__sub { color: var(--dc-info-ink, #1d4ed8); }

    .dc-pay__stepper { display: flex; gap: .4rem; max-width: 22rem; }
    .dc-pay__stepper > button {
      flex: 0 0 var(--dc-touch, 3rem); width: var(--dc-touch, 3rem); min-height: var(--dc-touch, 3rem);
      font-family: inherit; font-size: 1rem;
      background: var(--dc-surface-muted, var(--bg-light, #f8fafc)); color: var(--dc-ink, var(--text-primary, #234a57));
      border: var(--dc-border, 2px) solid var(--dc-line, var(--border-color, #eef1f8));
      border-radius: var(--dc-radius, .625rem); cursor: pointer;
    }
    .dc-pay__stepper > button:hover:not(:disabled) {
      background: var(--dc-info-bg, #dbeafe); border-color: var(--dc-brand, var(--primary-color, #1e5ba8)); color: var(--dc-info-ink, #1d4ed8);
    }
    .dc-pay__stepper > button:disabled { opacity: .4; cursor: not-allowed; }
    .dc-pay__box {
      flex: 1 1 auto; display: flex; align-items: center; gap: .3rem; padding: 0 .8rem;
      min-height: var(--dc-touch, 3rem);
      background: var(--dc-surface, var(--bg-white, #fff));
      border: var(--dc-border, 2px) solid var(--dc-line, var(--border-color, #eef1f8));
      border-radius: var(--dc-radius, .625rem);
    }
    .dc-pay__box:focus-within { border-color: var(--dc-brand, var(--primary-color, #1e5ba8)); box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,.35)); }
    .dc-pay__box > span { font-weight: 600; color: var(--dc-ink-soft, var(--text-secondary, #6b7c93)); }
    .dc-pay__box input {
      flex: 1 1 auto; width: 100%; min-width: 0; border: 0; outline: none; background: transparent;
      color: var(--dc-ink, var(--text-primary, #234a57)); font-family: inherit;
      font-size: var(--dc-text-lg, 1.125rem); font-weight: 600; text-align: center;
    }

    .dc-pay__live {
      display: flex; align-items: center; gap: .55rem; margin: .85rem 0 0;
      padding: .75rem 1rem; border-radius: var(--dc-radius, .625rem); font-weight: 600;
      background: var(--dc-wait-bg, #fef3c7);
      border: 1px solid var(--dc-wait-line, #fcd34d);
      color: var(--dc-wait-ink, #b45309);
    }
    .dc-pay__live--ok {
      background: var(--dc-ok-bg, #dcfce7); border-color: var(--dc-ok-line, #86efac); color: var(--dc-ok-ink, #15803d);
    }
    .dc-pay__live--info {
      background: var(--dc-info-bg, #dbeafe); border-color: var(--dc-info-line, #93c5fd); color: var(--dc-info-ink, #1d4ed8);
    }

    .dc-pay__methods { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: .6rem; }
    .dc-pay__method {
      display: flex; align-items: center; gap: .6rem;
      min-height: var(--dc-touch-lg, 3.5rem); padding: .7rem .9rem;
      font-family: inherit; font-size: var(--dc-text, 1rem);
      background: var(--dc-surface, var(--bg-white, #fff)); color: var(--dc-ink, var(--text-primary, #234a57));
      border: var(--dc-border, 2px) solid var(--dc-line, var(--border-color, #eef1f8));
      border-radius: var(--dc-radius, .625rem); cursor: pointer;
    }
    .dc-pay__method:hover { border-color: var(--dc-brand, var(--primary-color, #1e5ba8)); }
    .dc-pay__method--on {
      border-color: var(--dc-brand, var(--primary-color, #1e5ba8)); background: var(--dc-info-bg, #dbeafe);
      color: var(--dc-info-ink, #1d4ed8); font-weight: 600;
    }
    .dc-pay__mark {
      flex: 0 0 auto; width: 1.4rem; height: 1.4rem; border-radius: 50%;
      border: var(--dc-border, 2px) solid var(--dc-line, var(--border-color, #eef1f8));
      display: inline-flex; align-items: center; justify-content: center;
      color: transparent; font-size: .7rem;
    }
    .dc-pay__method--on .dc-pay__mark {
      background: var(--dc-brand, var(--primary-color, #1e5ba8)); border-color: var(--dc-brand, var(--primary-color, #1e5ba8)); color: #fff;
    }

    .dc-pay__bar {
      position: sticky; bottom: 0; margin-top: 1.75rem;
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; flex-wrap: wrap; padding: .9rem 1rem;
      background: var(--dc-surface, var(--bg-white, #fff));
      border: var(--dc-border, 2px) solid var(--dc-line, var(--border-color, #eef1f8));
      border-radius: var(--dc-radius-lg, .875rem);
      box-shadow: 0 -6px 18px rgba(0,0,0,.06);
    }
    .dc-pay__state { min-width: 0; }
    .dc-pay__state-line { margin: 0; font-weight: 600; }
    .dc-pay__state-sub { margin: 0; font-size: var(--dc-text-sm, .875rem); color: var(--dc-ink-soft, var(--text-secondary, #6b7c93)); }
    .dc-pay__save {
      display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
      min-height: var(--dc-touch-lg, 3.5rem); padding: 0 1.75rem;
      font-family: inherit; font-size: var(--dc-text-lg, 1.125rem); font-weight: 600;
      background: #15803d; color: #fff;
      border: var(--dc-border, 2px) solid transparent; border-radius: var(--dc-radius, .625rem);
      cursor: pointer;
    }
    .dc-pay__save:disabled { opacity: .45; cursor: not-allowed; }
    .dc-pay__save:focus-visible { outline: none; box-shadow: var(--dc-focus, 0 0 0 3px rgba(30,91,168,.35)); }

    @media (max-width: 34rem) {
      .dc-pay__save { flex: 1 1 100%; }
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
