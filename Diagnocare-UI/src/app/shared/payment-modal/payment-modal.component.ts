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

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePickerComponent],
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

  // ── Outputs ─────────────────────────────────────────────────────────────────
  @Output() paid = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  // ── Enum mirrors for template ────────────────────────────────────────────────
  readonly paymentTypeOptions = Object.values(paymentType);
  readonly paymentModeOptions = Object.values(paymentMode);
  readonly PaymentType = paymentType;

  // ── State ────────────────────────────────────────────────────────────────────
  form: FormGroup;
  isSaving = false;
  saveError = '';
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
    } else {
      this.form.reset({
        payment_Type:   paymentType.Full,
        payment_Mode:   paymentMode.Cash,
        amount_Paid:    this.netAmount,
        amount_Pending: 0,
        ...tpaDefaults,
      });
    }
  }
}
