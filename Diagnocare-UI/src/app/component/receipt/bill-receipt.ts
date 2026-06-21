import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoadingSpinnerComponent } from '../../shared/loading-spinner/loading-spinner.component';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { ReceiptService } from 'src/app/services/receiptServices/receipt.service';
import { Receipt, ReceiptGroup } from 'src/app/models/receipt/receiptModel';
import { PaymentModalComponent } from 'src/app/shared/payment-modal/payment-modal.component';
import { RefundModalComponent } from 'src/app/shared/refund-modal/refund-modal.component';
import { TpaDetailsModalComponent } from 'src/app/shared/tpa-details-modal/tpa-details-modal.component';
import { TpaDetails } from 'src/app/models/tpa/tpa-details.model';

@Component({
  selector: 'app-bill-receipt',
  imports: [CommonModule, LoadingSpinnerComponent, FormsModule, PaymentModalComponent, RefundModalComponent, TpaDetailsModalComponent],
  templateUrl: './bill-receipt.html',
  styleUrls: ['./bill-receipt.scss'],
  standalone: true
})
export class BillReceipt implements OnInit {
  inputSearchValue: string = '';
  showSearchInput:  boolean = false;
  receipts:         Receipt[] = [];
  notFound          = false;
  isLoading         = false;
  errorMessage      = '';
  loadingMessage:   string = '';
  private navigatedViaQueryParam: boolean = false;

  // ── Card Stack ─────────────────────────────────────────────────────────
  activeCardIndex = 0;

  // ── Payment Modal (per group) ──────────────────────────────────────────
  showPaymentModal = false;
  activeGroup: ReceiptGroup | null = null;

  // ── Computed: group receipts by patientTestId ──────────────────────────

  get groupedReceipts(): ReceiptGroup[] {
    const map = new Map<number, Receipt[]>();
    for (const r of this.receipts) {
      const list = map.get(r.patientTestId) ?? [];
      list.push(r);
      map.set(r.patientTestId, list);
    }
    return Array.from(map.entries()).map(([id, recs]) => {
      // Sort ascending so receipt[0] is the very first payment ever made for this test
      const sorted = [...recs].sort((a, b) => a.receiptId - b.receiptId);

      // ── Net amount ────────────────────────────────────────────────────
      // Backend stores amountPending per-receipt (= netAmount − thatReceiptPaid),
      // NOT as a running balance.  The FIRST receipt is reliable:
      //   firstRec.amountPaid + firstRec.amountPending  =  netAmount
      // Use the API's netAmount field when it is present and positive;
      // otherwise derive from the first receipt.
      const firstRec  = sorted[0];
      const apiNet    = sorted.find(r => r.netAmount != null && r.netAmount > 0)?.netAmount;
      const net       = (apiNet != null && apiNet > 0)
                          ? apiNet
                          : +((firstRec?.amountPaid || 0) + (firstRec?.amountPending || 0)).toFixed(2);

      // ── Total paid ────────────────────────────────────────────────────
      // Sum every amountPaid across all receipts for this test
      const totalPaid = sorted.reduce((s, r) => s + (r.amountPaid || 0), 0);

      // ── Refunded  =  Σ(refundAmount) for refunded receipts ───────────
      const totalRefunded = +sorted.reduce((s, r) => s + (r.isRefunded ? (r.refundAmount || 0) : 0), 0).toFixed(2);

      const isCancelled = (sorted[0]?.bookingStatus || '').toLowerCase() === 'cancelled';

      // ── Remaining  =  netAmount − Σ(amountPaid) + Σ(refundAmount) ────
      // Cancelled bookings have no outstanding balance regardless of what was paid.
      const remaining = isCancelled ? 0 : Math.max(0, +(net - totalPaid + totalRefunded).toFixed(2));

      const status = isCancelled ? 'Cancelled' : remaining === 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Pending';
      return { patientTestId: id, receipts: sorted, netAmount: net, totalPaid, remaining, paymentStatus: status, isCancelled, totalRefunded };
    });
  }

  // ── Patient-level summary (across all groups) ─────────────────────────

  get totalNetAmount(): number {
    return this.groupedReceipts.reduce((s, g) => s + g.netAmount, 0);
  }

  get totalPaidOverall(): number {
    return this.receipts.reduce((s, r) => s + (r.amountPaid || 0), 0);
  }

  get totalRefundedOverall(): number {
    return +this.receipts.reduce((s, r) => s + (r.isRefunded ? (r.refundAmount || 0) : 0), 0).toFixed(2);
  }

  get totalRemainingOverall(): number {
    return Math.max(0, +(this.totalNetAmount - this.totalPaidOverall + this.totalRefundedOverall).toFixed(2));
  }

  get hasAnyPendingBalance(): boolean {
    return this.receipts.length > 0 && this.totalRemainingOverall > 0;
  }

  get groupCount(): number { return this.groupedReceipts.length; }

  // ── Payment Modal getters (bound to active group) ─────────────────────

  get groupPaymentTestId(): string {
    return this.activeGroup?.patientTestId?.toString() ?? '';
  }
  get groupNetAmount(): number { return this.activeGroup?.netAmount ?? 0; }
  get groupPrefillAmount(): number { return this.activeGroup?.remaining ?? 0; }

  // ── Card Stack helpers ────────────────────────────────────────────────

  selectCard(i: number): void { this.activeCardIndex = i; }

  isActiveCard(i: number): boolean { return this.activeCardIndex === i; }

  getCardZIndex(i: number): number {
    if (i === this.activeCardIndex) return this.groupedReceipts.length + 1;
    return this.groupedReceipts.length - Math.abs(i - this.activeCardIndex);
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private receiptService: ReceiptService,
    private location: Location,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const pid = params.get('patientId');
      if (pid) {
        this.inputSearchValue = pid;
        this.showSearchInput = false;
        this.navigatedViaQueryParam = true;
        this.loadReceipts();
      } else {
        this.showSearchInput = true;
        this.navigatedViaQueryParam = false;
      }
    });
  }

  onSearchSubmit(): void {
    if (this.inputSearchValue && this.inputSearchValue.trim()) {
      this.inputSearchValue = this.inputSearchValue.trim();
      this.showSearchInput = false;
      this.loadReceipts();
    }
  }

  loadReceipts(): void {
    this.loadingMessage = 'Loading receipts for: ' + this.inputSearchValue + '…';
    this.isLoading = true;
    this.notFound  = false;
    this.errorMessage = '';
    this.receipts = [];
    this.activeCardIndex = 0;

    this.receiptService.getReceiptList(this.inputSearchValue).subscribe({
      next: (data) => {
        this.receipts = data ?? [];
        this.showSearchInput = false;
        this.notFound = !this.receipts.length;
        this.isLoading = false;
      },
      error: (err) => {
        this.isLoading = false;
        this.receipts  = [];
        if (err instanceof Error && err.message?.includes('404')) {
          this.notFound = true;
        } else {
          this.errorMessage = err.message || 'Unable to load receipts.';
        }
      }
    });
  }

  // ── Receipt / Refund PDF (backend-generated) ──────────────────────────

  onReceiptClick(receipt: Receipt, event: Event): void {
    event.stopPropagation();
    this.openReceiptPdf(receipt.receiptId, 'Payment receipt');
  }

  /** Clicking the refund row generates the same PDF (which now includes the refund section). */
  onRefundRowClick(receipt: Receipt, event: Event): void {
    event.stopPropagation();
    this.openReceiptPdf(receipt.receiptId, 'Refund receipt');
  }

  private openReceiptPdf(receiptId: number, label: string): void {
    this.loadingMessage = `Generating ${label} #${receiptId}…`;
    this.isLoading = true;
    this.errorMessage = '';

    this.receiptService.generateReceiptPdf(receiptId).subscribe({
      next: (blob: Blob) => {
        this.isLoading = false;
        const url = URL.createObjectURL(blob);
        const tab = window.open(url, '_blank');
        if (tab) {
          tab.focus();
        } else {
          this.toastr.warning(
            'Pop-up was blocked. Please allow pop-ups for this site.',
            'Pop-up Blocked'
          );
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.message || `Unable to generate ${label} PDF.`;
        this.toastr.error(`Failed to generate ${label} PDF.`, 'Error');
      }
    });
  }

  // ── Payment Modal (per group) ──────────────────────────────────────────

  openGroupPaymentModal(group: ReceiptGroup, event: Event): void {
    event.stopPropagation();
    this.activeGroup = group;
    this.showPaymentModal = true;
  }

  onPaymentSaved(): void {
    this.showPaymentModal = false;
    this.activeGroup = null;
    this.toastr.success('Payment recorded successfully.', 'Payment Saved');
    this.loadReceipts();
  }

  onPaymentCancelled(): void {
    this.showPaymentModal = false;
    this.activeGroup = null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  getPaymentStatusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'paid':    return 'status-paid';
      case 'partial': return 'status-partial';
      default:        return 'status-pending';
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const day   = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const time  = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return `${day}-${month}-${d.getFullYear()} ${time}`;
  }

  // ── Refund Modal ───────────────────────────────────────────────────────

  showRefundModal = false;
  refundTargetReceipt: Receipt | null = null;
  @ViewChild('refundModal') refundModalRef?: RefundModalComponent;

  openRefundModal(receipt: Receipt, event: Event): void {
    event.stopPropagation();
    this.refundTargetReceipt = receipt;
    this.showRefundModal = true;
  }

  onRefundConfirmed(payload: { refundAmount: number; reason: string | null }): void {
    if (!this.refundTargetReceipt) return;
    const id = this.refundTargetReceipt.receiptId;

    this.receiptService.refundReceipt(id, payload.refundAmount, payload.reason ?? undefined).subscribe({
      next: () => {
        this.showRefundModal = false;
        this.refundTargetReceipt = null;
        this.toastr.success('Refund processed successfully.', 'Refund Issued');
        this.loadReceipts();
      },
      error: (err: Error) => {
        this.refundModalRef?.setError(err.message || 'Failed to process refund. Please try again.');
      }
    });
  }

  onRefundDismissed(): void {
    this.showRefundModal = false;
    this.refundTargetReceipt = null;
  }

  // ── TPA Details Edit Modal ─────────────────────────────────────────────
  showTpaModal     = false;
  tpaModalDetails: TpaDetails | null = null;
  tpaEditReceiptId = 0;
  tpaSaving        = false;
  tpaSaveError     = '';

  openTpaView(receipt: Receipt, event: Event): void {
    event.stopPropagation();
    this.tpaEditReceiptId = receipt.receiptId;
    this.tpaModalDetails  = {
      tpaName:            receipt.tpaName            ?? '',
      tpaPolicyNumber:    receipt.tpaPolicyNumber    ?? '',
      tpaClaimNumber:     receipt.tpaClaimNumber     ?? '',
      tpaApprovalCode:    receipt.tpaApprovalCode    ?? '',
      tpaPolicyValidFrom: receipt.tpaPolicyValidFrom ?? '',
      tpaPolicyValidTo:   receipt.tpaPolicyValidTo   ?? '',
      tpaPaymentStatus:   receipt.tpaPaymentStatus   ?? 'Pending',
      tpaSettledDate:     receipt.tpaSettledDate     ?? '',
    };
    this.tpaSaveError = '';
    this.showTpaModal = true;
  }

  onTpaConfirmed(details: TpaDetails): void {
    this.tpaSaving = true;
    this.tpaSaveError = '';
    this.receiptService.updateTpaDetails(this.tpaEditReceiptId, details).subscribe({
      next: () => {
        this.tpaSaving    = false;
        this.showTpaModal = false;
        this.tpaModalDetails = null;
        this.toastr.success('TPA details updated successfully.', 'Saved');
        this.loadReceipts();
      },
      error: (err: Error) => {
        this.tpaSaving    = false;
        this.tpaSaveError = err.message || 'Failed to update TPA details.';
        this.toastr.error(this.tpaSaveError, 'Error');
      }
    });
  }

  closeTpaModal(): void {
    this.showTpaModal    = false;
    this.tpaModalDetails = null;
    this.tpaSaveError    = '';
  }

  goBack(): void {
    if (this.navigatedViaQueryParam) {
      this.location.back();
    } else if (this.receipts.length || this.notFound || this.errorMessage) {
      this.receipts = [];
      this.inputSearchValue = '';
      this.showSearchInput = true;
      this.notFound = false;
      this.errorMessage = '';
    } else {
      this.location.back();
    }
  }

  handlePrint(): void { window.print(); }
}
