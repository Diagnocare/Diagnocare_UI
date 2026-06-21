import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { TpaDetails } from 'src/app/models/tpa/tpa-details.model';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';

@Component({
  selector: 'app-tpa-details-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePickerComponent],
  templateUrl: './tpa-details-modal.component.html',
  styleUrls: ['./tpa-details-modal.component.css'],
})
export class TpaDetailsModalComponent implements OnChanges, OnDestroy {
  /** Show / hide the modal. */
  @Input() visible = false;

  /** Today in YYYY-MM-DD — used to block future dates on settlement. */
  readonly todayIso = new Date().toISOString().split('T')[0];

  /** Pre-fill when re-opening to edit already-confirmed details. */
  @Input() initialValues: TpaDetails | null = null;

  /**
   * When true the modal opens in view-only mode:
   * all fields are read-only, only a "Close" button is shown.
   */
  @Input() readOnly = false;

  /** Emits the confirmed TPA details. */
  @Output() confirmed = new EventEmitter<TpaDetails>();

  /** Emits when the user cancels (parent should revert payment mode). */
  @Output() cancelled = new EventEmitter<void>();

  form: FormGroup;
  /** Snapshot of form values when the modal opens — used to detect changes. */
  private _originalValues: Record<string, unknown> = {};
  /** True when the form differs from the original snapshot (only relevant when editing). */
  hasChanges = false;
  private _changeSub?: Subscription;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      tpa_Name:              ['', Validators.required],
      tpa_Policy_Number:     ['', Validators.required],
      tpa_Claim_Number:      ['', Validators.required],
      tpa_Approval_Code:     [''],
      tpa_Policy_Valid_From: [''],
      tpa_Policy_Valid_To:   [''],
      tpa_Payment_Status:    ['Pending'],
      tpa_Settled_Date:      [''],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      // Pre-fill from initialValues when opening, else clear the form
      if (this.initialValues) {
        this.form.setValue({
          tpa_Name:              this.initialValues.tpaName              || '',
          tpa_Policy_Number:     this.initialValues.tpaPolicyNumber      || '',
          tpa_Claim_Number:      this.initialValues.tpaClaimNumber       || '',
          tpa_Approval_Code:     this.initialValues.tpaApprovalCode      || '',
          tpa_Policy_Valid_From: this.initialValues.tpaPolicyValidFrom   || '',
          tpa_Policy_Valid_To:   this.initialValues.tpaPolicyValidTo     || '',
          tpa_Payment_Status:    this.initialValues.tpaPaymentStatus     || 'Pending',
          tpa_Settled_Date:      this.initialValues.tpaSettledDate       || '',
        });
      } else {
        this.form.reset({
          tpa_Name: '', tpa_Policy_Number: '', tpa_Claim_Number: '',
          tpa_Approval_Code: '', tpa_Policy_Valid_From: '', tpa_Policy_Valid_To: '',
          tpa_Payment_Status: 'Pending', tpa_Settled_Date: '',
        });
      }
      this.form.markAsUntouched();
      // Snapshot current values to detect changes later
      this._originalValues = { ...this.form.value };
      this.hasChanges = false;
      // Subscribe to value changes
      this._changeSub?.unsubscribe();
      this._changeSub = this.form.valueChanges.subscribe(() => {
        const cur = this.form.value;
        this.hasChanges = Object.keys(this._originalValues).some(
          k => (cur[k] ?? '') !== (this._originalValues[k] ?? '')
        );
      });
    } else if (changes['visible'] && !this.visible) {
      this._changeSub?.unsubscribe();
    }
  }

  ngOnDestroy(): void {
    this._changeSub?.unsubscribe();
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.value;
    this.confirmed.emit({
      tpaName:            v.tpa_Name              || '',
      tpaPolicyNumber:    v.tpa_Policy_Number     || '',
      tpaClaimNumber:     v.tpa_Claim_Number      || '',
      tpaApprovalCode:    v.tpa_Approval_Code     || '',
      tpaPolicyValidFrom: v.tpa_Policy_Valid_From || '',
      tpaPolicyValidTo:   v.tpa_Policy_Valid_To   || '',
      tpaPaymentStatus:   v.tpa_Payment_Status    || 'Pending',
      tpaSettledDate:     v.tpa_Settled_Date      || '',
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
