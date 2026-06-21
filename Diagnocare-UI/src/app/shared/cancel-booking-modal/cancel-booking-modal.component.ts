import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { patientTest } from 'src/app/models/patientTest/patientTestModel';
import { testDetail } from 'src/app/models/patientTest/testDetailModel';

// ── Exported types ────────────────────────────────────────────────────────────

/** One test-code row derived from a PatientTest booking. */
export interface TestCodeRow {
  /** Individual test code, e.g. "CBC". */
  code:           string;
  /** Unique key: `${booking.patient_Test_Id}:${code}` */
  key:            string;
  /** Parent PatientTest. */
  booking:        patientTest;
  /**
   * This test's share of the booking's net_Amount (after proportional discount).
   * Used as the "Net Price" column.
   */
  pricePerCode:   number;
  /** Refundable amount = proportion × amount_Paid. */
  refundPerCode:  number;
  /** Raw catalog price before any discount (null when prices unavailable). */
  catalogPrice:   number | null;
}

/** All codes belonging to one booking, grouped for display. */
export interface BookingGroup {
  booking:       patientTest;
  rows:          TestCodeRow[];
  /** Count of selected codes for this booking. */
  selectedCount: number;
  /** Proportional refund = (selectedCount / rows.length) * amount_Paid. */
  refundForGroup: number;
}

/** Emitted when user confirms cancellation. */
export interface CancelConfirmPayload {
  /** One entry per affected booking (each booking whose codes were fully/partially selected). */
  bookingCancels: {
    booking:      patientTest;
    selectedCodes: string[];
    /** Proportional refund amount to issue against this booking's receipt. */
    refundAmount: number;
  }[];
  reason:               string | null;
  totalEligibleRefund:  number;
}

// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-cancel-booking-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="visible" (click)="onBackdropClick($event)">
      <div class="modal-panel" (click)="$event.stopPropagation()">

        <!-- ── Header ─────────────────────────────────────────────── -->
        <div class="modal-header">
          <div class="modal-header-icon">
            <i class="fa fa-ban"></i>
          </div>
          <div class="modal-header-text">
            <h3 class="modal-title">Cancel Test(s)</h3>
            <p class="modal-subtitle">
              Select the individual test(s) you want to cancel.
              Refund will be calculated proportionally.
            </p>
          </div>
          <button class="modal-close-btn" (click)="onCancel()" [disabled]="isSaving" title="Close">
            <i class="fa fa-times"></i>
          </button>
        </div>

        <!-- ── Body ──────────────────────────────────────────────── -->
        <div class="modal-body">

          <!-- Select-all bar -->
          <div class="select-all-bar" *ngIf="allRows.length > 1">
            <label class="select-all-label">
              <input type="checkbox"
                     [checked]="allSelected"
                     [indeterminate]="someSelected && !allSelected"
                     (change)="toggleAll($event)"
                     [disabled]="isSaving">
              <span>Select All ({{ allRows.length }} test{{ allRows.length !== 1 ? 's' : '' }})</span>
            </label>
            <span class="selected-count-chip" *ngIf="selectedKeys.size > 0">
              {{ selectedKeys.size }} selected
            </span>
          </div>

          <!-- ── Booking groups ────────────────────────────────── -->
          <div class="booking-groups">
            <div *ngFor="let group of bookingGroups" class="booking-group">

              <!-- Booking header -->
              <div class="booking-group-header">
                <span class="booking-id-badge">
                  <i class="fa fa-flask"></i> Booking #{{ group.booking.patient_Test_Id }}
                </span>
                <span class="booking-date" *ngIf="group.booking.registration_Date">
                  <i class="fa fa-calendar"></i> {{ group.booking.registration_Date }}
                </span>
                <!-- Per-booking select-all -->
                <label class="booking-select-all" *ngIf="group.rows.length > 1" (click)="$event.stopPropagation()">
                  <input type="checkbox"
                         [checked]="group.selectedCount === group.rows.length"
                         [indeterminate]="group.selectedCount > 0 && group.selectedCount < group.rows.length"
                         (change)="toggleBookingAll(group, $event)"
                         [disabled]="isSaving">
                  <span>All</span>
                </label>
              </div>

              <!-- Individual test code rows -->
              <div *ngFor="let row of group.rows"
                   class="test-code-row"
                   [class.test-code-row--selected]="isSelected(row)"
                   (click)="!isSaving && toggleRow(row)">

                <label class="code-checkbox" (click)="$event.stopPropagation()">
                  <input type="checkbox"
                         [checked]="isSelected(row)"
                         (change)="toggleRow(row)"
                         [disabled]="isSaving">
                </label>

                <div class="code-info">
                  <span class="code-name">{{ row.code }}</span>
                </div>

                <div class="code-amounts">
                  <!-- Catalog price (original, before discount) -->
                  <div class="code-amt-row" *ngIf="row.catalogPrice !== null && row.catalogPrice !== row.pricePerCode">
                    <span class="code-amt-label">Test Price</span>
                    <span class="code-amt-value catalog-val">₹{{ row.catalogPrice | number:'1.2-2' }}</span>
                  </div>
                  <!-- Net price (after proportional discount) -->
                  <div class="code-amt-row">
                    <span class="code-amt-label">Net Amount</span>
                    <span class="code-amt-value price-val">₹{{ row.pricePerCode | number:'1.2-2' }}</span>
                  </div>
                  <!-- Eligible refund (proportional to what was paid) -->
                  <div class="code-amt-row refund-amt-row" *ngIf="row.refundPerCode > 0">
                    <span class="code-amt-label">Eligible Refund</span>
                    <span class="code-amt-value refund-val">₹{{ row.refundPerCode | number:'1.2-2' }}</span>
                  </div>
                  <span class="no-payment-tag" *ngIf="row.refundPerCode === 0">No payment</span>
                </div>
              </div>

              <!-- Per-booking refund subtotal -->
              <div class="booking-refund-subtotal" *ngIf="group.selectedCount > 0 && group.refundForGroup > 0">
                <i class="fa fa-undo"></i>
                Refund for Booking #{{ group.booking.patient_Test_Id }}:
                <strong>₹{{ group.refundForGroup | number:'1.2-2' }}</strong>
                ({{ group.selectedCount }} of {{ group.rows.length }} test{{ group.rows.length !== 1 ? 's' : '' }})
              </div>

            </div>
          </div>

          <!-- ── Total refund summary ──────────────────────────── -->
          <div class="refund-summary" *ngIf="totalEligibleRefund > 0 && selectedKeys.size > 0">
            <div class="refund-summary-row">
              <span class="refund-summary-label">
                <i class="fa fa-undo"></i>
                Total eligible refund ({{ selectedKeys.size }} test{{ selectedKeys.size !== 1 ? 's' : '' }})
              </span>
              <span class="refund-summary-amount">₹{{ totalEligibleRefund | number:'1.2-2' }}</span>
            </div>
            <p class="refund-note">Refund will be processed automatically on confirmation.</p>
          </div>

          <!-- No selection warning -->
          <div class="no-selection-warn" *ngIf="selectedKeys.size === 0 && allRows.length > 1">
            <i class="fa fa-exclamation-triangle"></i> Select at least one test to cancel.
          </div>

          <!-- Irreversible warning -->
          <div class="cancel-warning" *ngIf="selectedKeys.size > 0">
            <i class="fa fa-exclamation-triangle"></i>
            Cancellation cannot be undone.
            <span *ngIf="totalEligibleRefund === 0">No refund will be processed (no payment on record).</span>
          </div>

          <!-- Reason -->
          <div class="form-group">
            <label class="form-label">Reason <span class="optional-tag">(optional)</span></label>
            <textarea class="form-textarea"
                      [(ngModel)]="reason"
                      placeholder="Enter reason for cancellation..."
                      rows="2"
                      maxlength="500"
                      [disabled]="isSaving">
            </textarea>
            <span class="char-count">{{ reason.length }}/500</span>
          </div>

          <div class="error-msg" *ngIf="errorMessage">
            <i class="fa fa-exclamation-circle"></i> {{ errorMessage }}
          </div>
        </div>

        <!-- ── Footer ────────────────────────────────────────────── -->
        <div class="modal-footer">
          <button class="btn btn-outline" (click)="onCancel()" [disabled]="isSaving">
            Keep Booking{{ tests.length > 1 ? 's' : '' }}
          </button>
          <button class="btn btn-danger"
                  (click)="onConfirm()"
                  [disabled]="isSaving || selectedKeys.size === 0">
            <span *ngIf="!isSaving">
              <i class="fa fa-ban"></i>
              Cancel {{ selectedKeys.size }} Test{{ selectedKeys.size !== 1 ? 's' : '' }}
              <span *ngIf="totalEligibleRefund > 0"> &amp; Refund ₹{{ totalEligibleRefund | number:'1.2-2' }}</span>
            </span>
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
      width: min(580px, 96vw);
      max-height: 88vh;
      display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
      overflow: hidden;
      animation: slideUp .2s ease;
    }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

    /* Header */
    .modal-header {
      display: flex; align-items: center; gap: 12px;
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--color-border, #e2e8f0);
      flex-shrink: 0;
    }
    .modal-header-icon {
      width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
      background: #fee2e2; color: #dc2626;
      display: flex; align-items: center; justify-content: center; font-size: 1rem;
    }
    .modal-header-text { flex: 1; min-width: 0; }
    .modal-title  { margin: 0; font-size: 1.05rem; font-weight: 700; color: var(--color-text, #1e293b); }
    .modal-subtitle { margin: 3px 0 0; font-size: .8rem; color: var(--color-text-muted, #64748b); line-height: 1.4; }
    .modal-close-btn {
      background: none; border: none; cursor: pointer; padding: 4px 8px;
      font-size: 1rem; color: var(--color-text-muted, #64748b); border-radius: 6px;
      transition: background .15s; flex-shrink: 0;
    }
    .modal-close-btn:hover { background: var(--color-border, #e2e8f0); }

    /* Body */
    .modal-body {
      padding: 16px 20px; overflow-y: auto; flex: 1;
      display: flex; flex-direction: column; gap: 12px;
    }

    /* Select-all bar */
    .select-all-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 12px;
      background: var(--color-surface-alt, #f8fafc);
      border: 1px solid var(--color-border, #e2e8f0); border-radius: 8px;
    }
    .select-all-label {
      display: flex; align-items: center; gap: 8px;
      font-size: .875rem; font-weight: 600; cursor: pointer;
      color: var(--color-text, #1e293b);
    }
    .selected-count-chip {
      font-size: .78rem; font-weight: 700;
      background: #dbeafe; color: #1d4ed8;
      padding: 2px 10px; border-radius: 20px;
    }

    /* Booking groups */
    .booking-groups { display: flex; flex-direction: column; gap: 14px; }

    .booking-group {
      border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 10px; overflow: hidden;
    }

    .booking-group-header {
      display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
      padding: 9px 12px;
      background: var(--color-surface-alt, #f8fafc);
      border-bottom: 1px solid var(--color-border, #e2e8f0);
    }
    .booking-id-badge {
      font-size: .8rem; font-weight: 700; color: #1e40af;
      background: #dbeafe; padding: 2px 9px; border-radius: 6px;
    }
    .booking-date {
      font-size: .78rem; color: var(--color-text-muted, #64748b);
    }
    .booking-select-all {
      margin-left: auto;
      display: flex; align-items: center; gap: 5px;
      font-size: .78rem; font-weight: 600; cursor: pointer;
      color: var(--color-text-muted, #64748b);
    }

    /* Individual test-code rows */
    .test-code-row {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--color-border, #f1f5f9);
      cursor: pointer;
      transition: background .12s;
    }
    .test-code-row:last-child { border-bottom: none; }
    .test-code-row:hover { background: #fef2f2; }
    .test-code-row--selected { background: #fff5f5; }

    .code-checkbox { flex-shrink: 0; }
    .code-checkbox input { width: 15px; height: 15px; cursor: pointer; }

    .code-info { flex: 1; min-width: 0; }
    .code-name {
      font-size: .9rem; font-weight: 700;
      color: var(--color-text, #1e293b);
      letter-spacing: .01em;
    }

    /* Amount column */
    .code-amounts { flex-shrink: 0; text-align: right; min-width: 130px; }
    .code-amt-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .refund-amt-row { margin-top: 3px; }
    .code-amt-label {
      font-size: .7rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: .04em; color: var(--color-text-muted, #64748b);
    }
    .code-amt-value { font-size: .85rem; font-weight: 700; }
    .catalog-val { color: #94a3b8; text-decoration: line-through; font-weight: 500; font-size: .8rem; }
    .price-val   { color: #374151; }
    .refund-val  { color: #2563eb; }
    .no-payment-tag { font-size: .74rem; color: #94a3b8; font-style: italic; }

    /* Per-booking refund subtotal */
    .booking-refund-subtotal {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding: 8px 12px;
      background: #eff6ff; border-top: 1px solid #bfdbfe;
      font-size: .82rem; color: #1e40af;
    }

    /* Total refund summary */
    .refund-summary {
      background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px;
      padding: 12px 14px;
    }
    .refund-summary-row {
      display: flex; justify-content: space-between; align-items: center;
      font-size: .9rem; font-weight: 700;
    }
    .refund-summary-label { color: #1e40af; display: flex; align-items: center; gap: 7px; }
    .refund-summary-amount { color: #1d4ed8; font-size: 1rem; }
    .refund-note { margin: 5px 0 0; font-size: .78rem; color: #3b82f6; }

    /* Warnings */
    .no-selection-warn {
      display: flex; align-items: center; gap: 8px;
      background: #fffbeb; border: 1px solid #fbbf24; border-radius: 8px;
      padding: 10px 14px; font-size: .875rem; color: #92400e;
    }
    .cancel-warning {
      display: flex; align-items: flex-start; gap: 8px;
      background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px;
      padding: 10px 14px; font-size: .875rem; color: #92400e;
    }

    /* Form */
    .form-group { display: flex; flex-direction: column; gap: 5px; }
    .form-label { font-size: .875rem; font-weight: 600; color: var(--color-text, #1e293b); }
    .optional-tag { font-weight: 400; font-size: .8rem; color: var(--color-text-muted, #64748b); }
    .form-textarea {
      width: 100%; border: 1px solid var(--color-border, #e2e8f0);
      border-radius: 8px; padding: 9px 11px; font-size: .875rem;
      resize: vertical; font-family: inherit; box-sizing: border-box;
      transition: border-color .15s;
    }
    .form-textarea:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
    .form-textarea:disabled { background: #f8fafc; opacity: .6; }
    .char-count { font-size: .75rem; color: var(--color-text-muted, #64748b); text-align: right; }

    .error-msg {
      display: flex; align-items: center; gap: 8px; color: #dc2626;
      font-size: .875rem; background: #fee2e2; border-radius: 6px; padding: 10px 12px;
    }

    /* Footer */
    .modal-footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 20px; border-top: 1px solid var(--color-border, #e2e8f0);
      background: var(--color-surface-alt, #f8fafc); flex-shrink: 0;
    }
    .btn {
      padding: 9px 18px; border-radius: 8px; font-size: .875rem;
      font-weight: 600; cursor: pointer; border: none; transition: all .15s;
      display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
    }
    .btn:disabled { opacity: .6; cursor: not-allowed; }
    .btn-outline {
      background: transparent; border: 1px solid var(--color-border, #e2e8f0);
      color: var(--color-text, #1e293b);
    }
    .btn-outline:hover:not(:disabled) { background: var(--color-border, #e2e8f0); }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }
  `]
})
export class CancelBookingModalComponent implements OnChanges {
  @Input() visible            = false;
  @Input() tests: patientTest[] = [];
  @Input() preSelectedTestId  = '';
  /**
   * testCode → testDetail (contains `price`) for all pending bookings.
   * Fetched by the parent before opening the modal.
   * When empty the modal falls back to proportional (net_Amount / count).
   */
  @Input() testDetails: Map<string, testDetail> = new Map();

  @Output() confirmed = new EventEmitter<CancelConfirmPayload>();
  @Output() cancelled = new EventEmitter<void>();

  selectedKeys = new Set<string>();
  reason       = '';
  isSaving     = false;
  errorMessage = '';

  // ── Derived data ──────────────────────────────────────────────────────────

  /** Flat list of all individual test-code rows across all bookings. */
  get allRows(): TestCodeRow[] {
    return this.bookingGroups.flatMap(g => g.rows);
  }

  get bookingGroups(): BookingGroup[] {
    return this.tests.map(booking => {
      const codes = (booking.test_Id || '')
        .split(',').map(c => c.trim()).filter(Boolean);

      const receipt   = booking.bill_Reciept;
      const netAmount = receipt?.net_Amount  ?? 0;
      const amtPaid   = receipt?.amount_Paid ?? 0;

      // ── Per-test net amount calculation ───────────────────────────────
      //   proportion = test_price / gross_total
      //   netPerCode = proportion × net_Amount   (discount distributed by price weight)
      //
      //   Refund rule:
      //   • Partial selection → refund = netPerCode for each selected test
      //   • All tests selected → refund = amount_Paid (everything collected)
      //
      //   Fallback: equal split when catalog prices are unavailable.

      // Resolve each test code to a numeric price (0 when unavailable)
      const prices: number[] = codes.map(code => this.testDetails.get(code)?.price ?? 0);
      const hasPrices: boolean = prices.some(p => p > 0);

      // Gross total = sum of all catalog prices for this booking
      const grossTotal: number = hasPrices
        ? prices.reduce((s: number, p: number) => s + p, 0)
        : 0;

      // Fallback: use net_Amount or (paid + pending) when prices unavailable
      const fallbackBase = netAmount > 0
        ? netAmount
        : (amtPaid + (receipt?.amount_Pending ?? 0));

      const rows: TestCodeRow[] = codes.map((code, i) => {
        let proportion: number;

        if (hasPrices && grossTotal > 0) {
          // Real-price proportion
          proportion = prices[i] / grossTotal;
        } else {
          // Equal split fallback
          proportion = codes.length > 0 ? 1 / codes.length : 1;
        }

        // Net amount for this specific test (after proportional discount distribution).
        // This is always shown as the "eligible refund" per individual test.
        const netPerCode = parseFloat((proportion * (netAmount || fallbackBase)).toFixed(2));

        // Raw catalog price for display (shown struck-through when discount applies)
        const catalogPrice: number | null = hasPrices ? prices[i] : null;

        return {
          code,
          key:           `${booking.patient_Test_Id}:${code}`,
          booking,
          pricePerCode:  netPerCode,   // net amount for this test (after proportional discount)
          refundPerCode: netPerCode,   // same — individual-test refund = its net amount
          catalogPrice,                // raw catalog price (before discount)
        };
      });

      const selectedCount = rows.filter(r => this.selectedKeys.has(r.key)).length;
      const allSelected   = selectedCount === rows.length;

      // ── Refund rule ───────────────────────────────────────────────────────
      //   All tests selected  → refund = amount_paid (everything collected)
      //   Partial selection   → refund = sum of net amounts for selected tests only
      const refundForGroup = allSelected
        ? parseFloat(amtPaid.toFixed(2))
        : parseFloat(
            rows
              .filter(r => this.selectedKeys.has(r.key))
              .reduce((s, r) => s + r.pricePerCode, 0)
              .toFixed(2)
          );

      return { booking, rows, selectedCount, refundForGroup };
    });
  }

  get allSelected(): boolean {
    return this.allRows.length > 0 && this.selectedKeys.size === this.allRows.length;
  }

  get someSelected(): boolean {
    return this.selectedKeys.size > 0 && this.selectedKeys.size < this.allRows.length;
  }

  get totalEligibleRefund(): number {
    return parseFloat(
      this.bookingGroups.reduce((sum, g) => sum + g.refundForGroup, 0).toFixed(2)
    );
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.reason      = '';
      this.errorMessage = '';
      this.isSaving    = false;
      this.selectedKeys = new Set<string>();

      // Pre-select test codes from the clicked booking
      if (this.preSelectedTestId) {
        const targetBooking = this.tests.find(t => t.patient_Test_Id === this.preSelectedTestId);
        if (targetBooking) {
          const codes = (targetBooking.test_Id || '').split(',').map(c => c.trim()).filter(Boolean);
          codes.forEach(code => {
            this.selectedKeys.add(`${this.preSelectedTestId}:${code}`);
          });
          this.selectedKeys = new Set(this.selectedKeys);
        }
      } else if (this.tests.length === 1) {
        // Single booking → auto-select all its codes
        const b     = this.tests[0];
        const codes = (b.test_Id || '').split(',').map(c => c.trim()).filter(Boolean);
        codes.forEach(code => this.selectedKeys.add(`${b.patient_Test_Id}:${code}`));
        this.selectedKeys = new Set(this.selectedKeys);
      }
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────

  isSelected(row: TestCodeRow): boolean {
    return this.selectedKeys.has(row.key);
  }

  toggleRow(row: TestCodeRow): void {
    if (this.isSaving) return;
    const next = new Set(this.selectedKeys);
    next.has(row.key) ? next.delete(row.key) : next.add(row.key);
    this.selectedKeys = next;
  }

  toggleAll(event: Event): void {
    if (this.isSaving) return;
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedKeys = checked
      ? new Set(this.allRows.map(r => r.key))
      : new Set<string>();
  }

  toggleBookingAll(group: BookingGroup, event: Event): void {
    if (this.isSaving) return;
    const checked = (event.target as HTMLInputElement).checked;
    const next    = new Set(this.selectedKeys);
    group.rows.forEach(r => checked ? next.add(r.key) : next.delete(r.key));
    this.selectedKeys = next;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  onConfirm(): void {
    if (this.isSaving || this.selectedKeys.size === 0) return;
    this.isSaving    = true;
    this.errorMessage = '';

    // Build per-booking cancel items (only include bookings with ≥1 selected code)
    const bookingCancels = this.bookingGroups
      .filter(g => g.selectedCount > 0)
      .map(g => ({
        booking:       g.booking,
        selectedCodes: g.rows.filter(r => this.selectedKeys.has(r.key)).map(r => r.code),
        refundAmount:  g.refundForGroup,
      }));

    this.confirmed.emit({
      bookingCancels,
      reason:              this.reason.trim() || null,
      totalEligibleRefund: this.totalEligibleRefund,
    });
  }

  setError(msg: string): void {
    this.isSaving    = false;
    this.errorMessage = msg;
  }

  onCancel(): void { this.cancelled.emit(); }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) this.onCancel();
  }
}
