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
 * Approve keeps the requested discount. Reject resets it to the limit and the
 * booking's net / pending amounts are recalculated server-side. Either way the
 * front desk can then take payment and print the bill.
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
      next: list => { this.pending = list ?? []; this.isLoading = false; },
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

  approve(item: DiscountApprovalItem): void {
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

    const call = action === 'approve'
      ? this.service.approve(item.receiptId, remark)
      : this.service.reject(item.receiptId, remark);

    call.subscribe({
      next: decided => {
        this.busyId = null;
        this.pending = this.pending.filter(p => p.receiptId !== item.receiptId);
        delete this.remarks[item.receiptId];
        if (this.historyLoaded) this.history = [decided, ...this.history];
        this.toastr.success(
          action === 'approve'
            ? `${item.requestedDiscount}% discount approved for ${item.patientName}.`
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
