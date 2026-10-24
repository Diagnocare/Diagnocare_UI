import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { DiscountApprovalItem } from 'src/app/models/discountApproval/discount-approval.model';
import { DiscountApprovalService } from 'src/app/services/discountApprovalServices/discount-approval.service';

type Tab = 'pending' | 'history';

/**
 * Super Admin: decide on discounts that went over the lab limit.
 *
 * Approve grants the rate in the "Approve at" box, which starts at the requested
 * rate and can be edited down — a 60% request against a 30% limit can be settled at
 * anything up to 60%. A reduced rate needs a remark, and the booking's net / pending
 * amounts are recalculated server-side. Reject resets the discount to the lab limit.
 * Either way the front desk can then take payment and print the bill.
 */
@Component({
  selector: 'app-discount-approvals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './discount-approvals.component.html',
  styleUrls: ['./discount-approvals.component.scss'],
})
export class DiscountApprovalsComponent implements OnInit {
  tab: Tab = 'pending';
  pending: DiscountApprovalItem[] = [];
  history: DiscountApprovalItem[] = [];
  isLoading = false;
  loadError = '';

  /** Remark typed per request, keyed by receiptId. */
  remarks: Record<number, string> = {};
  /**
   * The % to grant, keyed by receiptId — starts at the requested rate and can be
   * edited down. Kept separate from the item so a half-typed value never looks like
   * a decided one.
   */
  grants: Record<number, number | null> = {};
  /** Receipt whose Approve was clicked with an out-of-range rate. */
  grantInvalidId: number | null = null;
  /** Request currently being approved/rejected, to disable its buttons. */
  busyId: number | null = null;
  /** Receipt whose Reject was clicked without a remark — highlights the box. */
  remarkMissingId: number | null = null;

  private historyLoaded = false;

  constructor(
    private service: DiscountApprovalService,
    private toastr: ToastrService,
    private router: Router,
  ) {}

  ngOnInit(): void { this.loadPending(); }

  setTab(tab: Tab): void {
    this.tab = tab;
    if (tab === 'history' && !this.historyLoaded) this.loadHistory();
  }

  refresh(): void {
    this.tab === 'pending' ? this.loadPending() : this.loadHistory();
  }

  loadPending(): void {
    this.isLoading = true;
    this.loadError = '';
    this.service.getPending().subscribe({
      next: list => {
        this.pending = list ?? [];
        // Pre-fill each box with the requested rate: the common decision is to grant
        // it as asked, and that should stay one click.
        this.pending.forEach(i => this.grants[i.receiptId] ??= i.requestedDiscount);
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; this.loadError = 'Could not load pending requests.'; },
    });
  }

  loadHistory(): void {
    this.isLoading = true;
    this.loadError = '';
    this.service.getHistory(100).subscribe({
      next: list => { this.history = list ?? []; this.historyLoaded = true; this.isLoading = false; },
      error: () => { this.isLoading = false; this.loadError = 'Could not load history.'; },
    });
  }

  /** The rate that will be granted — the box, or the requested rate when it is empty. */
  grantValue(item: DiscountApprovalItem): number {
    const v = this.grants[item.receiptId];
    return v === null || v === undefined || isNaN(v as number) ? item.requestedDiscount : +v;
  }

  /** True when the box holds less than was requested, so a remark is needed. */
  isReducedGrant(item: DiscountApprovalItem): boolean {
    return this.grantValue(item) < item.requestedDiscount - 0.001;
  }

  /** Net amount at the rate currently in the box, for the operator to sanity-check. */
  grantNetAmount(item: DiscountApprovalItem): number {
    return +(item.testAmount - item.testAmount * this.grantValue(item) / 100).toFixed(2);
  }

  approve(item: DiscountApprovalItem): void {
    const granted = this.grantValue(item);

    if (granted < 0 || granted > item.requestedDiscount + 0.001) {
      this.grantInvalidId = item.receiptId;
      this.toastr.warning(
        `Enter a discount between 0% and the ${item.requestedDiscount}% requested. ` +
        'To give more than was asked for, change it on the booking.',
        'Check the discount');
      return;
    }

    // Mirrors the API rule, so the operator is told before the round-trip rather than
    // by a 400.
    if (this.isReducedGrant(item) && !(this.remarks[item.receiptId] || '').trim()) {
      this.remarkMissingId = item.receiptId;
      this.toastr.warning(
        'Add a remark so the front desk can explain the reduced discount to the patient.',
        'Remark required');
      return;
    }

    this.grantInvalidId = null;
    this.decide(item, 'approve');
  }

  reject(item: DiscountApprovalItem): void {
    if (!(this.remarks[item.receiptId] || '').trim()) {
      this.remarkMissingId = item.receiptId;
      this.toastr.warning('Add a remark so the front desk knows why the discount was reduced.', 'Remark required');
      return;
    }
    this.decide(item, 'reject');
  }

  private decide(item: DiscountApprovalItem, action: 'approve' | 'reject'): void {
    const remark = (this.remarks[item.receiptId] || '').trim();
    this.busyId = item.receiptId;
    this.remarkMissingId = null;

    const granted = this.grantValue(item);

    const call = action === 'approve'
      ? this.service.approve(item.receiptId, remark, granted)
      : this.service.reject(item.receiptId, remark);

    call.subscribe({
      next: decided => {
        this.busyId = null;
        this.pending = this.pending.filter(p => p.receiptId !== item.receiptId);
        delete this.remarks[item.receiptId];
        delete this.grants[item.receiptId];
        if (this.historyLoaded) this.history = [decided, ...this.history];

        // Read the granted rate back from the API's answer rather than from the box,
        // so the message always states what was actually saved.
        const grantedPct = decided?.grantedDiscount ?? granted;
        this.toastr.success(
          action === 'approve'
            ? grantedPct < item.requestedDiscount
              ? `Approved at ${grantedPct}% for ${item.patientName} (${item.requestedDiscount}% was requested).`
              : `${grantedPct}% discount approved for ${item.patientName}.`
            : `Discount for ${item.patientName} reset to ${item.limitAtRequest}%.`,
          action === 'approve' ? 'Approved' : 'Rejected');
      },
      error: err => {
        this.busyId = null;
        // 409 = someone else already decided it; the list is stale.
        if (err?.status === 409) this.loadPending();
      },
    });
  }

  openBooking(item: DiscountApprovalItem): void {
    this.router.navigate(['/receipt'], { queryParams: { patientId: item.patientTestId } });
  }

  testList(item: DiscountApprovalItem): string {
    return (item.testIds || '').split(',').map(t => t.trim()).filter(Boolean).join(', ');
  }

  /** Money the lab gives up by approving instead of rejecting. */
  extraDiscount(item: DiscountApprovalItem): number {
    return Math.max(0, +(item.netAmountAtLimit - item.requestedNetAmount).toFixed(2));
  }

  trackById = (_: number, item: DiscountApprovalItem) => item.receiptId;
}
