import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { SalaryService } from 'src/app/services/salaryServices/salary.service';
import { TokenService } from 'src/app/core/interceptors/token.service';
import {
  SalaryPaymentDTO,
  UserSalarySummaryDTO,
  MonthlySalarySummaryDTO,
} from 'src/app/models/salary/salary.dto';

/**
 * My Salary — read-only self-service payments view.
 *
 * Shows a simple tabular list of the actual salary payments made to the logged-in
 * user (Month, Payment Date, Amount, Payment Mode) for the selected month. Clicking
 * a row opens that single payment's receipt PDF. The user is resolved server-side
 * from the JWT, so only the caller's own payments are ever shown.
 * Visible to the "User" role only.
 */
@Component({
  selector: 'app-my-salary',
  templateUrl: './my-salary.component.html',
  styleUrls: ['./my-salary.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
})
export class MySalaryComponent implements OnInit, OnDestroy {

  // ── State ────────────────────────────────────────────────────────────────
  isLoading      = false;
  spinnerMessage = 'Loading your payments…';

  /** All actual payments made to the logged-in user (across all months). */
  payments: SalaryPaymentDTO[] = [];

  /** Month-level salary summary (for Total Paid / Balance / Status). */
  summary: UserSalarySummaryDTO | null = null;

  /** Set on a load failure. */
  loadError = false;

  /**
   * Whether the current user may view their own payments. Available to all staff
   * types EXCEPT Super Admin and the Owner account (last name "admin"). The route
   * guard already blocks Admin / Super Admin, and the backend enforces the Owner
   * exclusion; this flag is a defensive UI check.
   */
  canView = false;

  /** PaymentId whose receipt is currently being fetched, for the row spinner. */
  receiptLoadingId: number | null = null;

  readonly MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // ── Month navigation state ──────────────────────────────────────────────────
  currentYear  = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;   // 1-indexed

  private destroy$ = new Subject<void>();

  constructor(
    private salarySvc: SalaryService,
    private tokenSvc: TokenService,
    private toastr: ToastrService,
  ) {}

  ngOnInit(): void {
    // Everyone except Super Admin may view their own payments. (The Owner account —
    // last name "admin" — is excluded server-side.)
    this.canView = !this.tokenSvc.isSuperAdmin();
    if (this.canView) this.loadPayments();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  /** Loads (or refreshes) the payments + month summary from the backend. */
  loadPayments(): void {
    this.isLoading = true;
    this.loadError = false;

    forkJoin({
      payments: this.salarySvc.getMyPayments().pipe(catchError(() => of(null))),
      summary:  this.salarySvc.getMySalary().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ payments, summary }) => {
          if (payments === null) {
            this.payments  = [];
            this.loadError = true;
          } else {
            this.payments = payments;
          }
          this.summary   = summary && (summary as UserSalarySummaryDTO).salaryId
            ? (summary as UserSalarySummaryDTO)
            : null;
          this.isLoading = false;
        },
        error: () => {
          this.payments  = [];
          this.summary   = null;
          this.loadError = true;
          this.isLoading = false;
        },
      });
  }

  // ── Month navigation ─────────────────────────────────────────────────────

  /** Selected month key in "YYYY-MM" format. */
  get monthKey(): string {
    return `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`;
  }

  /** "May 2026" */
  get monthLabelSelected(): string {
    return `${this.MONTH_NAMES[this.currentMonth - 1]} ${this.currentYear}`;
  }

  /** Month options (1–12) for the month dropdown. */
  get monthOptions(): { value: number; label: string }[] {
    return this.MONTH_NAMES.map((label, i) => ({ value: i + 1, label }));
  }

  /**
   * Year options — spans every year that has a payment, always including the
   * current year, sorted newest first.
   */
  get availableYears(): number[] {
    const nowYear = new Date().getFullYear();
    const years = new Set<number>([nowYear, this.currentYear]);
    for (const p of this.payments) {
      const y = parseInt((p.paymentMonth ?? '').split('-')[0], 10);
      if (!isNaN(y)) years.add(y);
    }
    const min = Math.min(...years);
    const max = Math.max(...years);
    const full: number[] = [];
    for (let y = max; y >= min; y--) full.push(y);
    return full;
  }

  /** Clamp the selected month back to the current month if the user picks a future one. */
  onPeriodChange(): void {
    const now = new Date();
    if (
      this.currentYear > now.getFullYear() ||
      (this.currentYear === now.getFullYear() && this.currentMonth > now.getMonth() + 1)
    ) {
      this.currentYear  = now.getFullYear();
      this.currentMonth = now.getMonth() + 1;
    }
  }

  /** True when the selected month is the current calendar month (can't go later). */
  get isCurrentMonth(): boolean {
    const now = new Date();
    return this.currentYear === now.getFullYear() && this.currentMonth === now.getMonth() + 1;
  }

  prevMonth(): void {
    if (this.currentMonth === 1) { this.currentMonth = 12; this.currentYear--; }
    else { this.currentMonth--; }
  }

  nextMonth(): void {
    if (this.isCurrentMonth) return;
    if (this.currentMonth === 12) { this.currentMonth = 1; this.currentYear++; }
    else { this.currentMonth++; }
  }

  goCurrentMonth(): void {
    const now = new Date();
    this.currentYear  = now.getFullYear();
    this.currentMonth = now.getMonth() + 1;
  }

  // ── Payments for the selected month ────────────────────────────────────────

  /** Payments belonging to the selected month, newest first. */
  get paymentsForMonth(): SalaryPaymentDTO[] {
    return this.payments
      .filter(p => p.paymentMonth === this.monthKey)
      .sort((a, b) => (b.paymentDate ?? '').localeCompare(a.paymentDate ?? ''));
  }

  // ── Month summary (Total Paid / Balance / Status) ──────────────────────────

  /** The salary summary record for the selected month, if any. */
  get selectedMonthSummary(): MonthlySalarySummaryDTO | null {
    return (this.summary?.monthlySummaries ?? []).find(m => m.month === this.monthKey) ?? null;
  }

  /** Total paid this month — from the summary, or the sum of the month's payments. */
  get totalPaidMonth(): number {
    if (this.selectedMonthSummary) return this.selectedMonthSummary.totalPaid ?? 0;
    return this.paymentsForMonth.reduce((s, p) => s + (p.paymentAmount ?? 0), 0);
  }

  /** Remaining unpaid balance for the month. */
  get balanceMonth(): number {
    return this.selectedMonthSummary?.pendingAmount ?? 0;
  }

  /** "Settled" | "Partial" | "Unpaid" for the month. */
  get statusMonth(): 'Settled' | 'Partial' | 'Unpaid' {
    if (this.totalPaidMonth <= 0) return 'Unpaid';
    return this.balanceMonth <= 0 ? 'Settled' : 'Partial';
  }

  /** True when a payment row is a partial payment. */
  isPartial(p: SalaryPaymentDTO): boolean {
    return (p.paymentType ?? '').toLowerCase() === 'partial';
  }

  // ── Payment receipt ────────────────────────────────────────────────────────

  /**
   * Fetches the receipt PDF for a single payment and opens it in a new browser tab.
   * The backend validates ownership, so only the caller's own receipt can be opened.
   */
  openReceipt(p: SalaryPaymentDTO): void {
    if (this.receiptLoadingId) return;   // one at a time
    this.receiptLoadingId = p.paymentId;

    this.salarySvc.getMyPaymentReceipt(p.paymentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (blob: Blob) => {
          this.receiptLoadingId = null;
          if (!blob || blob.size === 0 || blob.type === 'application/json') {
            this.toastr.error('Receipt could not be opened.', 'Error');
            return;
          }
          const url = URL.createObjectURL(blob);
          const win = window.open(url, '_blank');
          if (!win) {
            // Pop-up blocked — fall back to a direct download.
            const a = document.createElement('a');
            a.href = url;
            a.download = `Payment-Receipt-${p.paymentId}.pdf`;
            a.click();
          }
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        },
        error: () => {
          this.receiptLoadingId = null;
          this.toastr.error('Failed to open the payment receipt.', 'Error');
        },
      });
  }

  // ── Display helpers ────────────────────────────────────────────────────────

  /** "2026-05" → "May 2026" */
  monthLabel(month: string): string {
    if (!month) return '—';
    const [y, m] = month.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return month;
    return `${this.MONTH_NAMES[m - 1]} ${y}`;
  }

  /** ISO datetime → "dd-MM-yyyy" */
  formatDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.split('T')[0];
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
  }

  formatINR(val: number | null | undefined): string {
    return '₹ ' + (val ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
  }

  /** "BaseSalary" → "Base Salary" (shown in the Payment Mode column). */
  paymentModeLabel(sourceName: string | undefined): string {
    if (!sourceName) return '—';
    return sourceName.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  trackByPayment(_i: number, p: SalaryPaymentDTO): number { return p.paymentId; }
}
