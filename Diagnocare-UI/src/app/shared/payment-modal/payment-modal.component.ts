import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { paymentMode, paymentType } from 'src/app/constant/enums';
import { ReceiptCreateDto } from 'src/app/models/receipt/receipt-create.dto';
import { ReceiptService } from 'src/app/services/receiptServices/receipt.service';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { PaymentCalculatorComponent } from 'src/app/shared/payment-calculator/payment-calculator.component';

// ── Simple UI kit ────────────────────────────────────────────────────────────
// The new panel asks how much, then how, then (for cash) what was handed over,
// all on one screen. The original form stays behind *ngIf="!useNewUi".
import { DcPaymentPanelComponent, DcPaymentDecision } from 'src/app/shared/simple/dc-payment-panel.component';
import { USE_NEW_UI } from 'src/app/shared/simple/simple-ui.flags';

/**
 * What the operator settled on, handed back to a caller that saves the payment
 * as part of its own record rather than as a receipt of its own.
 *
 * Field names match the form controls every payment-carrying form in the app
 * already uses (payment_Type, payment_Mode, amount_Paid, amount_Pending), so a
 * caller usually only has to patch its form with these four values.
 */
export interface PaymentModalResult {
  paymentType: string;
  paymentMode: string;
  amountPaid: number;
  amountPending: number;
  /** Cash handed over, when the operator filled it in. Null otherwise. */
  cashGiven: number | null;
  /** Change to give back. 0 when not applicable. */
  changeDue: number;
}

/**
 * THE payment dialog.
 * ───────────────────
 * Every place in the application that asks a patient for money opens this one
 * component, so the shell, the type scale, the amount strip, the stepper, the
 * cash-change block, the buttons, the error slot and the close behaviour are
 * the same whichever screen you came from. Before this, three screens each had
 * their own dialog — this one, a Bootstrap modal inside Add New Patient and
 * another inside Add New Test — and all three looked and behaved differently.
 *
 * It covers the three shapes the app needs through configuration, not through
 * three designs:
 *
 *   1. Take a payment against a test            (default)
 *        Shown by Patient Tests, reached from the Workflow queues.
 *        Saves its own receipt.
 *
 *   2. Pay down an existing balance             [topupMode]="true"
 *        Shown by Bill / Receipt and by Patient Tests for a part-paid test.
 *        Saves its own receipt.
 *
 *   3. Collect a decision for someone else to save
 *        [autoSave]="false" — emits (confirmed) and saves nothing.
 *        Used by Add New Patient and Add New Test, where the payment is
 *        written as part of the booking, not as a standalone receipt. Those
 *        screens also own their own Payment Type and Payment Mode controls,
 *        so they pass [amountOnly]="true" and [presetMode] and the dialog
 *        asks only the one question they cannot answer: how much now.
 *
 * Adding a fourth shape means another input here, never another modal.
 */
@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePickerComponent, PaymentCalculatorComponent, DcPaymentPanelComponent],
  templateUrl: './payment-modal.component.html',
  styleUrls: ['./payment-modal.component.css'],
})
export class PaymentModalComponent implements OnChanges {
  // ── Inputs ──────────────────────────────────────────────────────────────────

  /** The patient_Test_Id (string) from the patientTest record. */
  @Input() patientTestId: string = '';

  /** Gross test amount (before discount). */
  @Input() testAmount: number = 0;

  /** Net payable amount after any discount already applied. */
  @Input() netAmount: number = 0;

  /** Controls overlay visibility — parent toggles this. */
  @Input() visible: boolean = false;

  /**
   * Topup mode — used when adding a payment against an existing partial receipt.
   * When true the Full/Partial toggle is hidden; amount_Paid is pre-filled with
   * prefillAmount (editable); payment_Type is auto-determined on save.
   */
  @Input() topupMode: boolean = false;

  /**
   * Amount to pre-fill in amount_Paid when topupMode is true.
   * Typically = netAmount − totalAlreadyPaid (the remaining pending balance).
   */
  @Input() prefillAmount: number = 0;

  // ── Configuration (see the class comment for the three shapes) ──────────────

  /**
   * true  — the dialog records the receipt itself and emits (paid).
   * false — it emits (confirmed) with the decision and saves nothing, for a
   *         caller that writes the payment as part of its own record.
   */
  @Input() autoSave: boolean = true;

  /**
   * Ask only how much is being paid now. For a screen that already carries its
   * own Payment Type control and has settled on a part payment, so the dialog
   * must not offer a second set of answers able to contradict the first.
   */
  @Input() amountOnly: boolean = false;

  /**
   * The payment method, when the calling screen owns that control. Supplying it
   * hides the method row inside the dialog, for the same reason.
   */
  @Input() presetMode: string = '';

  /** Amount to open at when reopening to amend an entered figure. */
  @Input() initialPaid: number = 0;

  /** Overrides the heading. Empty keeps the default for the current shape. */
  @Input() heading: string = '';

  /** Overrides the line under the heading. */
  @Input() subheading: string = '';

  /** Overrides the confirm button's label. */
  @Input() confirmLabel: string = '';

  /**
   * A message from the caller — a rule the dialog cannot know about, such as
   * Add New Patient's "a partial amount must be less than the net amount".
   * Rendered in the same slot as a failed save, so there is one place an error
   * about this payment ever appears.
   */
  @Input() errorText: string = '';

  // ── Outputs ─────────────────────────────────────────────────────────────────
  @Output() paid = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  /** Emitted instead of saving when [autoSave]="false". */
  @Output() confirmed = new EventEmitter<PaymentModalResult>();

  // ── Enum mirrors for template ────────────────────────────────────────────────
  readonly paymentTypeOptions = Object.values(paymentType);
  readonly paymentModeOptions = Object.values(paymentMode);
  readonly PaymentType = paymentType;

  // ── State ────────────────────────────────────────────────────────────────────
  form: FormGroup;
  isSaving = false;
  saveError = '';

  // ── Simple UI kit ───────────────────────────────────────────────────────────
  /** Flip in shared/simple/simple-ui.flags.ts to compare old and new. */
  readonly useNewUi = USE_NEW_UI;

  /** True once the new panel has everything it needs to save. */
  newUiComplete = false;

  /**
   * What the new panel is allowed to collect. In topup mode the operator is
   * paying down an existing balance, so the ceiling is what is left, not the
   * whole bill.
   */
  get panelAmount(): number {
    return this.topupMode ? this.prefillAmount : this.netAmount;
  }

  /**
   * Applies a decision from the new panel to the existing form, so save(),
   * the DTO builder and every validation rule stay exactly as they are.
   *
   * In topup mode the panel's "all of it" means the whole remaining balance,
   * which the existing save() correctly records as a Full settlement.
   */
  onPaymentDecision(decision: DcPaymentDecision): void {
    this.newUiComplete = decision.complete;
    this.lastDecision  = decision;

    // The panel reports the amount; isFormValid() and save() both read it from
    // here. Without this line a part payment entered in the panel left
    // _currentAmountPaid at 0, isFormValid() was false for Partial, and the
    // Confirm button did nothing at all — the panel's own button looked live
    // because it gates on the panel's completeness, not the form's.
    this._currentAmountPaid = decision.amountPaid;

    let type = decision.type;

    // "Some of it", nudged all the way up to the bill, is a full settlement
    // however the operator got there. Left as Partial it would fail the
    // "strictly less than the net amount" rule and stall silently.
    if (this.autoSave && type === paymentType.Partial && decision.amountPaid >= this.panelAmount) {
      type = paymentType.Full;
    }

    this.form.patchValue({
      payment_Type:   type || this.form.get('payment_Type')?.value,
      payment_Mode:   decision.mode || this.form.get('payment_Mode')?.value,
      amount_Paid:    decision.amountPaid,
      amount_Pending: decision.amountPending,
    });
  }

  /** The last thing the panel reported, used to build the collect-only result. */
  private lastDecision: DcPaymentDecision | null = null;

  // ── Presentation helpers ────────────────────────────────────────────────────

  get modalTitle(): string {
    if (this.heading) return this.heading;
    return this.topupMode ? 'Record Payment' : 'Add Payment';
  }

  get modalSubtitle(): string {
    if (this.subheading) return this.subheading;
    return '';
  }

  /** What the panel's confirm button says. */
  get panelConfirmLabel(): string {
    return this.confirmLabel || 'Confirm payment';
  }

  /** Amount entered so far, for the strip in amount-only mode. */
  get payingNow(): number {
    return +(this.form.get('amount_Paid')?.value) || 0;
  }

  get stillPending(): number {
    return Math.max(0, +(this.netAmount - this.payingNow).toFixed(2));
  }
  amountPaidError = '';
  tpaError = '';

  /**
   * Tracks the numeric value typed in the Amount Paid input.
   * Needed because FormControl value from <input type="number"> is a string
   * and the control settles asynchronously (same pattern as add-patient).
   */
  private _currentAmountPaid = 0;

  constructor(
    private fb: FormBuilder,
    private receiptService: ReceiptService
  ) {
    this.form = this.fb.group({
      payment_Type:           [paymentType.Full, Validators.required],
      payment_Mode:           [paymentMode.Cash, Validators.required],
      amount_Paid:            ['', Validators.required],
      amount_Pending:         [{ value: '0', disabled: true }],
      // TPA fields — only required when payment_Mode === 'TPA'
      tpa_Name:               [''],
      tpa_Policy_Number:      [''],
      tpa_Claim_Number:       [''],
      tpa_Approval_Code:      [''],
      tpa_Policy_Valid_From:  [''],
      tpa_Policy_Valid_To:    [''],
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.resetForm();
    }
  }

  // ── Computed helpers ─────────────────────────────────────────────────────────

  /** Max amount the user may enter in topup mode = the remaining pending balance. */
  get maxPayable(): number {
    return this.topupMode ? this.prefillAmount : this.netAmount;
  }

  get isPartial(): boolean {
    return this.form.get('payment_Type')?.value === paymentType.Partial;
  }

  get isTpaMode(): boolean {
    return this.form.get('payment_Mode')?.value === paymentMode.TPA;
  }

  /** True when TPA required fields are filled. */
  get isTpaValid(): boolean {
    if (!this.isTpaMode) return true;
    const required = ['tpa_Name', 'tpa_Policy_Number', 'tpa_Claim_Number'];
    return required.every(k => !!this.form.get(k)?.value?.trim());
  }

  get isFormValid(): boolean {
    const mode = this.form.get('payment_Mode')?.value as string;
    if (!mode) return false;
    if (!this.isTpaValid) return false;

    if (this.topupMode) {
      // In topup mode any amount between 1 and prefillAmount (inclusive) is valid
      return (
        !this.amountPaidError &&
        this._currentAmountPaid > 0 &&
        this._currentAmountPaid <= this.prefillAmount
      );
    }

    const type = this.form.get('payment_Type')?.value as string;
    if (!type) return false;
    if (type === paymentType.Full) return true;

    return (
      !this.amountPaidError &&
      this._currentAmountPaid > 0 &&
      this._currentAmountPaid < this.netAmount
    );
  }

  // ── Event handlers (standard mode) ──────────────────────────────────────────

  onPaymentModeChange(): void {
    // Clear TPA fields when switching away from TPA
    if (!this.isTpaMode) {
      this.form.patchValue({
        tpa_Name: '', tpa_Policy_Number: '', tpa_Claim_Number: '',
        tpa_Approval_Code: '', tpa_Policy_Valid_From: '', tpa_Policy_Valid_To: ''
      });
    }
    this.tpaError = '';
  }

  onPaymentTypeChange(): void {
    this.amountPaidError = '';
    this._currentAmountPaid = 0;

    if (this.form.get('payment_Type')?.value === paymentType.Full) {
      this.form.patchValue({ amount_Paid: this.netAmount, amount_Pending: 0 });
    } else {
      this.form.patchValue({ amount_Paid: '', amount_Pending: '' });
    }
  }

  // ── Event handlers (shared / topup mode) ────────────────────────────────────

  onAmountPaidInput(event: Event): void {
    const raw     = (event.target as HTMLInputElement).value;
    const entered = parseFloat(raw) || 0;
    this._currentAmountPaid = entered;
    const limit   = this.maxPayable;

    if (entered <= 0) {
      this.amountPaidError = 'Amount paid must be greater than 0.';
      this.form.patchValue({ amount_Pending: '' });
      return;
    }

    if (this.topupMode) {
      if (entered > limit) {
        this.amountPaidError = `Amount cannot exceed the pending balance of ₹${limit}.`;
        this.form.patchValue({ amount_Pending: '' });
        return;
      }
    } else {
      if (entered >= limit) {
        this.amountPaidError = `For full payment select "Full". Amount must be less than ₹${limit}.`;
        this.form.patchValue({ amount_Pending: '' });
        return;
      }
    }

    this.amountPaidError = '';
    const pending = +(limit - entered).toFixed(2);
    this.form.patchValue({ amount_Pending: pending });
  }

  save(): void {
    // ── Collect-only ──────────────────────────────────────────────────────────
    // Nothing is written here. The caller holds the record this payment belongs
    // to (a new booking, a new test) and applies its own rules to the figures
    // before saving them with it — which is why this returns before the receipt
    // validation below, all of which is about a receipt this shape never posts.
    if (!this.autoSave) {
      const d = this.lastDecision;

      if (d) {
        if (!d.complete) return;
        this.confirmed.emit({
          paymentType:   d.type,
          paymentMode:   d.mode || this.presetMode,
          amountPaid:    d.amountPaid,
          amountPending: d.amountPending,
          cashGiven:     d.cashGiven,
          changeDue:     d.changeDue,
        });
        return;
      }

      // No panel decision: USE_NEW_UI is off and the figures came from the
      // form below. Collect-only has to work on both paths or flipping that
      // flag would quietly stop Add New Patient from taking a payment.
      const paid = this._currentAmountPaid || +(this.form.get('amount_Paid')?.value) || 0;
      if (paid <= 0) return;

      this.confirmed.emit({
        paymentType:   this.form.get('payment_Type')?.value || paymentType.Partial,
        paymentMode:   this.form.get('payment_Mode')?.value || this.presetMode,
        amountPaid:    paid,
        amountPending: Math.max(0, +(this.netAmount - paid).toFixed(2)),
        cashGiven:     null,
        changeDue:     0,
      });
      return;
    }

    if (!this.isFormValid || this.isSaving) return;

    let type: string;
    let amtPaid: number;
    let amtPending: number;

    if (this.topupMode) {
      amtPaid   = this._currentAmountPaid;
      amtPending = +(this.prefillAmount - amtPaid).toFixed(2);
      // Auto-determine type: if paying the full remaining balance → Full, else Partial
      type = amtPending === 0 ? paymentType.Full : paymentType.Partial;
    } else {
      type       = this.form.get('payment_Type')?.value as string;
      amtPaid    = type === paymentType.Full ? this.netAmount : this._currentAmountPaid;
      amtPending = type === paymentType.Full ? 0 : +(this.netAmount - amtPaid).toFixed(2);
    }

    const mode = this.form.get('payment_Mode')?.value as string;
    const isTpa = mode === paymentMode.TPA;
    const payload: ReceiptCreateDto = {
      patientTestId: parseInt(this.patientTestId, 10) || 0,
      testAmount:    this.topupMode ? this.prefillAmount : this.testAmount,
      discount:      0,
      netAmount:     this.topupMode ? this.prefillAmount : this.netAmount,
      paymentType:   type,
      amountPaid:    amtPaid,
      amountPending: amtPending,
      paymentMode:   mode,
      // TPA fields — only included when mode is TPA
      ...(isTpa && {
        tpaName:           this.form.get('tpa_Name')?.value           || undefined,
        tpaPolicyNumber:   this.form.get('tpa_Policy_Number')?.value  || undefined,
        tpaClaimNumber:    this.form.get('tpa_Claim_Number')?.value   || undefined,
        tpaApprovalCode:   this.form.get('tpa_Approval_Code')?.value  || undefined,
        tpaPolicyValidFrom:this.form.get('tpa_Policy_Valid_From')?.value || undefined,
        tpaPolicyValidTo:  this.form.get('tpa_Policy_Valid_To')?.value   || undefined,
      }),
    };

    this.isSaving  = true;
    this.saveError = '';

    this.receiptService.addReceipt(payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.paid.emit();
      },
      error: (err: Error) => {
        this.isSaving  = false;
        this.saveError = err.message || 'Failed to record payment. Please try again.';
      },
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private resetForm(): void {
    this._currentAmountPaid = this.topupMode ? this.prefillAmount : 0;
    this.amountPaidError    = '';
    this.saveError          = '';
    this.tpaError           = '';
    this.isSaving           = false;
    this.lastDecision       = null;
    this.newUiComplete      = false;

    const tpaDefaults = {
      tpa_Name: '', tpa_Policy_Number: '', tpa_Claim_Number: '',
      tpa_Approval_Code: '', tpa_Policy_Valid_From: '', tpa_Policy_Valid_To: '',
    };

    if (this.topupMode) {
      // Pre-fill with the full remaining pending amount; user can reduce it
      this.form.reset({
        payment_Type:   paymentType.Full,   // internal default; hidden in topup mode
        payment_Mode:   paymentMode.Cash,
        amount_Paid:    this.prefillAmount,
        amount_Pending: 0,
        ...tpaDefaults,
      });
    } else if (this.amountOnly) {
      // The caller has already chosen Partial and the method; the dialog is
      // only collecting the figure, so neither is defaulted over here.
      this._currentAmountPaid = this.initialPaid || 0;
      this.form.reset({
        payment_Type:   paymentType.Partial,
        payment_Mode:   this.presetMode || paymentMode.Cash,
        amount_Paid:    this.initialPaid || '',
        amount_Pending: this.initialPaid ? +(this.netAmount - this.initialPaid).toFixed(2) : '',
        ...tpaDefaults,
      });
    } else {
      this.form.reset({
        payment_Type:   paymentType.Full,
        payment_Mode:   this.presetMode || paymentMode.Cash,
        amount_Paid:    this.netAmount,
        amount_Pending: 0,
        ...tpaDefaults,
      });
    }
  }
}
