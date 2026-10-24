import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-refund-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="visible" (click)="onBackdropClick($event)">
      <div class="modal-panel" (click)="$event.stopPropagation()">

        <div class="modal-header">
          <div class="modal-header-icon modal-header-icon--refund">
            <i class="fa fa-undo"></i>
          </div>
          <div>
            <h3 class="modal-title">Initiate Refund</h3>
            <p class="modal-subtitle">Receipt #{{ receiptId }} &nbsp;&bull;&nbsp; Max refundable: <strong>₹{{ maxRefund | number:'1.2-2' }}</strong></p>
          </div>
          <button class="modal-close-btn" (click)="onCancel()" title="Close">
            <i class="fa fa-times"></i>
          </button>
        </div>

        <div class="modal-body">

          <!-- Post-cancel context banner -->
          <div class="post-cancel-note" *ngIf="postCancelContext">
            <i class="fa fa-check-circle"></i>
            Booking cancelled. A payment of <strong>₹{{ maxRefund | number:'1.2-2' }}</strong> was recorded for this test.
            You can initiate the refund now or skip and do it later from the Receipts page.
          </div>

          <!-- Amount row -->
          <div class="form-group">
            <label class="form-label">Refund Amount <span class="required-star">*</span></label>
            <div class="amount-input-wrap">
              <span class="currency-prefix">₹</span>
              <input
                type="number"
                class="form-input"
                [(ngModel)]="refundAmount"
                (input)="onAmountInput()"
                [min]="0.01"
                [max]="maxRefund"
                [step]="0.01"
                placeholder="0.00"
                [disabled]="isSaving">
            </div>
            <div class="quick-btns">
              <button class="quick-btn" (click)="setFull()" [disabled]="isSaving" type="button">Full (₹{{ maxRefund | number:'1.2-2' }})</button>
              <button class="quick-btn" (click)="setHalf()" [disabled]="isSaving" type="button">Half (₹{{ (maxRefund / 2) | number:'1.2-2' }})</button>
            </div>
            <span class="field-error" *ngIf="amountError">{{ amountError }}</span>
          </div>

          <!-- Reason row -->
          <div class="form-group">
            <label class="form-label">Reason <span class="optional-tag">(optional)</span></label>
            <textarea
              class="form-textarea"
              [(ngModel)]="reason"
              placeholder="Enter reason for refund..."
              rows="3"
              maxlength="500"
              [disabled]="isSaving">
            </textarea>
            <span class="char-count">{{ reason.length }}/500</span>
          </div>

          <div class="error-msg" *ngIf="errorMessage">
            <i class="fa fa-exclamation-circle"></i> {{ errorMessage }}
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" (click)="onCancel()" [disabled]="isSaving">
            {{ postCancelContext ? 'Skip Refund' : 'Cancel' }}
          </button>
          <button class="btn btn-refund" (click)="onConfirm()" [disabled]="isSaving || !isValid">
            <span *ngIf="!isSaving"><i class="fa fa-undo"></i> Process Refund</span>
            <span *ngIf="isSaving"><i class="fa fa-spinner fa-spin"></i> Processing…</span>
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.45);
      display: flex; align-items: center; justify-content: center;
      z-index: 1100; animation: fadeIn .15s ease;
    }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

    .modal-panel {
      background: var(--color-surface, #fff);
      border-radius: 12px;
      width: min(480px, 95vw);
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
      overflow: hidden;
      animation: slideUp .2s ease;
    }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

    .modal-header {
      display: flex; align-items: center; gap: 12px;
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--color-border, #e2e8f0);
    }
    .modal-header-icon {
      width: 40px; height: 40px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.1rem; flex-shrink: 0;
    }
    .modal-header-icon--refund { background: #dbeafe; color: #2563eb; }

    .modal-title { margin: 0; font-size: 1.1rem; font-weight: 700; color: var(--color-text, #1e293b); }
    .modal-subtitle { margin: 2px 0 0; font-size: .85rem; color: var(--color-text-muted, #64748b); }

    .modal-close-btn {
      margin-left: auto; background: none; border: none; cursor: pointer;
      font-size: 1.1rem; color: var(--color-text-muted, #64748b); padding: 4px 8px;
      border-radius: 6px; transition: background .15s;
    }
    .modal-close-btn:hover { background: var(--color-border, #e2e8f0); }

    .modal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }

    .post-cancel-note {
      display: flex; align-items: flex-start; gap: 10px;
      background: #dcfce7; border: 1px solid #86efac; border-radius: 8px;
      padding: 12px 14px; font-size: .875rem; color: #166534;
    }
    .post-cancel-note .fa { margin-top: 2px; flex-shrink: 0; }

    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-label { font-size: .875rem; font-weight: 600; color: var(--color-text, #1e293b); }
    .required-star { color: #dc2626; }
    .optional-tag { font-weight: 400; color: var(--color-text-muted, #64748b); font-size: .8rem; }

    .amount-input-wrap {
      display: flex; align-items: center;
      border: 1px solid var(--color-border, #e2e8f0); border-radius: 8px; overflow: hidden;
    }
    .amount-input-wrap:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
    .currency-prefix {
      padding: 0 12px; background: var(--color-surface-alt, #f8fafc);
      font-weight: 700; color: var(--color-text-muted, #64748b); font-size: .95rem;
      border-right: 1px solid var(--color-border, #e2e8f0);
      height: 40px; display: flex; align-items: center;
    }
    .form-input {
      flex: 1; border: none; outline: none; padding: 9px 12px;
      font-size: .95rem; background: transparent;
    }
    .form-input:disabled { background: #f8fafc; opacity: .6; }

    .quick-btns { display: flex; gap: 8px; }
    .quick-btn {
      flex: 1; padding: 6px 10px; border-radius: 6px; font-size: .8rem;
      font-weight: 600; cursor: pointer; border: 1px solid var(--color-border, #e2e8f0);
      background: transparent; color: #2563eb; transition: all .15s;
    }
    .quick-btn:hover:not(:disabled) { background: #dbeafe; border-color: #93c5fd; }
    .quick-btn:disabled { opacity: .5; cursor: not-allowed; }

    .field-error { font-size: .8rem; color: #dc2626; }

    .form-textarea {
      width: 100%; border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 8px; padding: 10px 12px; font-size: .875rem;
      resize: vertical; font-family: inherit; box-sizing: border-box;
      transition: border-color .15s;
    }
    .form-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
    .form-textarea:disabled { background: #f8fafc; opacity: .6; }
    .char-count { font-size: .75rem; color: var(--color-text-muted, #64748b); text-align: right; }

    .error-msg {
      display: flex; align-items: center; gap: 8px;
      color: #dc2626; font-size: .875rem;
      background: #fee2e2; border-radius: 6px; padding: 10px 12px;
    }

    .modal-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 16px 20px; border-top: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface-alt, #f8fafc);
    }

    .btn {
      padding: 9px 18px; border-radius: 8px; font-size: .875rem;
      font-weight: 600; cursor: pointer; border: none; transition: all .15s;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .btn:disabled { opacity: .6; cursor: not-allowed; }
    .btn-outline {
      background: transparent; border: 1px solid var(--color-border, #e2e8f0);
      color: var(--color-text, #1e293b);
    }
    .btn-outline:hover:not(:disabled) { background: var(--color-border, #e2e8f0); }
    .btn-refund { background: #2563eb; color: #fff; }
    .btn-refund:hover:not(:disabled) { background: #1d4ed8; }
  `]
})
export class RefundModalComponent implements OnChanges {
  @Input() visible = false;
  @Input() receiptId: number = 0;
  /** Maximum refundable = amountPaid on this receipt. */
  @Input() maxRefund: number = 0;
  /**
   * When true the modal adds a contextual note that the refund follows a cancellation.
   * Also the "Cancel" button label changes to "Skip Refund" to make dismissal clearer.
   */
  @Input() postCancelContext = false;

  @Output() confirmed = new EventEmitter<{ refundAmount: number; reason: string | null }>();
  @Output() cancelled = new EventEmitter<void>();

  refundAmount: number | null = null;
  reason = '';
  amountError = '';
  errorMessage = '';
  isSaving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.refundAmount = null;
      this.reason = '';
      this.amountError = '';
      this.errorMessage = '';
      this.isSaving = false;
    }
  }

  get isValid(): boolean {
    return (
      this.refundAmount != null &&
      this.refundAmount > 0 &&
      this.refundAmount <= this.maxRefund &&
      !this.amountError
    );
  }

  onAmountInput(): void {
    const v = this.refundAmount ?? 0;
    if (v <= 0) {
      this.amountError = 'Refund amount must be greater than zero.';
    } else if (v > this.maxRefund) {
      this.amountError = `Cannot exceed amount paid (₹${this.maxRefund.toFixed(2)}).`;
    } else {
      this.amountError = '';
    }
  }

  setFull(): void {
    this.refundAmount = this.maxRefund;
    this.amountError = '';
  }

  setHalf(): void {
    this.refundAmount = parseFloat((this.maxRefund / 2).toFixed(2));
    this.amountError = '';
  }

  onConfirm(): void {
    if (!this.isValid || this.isSaving) return;
    this.isSaving = true;
    this.errorMessage = '';
    this.confirmed.emit({
      refundAmount: this.refundAmount!,
      reason: this.reason.trim() || null
    });
  }

  /** Called by parent on API error to reset spinner and show message. */
  setError(msg: string): void {
    this.isSaving = false;
    this.errorMessage = msg;
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.onCancel();
    }
  }
}
