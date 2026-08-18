import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { SalaryService } from 'src/app/services/salaryServices/salary.service';
import { MemberService } from 'src/app/services/memberService/member.service';
import { MemberDto } from 'src/app/models/member/member.dto';
import { filterActiveMembers, isActiveByDate } from 'src/app/shared/member-utils';
import {
  SalaryStatus,
  PaymentFor,
  PaymentForLabels,
  PaymentType,
  SalaryRecordDTO,
  MonthlySalaryResponseDTO,
  UserSalaryConfigDTO,
  AddPaymentDTO,
  SaveSalaryConfigDTO,
  CalculatePayableSalaryDTO,
} from 'src/app/models/salary/salary.dto';

@Component({
  selector: 'app-salary',
  templateUrl: './salary.component.html',
  styleUrls: ['./salary.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent, DatePickerComponent],
  providers: [CurrencyPipe, DatePipe],
})
export class SalaryComponent implements OnInit, OnDestroy {

  // ── Tab state ──────────────────────────────────────────────────────────────
  activeTab: 'monthly' | 'config' = 'monthly';

  // ── Month navigation ───────────────────────────────────────────────────────
  currentYear  = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;

  readonly MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  get monthLabel(): string {
    return `${this.MONTH_NAMES[this.currentMonth - 1]} ${this.currentYear}`;
  }

  get isCurrentMonth(): boolean {
    const now = new Date();
    return this.currentYear === now.getFullYear() && this.currentMonth === now.getMonth() + 1;
  }

  /** True when the displayed month is exactly the calendar month before today. */
  get isLastMonth(): boolean {
    const now = new Date();
    // getMonth() is 0-indexed, so getMonth() alone = previous month in 1-indexed form
    let lm = now.getMonth()+1;        // e.g. May(4) → 4 = April in 1-indexed
    let ly = now.getFullYear();
    if (lm === 0) { lm = 12; ly--; }  // January edge-case → December of prev year
    return this.currentYear === ly && this.currentMonth === lm;
  }

  /**
   * True when the Calculate Payable Salary option should be shown:
   * - Any past month (before the current calendar month), OR
   * - The current month, but only on the last day of that month.
   */
  get shouldShowCalc(): boolean {
    const now        = new Date();
    const todayYear  = now.getFullYear();
    const todayMonth = now.getMonth() + 1; // 1-indexed

    // Past month: displayed month is strictly before today's month
    if (
      this.currentYear < todayYear ||
      (this.currentYear === todayYear && this.currentMonth < todayMonth)
    ) {
      return true;
    }

    // Current month: only on the last day
    if (this.currentYear === todayYear && this.currentMonth === todayMonth) {
      const lastDay = new Date(todayYear, todayMonth, 0).getDate(); // day-0 of next month = last day of this month
      return now.getDate() === lastDay;
    }

    return false;
  }

  // ── Inactive toggle ────────────────────────────────────────────────────────
  showInactive = false;

  toggleInactive(): void {
    this.showInactive = !this.showInactive;
    // No reload — all employees are already in monthlyData.
    // filteredRecords recomputes automatically from showInactive.
    this.closePanel();
  }

  // ── Monthly salary state ───────────────────────────────────────────────────
  monthlyData:   MonthlySalaryResponseDTO | null = null;
  isLoading      = false;
  isGenerating   = false;
  spinnerMessage = 'Loading salary data…';
  searchTerm     = '';

  // ── Role filter ────────────────────────────────────────────────────────────
  roleFilter: 'all' | 'doctor' | 'collection-boy' | 'other' = 'other';

  setRoleFilter(f: 'all' | 'doctor' | 'collection-boy' | 'other'): void {
    this.roleFilter = f;
  }

  get filteredRecords(): SalaryRecordDTO[] {
    let employees = this.monthlyData?.employees ?? [];

    // Active/inactive filter — client-side via member-utils
    if (!this.showInactive) employees = employees.filter(r => isActiveByDate(r.deactivatedAt));

    // Role filter
    if (this.roleFilter === 'doctor')              employees = employees.filter(r => r.typeUserId === 6);
    else if (this.roleFilter === 'collection-boy') employees = employees.filter(r => r.typeUserId === 5);
    else if (this.roleFilter === 'other')          employees = employees.filter(r => [1, 2, 3].includes(r.typeUserId));

    // Name search
    if (!this.searchTerm.trim()) return employees;
    const q = this.searchTerm.toLowerCase();
    return employees.filter(r => r.fullName.toLowerCase().includes(q));
  }

  /**
   * The three header cards must satisfy payable − paid = pending.
   *
   * That only holds against `netPayableSalary` (leave-adjusted). `netSalary` is the
   * fixed contract figure and carries PF on the full base, whereas `pendingAmount`
   * is derived from the leave-adjusted base with PF recomputed on it — so summing
   * `netSalary` here left the cards out by the leave deduction net of PF relief,
   * which showed up most obviously as "pending ≠ payable" on a month with nothing paid.
   */
  get displayTotals(): { payable: number; paid: number; pending: number } {
    const recs = this.filteredRecords;
    return {
      payable: recs.reduce((s, r) => s + this.netPayableOf(r),   0),
      paid:    recs.reduce((s, r) => s + (r.totalPaid     ?? 0),  0),
      pending: recs.reduce((s, r) => s + (r.pendingAmount ?? 0),  0),
    };
  }

  /**
   * Amount owed for the displayed month. Falls back to the contract net salary only
   * when the server sent no month-scoped figure — with no leave deduction the two
   * are equal anyway, so the fallback never introduces a discrepancy.
   */
  private netPayableOf(rec: SalaryRecordDTO): number {
    return rec.netPayableSalary ?? rec.netSalary ?? 0;
  }

  get isMonthGenerated(): boolean {
    const employees = this.monthlyData?.employees ?? [];
    return employees.length > 0 && employees.every(r => r.salaryId > 0);
  }

  // ── Payment panel ──────────────────────────────────────────────────────────
  panelRecord:      SalaryRecordDTO | null = null;
  isPanelOpen       = false;
  isAddingPayment   = false;
  paymentForm: AddPaymentDTO = this.blankPaymentForm();
  paymentAmountError = '';
  /** Locks the amount field when Pay Full auto-calculates the value. */
  isFullPaymentAmountLocked  = false;
  /** True while the Pay Full button is fetching the calculated salary. */
  isCalculatingForPayment    = false;
  /** Stored result from calculatePayableSalary — used to show adjusted net in the Pay Full modal. */
  fullPaymentCalcResult: CalculatePayableSalaryDTO | null = null;

  /**
   * The month's net payable: payableBaseSalary + TA + OA − PF.
   *
   * The PF term must come from the calculation result, not from the record: the
   * record's `pfAmount` is contract PF on the FULL base, while `payableBaseSalary`
   * has already had the leave deduction taken off it. Mixing the two subtracted PF
   * against a base that no longer existed and understated the net by
   * (leaveDeduction x pfPercentage).
   */
  get displayNetSalary(): number {
    if (this.fullPaymentCalcResult && this.panelRecord) {
      return this.fullPaymentCalcResult.netPayableSalary
          ?? (this.fullPaymentCalcResult.payableBaseSalary +
              (this.panelRecord.travelAllowance ?? 0) +
              (this.panelRecord.otherAllowance  ?? 0) -
              (this.fullPaymentCalcResult.pfAmount ?? 0));
    }
    return this.panelRecord ? this.netPayableOf(this.panelRecord) : 0;
  }

  /**
   * Pending = displayNetSalary − totalPaid.
   * In Full Payment mode displayNetSalary is leave-deduction-adjusted,
   * so this always reflects the true outstanding amount.
   */
  get displayPendingAmount(): number {
    if (!this.panelRecord) return 0;
    return Math.max(0, this.displayNetSalary - (this.panelRecord.totalPaid ?? 0));
  }

  readonly PaymentType = PaymentType;

  private blankPaymentForm(): AddPaymentDTO {
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      salaryId:      0,
      paymentAmount: 0,
      paymentMonth:  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      paymentDate:   iso,
      reference:     '',
      paymentFor:    PaymentFor.BaseSalary,
      paymentType:   PaymentType.Partial,
    };
  }

  readonly paymentForOptions: { value: PaymentFor; label: string }[] = [
    { value: PaymentFor.BaseSalary,      label: PaymentForLabels[PaymentFor.BaseSalary] },
    { value: PaymentFor.TravelAllowance, label: PaymentForLabels[PaymentFor.TravelAllowance] },
    { value: PaymentFor.OtherAllowance,  label: PaymentForLabels[PaymentFor.OtherAllowance] },
  ];

  /**
   * Options for the Payment For picker. "All Components" is offered on Full
   * payments only — it means "settle the whole month", and is meaningless for a
   * Partial payment, where the amount has to belong to one component.
   */
  get visiblePaymentForOptions(): { value: PaymentFor; label: string }[] {
    return this.paymentForm.paymentType === PaymentType.Full
      ? [...this.paymentForOptions,
         { value: PaymentFor.AllComponents, label: PaymentForLabels[PaymentFor.AllComponents] }]
      : this.paymentForOptions;
  }

  /** True while the Full form is set to settle every component at once. */
  get isPayingAllComponents(): boolean {
    return this.paymentForm.paymentType === PaymentType.Full
        && this.paymentForm.paymentFor === PaymentFor.AllComponents;
  }

  /** Returns the display label for a paymentSource numeric value. */
  paymentForLabel(val: PaymentFor | number | undefined): string {
    if (val === undefined || val === null) return '—';
    return PaymentForLabels[val as PaymentFor] ?? '—';
  }

  /**
   * True for a payment written before Full became per-component: type "Full",
   * stored as Base Salary, but for an amount larger than the base-salary
   * component could ever be — i.e. it actually settled the whole month.
   *
   * Those rows are left in the database exactly as they are; this only stops the
   * history mislabelling them as a base-salary payment. New Full payments settle
   * a single component and never trip this check.
   */
  isLegacyFullSalary(pay: { paymentType?: string; paymentSource?: number; paymentAmount?: number }): boolean {
    if (pay?.paymentType !== 'Full') return false;
    if ((pay?.paymentSource ?? PaymentFor.BaseSalary) !== PaymentFor.BaseSalary) return false;

    const rec = this.panelRecord;
    if (!rec) return false;

    // Base-salary component cap for this record — server-supplied and leave-adjusted.
    const baseCap = this.baseSalaryCapOf(rec);
    // Tolerance keeps rounding noise from flagging a legitimate full base payment.
    return baseCap > 0 && (pay.paymentAmount ?? 0) > baseCap + 0.01;
  }

  /** Returns a stable CSS modifier class for a paymentSource numeric value. */
  paymentForClass(val: PaymentFor | number | undefined): string {
    switch (Number(val)) {
      case PaymentFor.BaseSalary:      return 'pay-for-basesalary';
      case PaymentFor.TravelAllowance: return 'pay-for-travelallowance';
      case PaymentFor.OtherAllowance:  return 'pay-for-otherallowance';
      default:                          return '';
    }
  }

  /** Strips the time portion from an ISO datetime string for clean display. */
  formatPaymentDate(isoDate: string | null | undefined): string {
    if (!isoDate) return '—';
    return isoDate.split('T')[0];
  }

  // ── Calculate payable salary modal ────────────────────────────────────────
  calcResult:        CalculatePayableSalaryDTO | null = null;
  calcRecord:        SalaryRecordDTO | null = null;   // source record for TA / OA / PF
  isCalcModalOpen    = false;
  isCalculating      = false;
  calcLoadingUserId: number | null = null;            // tracks which row is loading
  /** Last CalculatePayableSalary failure, shown inline next to the action that failed. */
  calcError          = '';

  // ── HTTP error handling ────────────────────────────────────────────────────

  /**
   * Turns a failed request into a message worth showing, and logs the full
   * response for diagnosis.
   *
   * CalculatePayableSalary has three distinct failure modes that all used to look
   * identical (nothing happened, spinner stopped):
   *   404 — the employee has no salary configured, so there is nothing to calculate
   *   403 — the endpoint is SuperAdminOnly; ErrorInterceptor redirects to /access-denied
   *   500 — the server threw; the real reason is in the API log, keyed by user + month
   *
   * The toast is deliberately left to ErrorInterceptor, which already toasts every
   * non-401/403 failure — toasting here as well would show the user two of them.
   * What was missing was the inline state and the console detail, both below.
   */
  private describeHttpError(err: unknown, context: string): string {
    if (err instanceof HttpErrorResponse) {
      // Full response object first, so devtools shows status, url and the body.
      console.error(`[Salary] ${context} failed`, {
        status:     err.status,
        statusText: err.statusText,
        url:        err.url,
        serverBody: err.error,
        error:      err,
      });

      if (err.status === 0) {
        return 'Could not reach the server. Check your connection and try again.';
      }
      if (err.status === 404) {
        return this.serverMessage(err)
            ?? 'No salary is configured for this employee, so there is nothing to calculate.';
      }
      if (err.status === 403) {
        return 'You do not have permission to calculate payable salary.';
      }
      if (err.status >= 500) {
        return this.serverMessage(err)
            ?? 'The server could not calculate this salary. Please try again shortly.';
      }
      return this.serverMessage(err) ?? `Request failed (${err.status} ${err.statusText}).`;
    }

    // Not an HttpErrorResponse — a bug in our own callback, or a non-HTTP throw.
    console.error(`[Salary] ${context} failed with a non-HTTP error`, err);
    return 'Something went wrong. Please try again.';
  }

  /** Pulls this API's `{ message }` / ProblemDetails text out of an error body. */
  private serverMessage(err: HttpErrorResponse): string | null {
    const body = err.error;
    if (typeof body === 'string' && body.trim() && !body.trim().startsWith('<')) {
      return body.trim();
    }
    if (body && typeof body === 'object') {
      const text = body.message ?? body.detail ?? body.title;
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
    return null;
  }

  /**
   * Net payable = payableBaseSalary + TA + OA − PF.
   * PF comes from calcResult (computed on the leave-reduced base), not from
   * calcRecord.pfAmount (contract PF on the full base) — see displayNetSalary.
   */
  get calcNetPayable(): number {
    if (!this.calcResult || !this.calcRecord) return 0;
    return this.calcResult.netPayableSalary
        ?? (this.calcResult.payableBaseSalary +
            (this.calcRecord.travelAllowance ?? 0) +
            (this.calcRecord.otherAllowance  ?? 0) -
            (this.calcResult.pfAmount        ?? 0));
  }

  openCalcModal(rec: SalaryRecordDTO): void {
    if (this.isCalculating) return;
    this.isCalculating     = true;
    this.calcLoadingUserId = rec.userId;
    this.calcError         = '';

    this.salarySvc.calculatePayableSalary(rec.userId, this.currentYear, this.currentMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          this.calcResult        = result;
          this.calcRecord        = rec;
          this.isCalcModalOpen   = true;
          this.isCalculating     = false;
          this.calcLoadingUserId = null;
          this.calcError         = '';
        },
        error: (err: unknown) => {
          this.isCalculating     = false;
          this.calcLoadingUserId = null;
          this.calcResult        = null;
          this.calcRecord        = null;
          this.isCalcModalOpen   = false;
          this.calcError = this.describeHttpError(
            err,
            `CalculatePayableSalary(userId=${rec.userId}, ${this.currentYear}-${this.currentMonth})`);
        },
      });
  }

  closeCalcModal(): void {
    this.isCalcModalOpen = false;
    this.calcResult      = null;
    this.calcRecord      = null;
  }

  // ── Salary config state ────────────────────────────────────────────────────
  userList: MemberDto[] = [];

  get filteredUserList(): MemberDto[] {
    const eligible = this.userList.filter(u =>
      u.typeUserId !== 4 &&
      u.last_Name?.toLowerCase() !== 'admin'
    );
    if (!this.userSearchTerm.trim()) return eligible;
    const q = this.userSearchTerm.toLowerCase();
    return eligible.filter(u =>
      (`${u.first_Name} ${u.last_Name}`).toLowerCase().includes(q) ||
      u.user_Name?.toLowerCase().includes(q)
    );
  }

  configList: UserSalaryConfigDTO[] = [];
  isLoadingConfigTab = false;
  isSavingConfig     = false;

  selectedConfigUserId: number | null = null;
  userSearchTerm = '';
  isDropdownOpen = false;

  get selectedUserConfig(): UserSalaryConfigDTO | null {
    if (!this.selectedConfigUserId) return null;
    return this.configList.find(c => c.userId === this.selectedConfigUserId) ?? null;
  }

  get isNewConfig(): boolean {
    return !!this.selectedConfigUserId && !this.selectedUserConfig;
  }

  isEditingConfig = false;

  configDraft: SaveSalaryConfigDTO = {
    userId:                 0,
    baseSalary:             0,
    pfPercentage:           12,
    travelAllowance:        0,
    otherAllowance:         0,
    allowedLeavesPerMonth:  1,
    salaryType:             0,
    revenuePercentage:      null,
  };

  // ── Config live preview computations ──────────────────────────────────────
  // Preview figures mirror SalaryRepository.AddOrUpdateUserSalaryAsync exactly —
  // inputs snapped to whole rupees first, then PF charged on the snapped base — so
  // the card cannot show one number and the saved record hold another.
  get draftPfAmount(): number {
    return Math.round((Math.round(this.configDraft.baseSalary ?? 0) * (this.configDraft.pfPercentage ?? 0)) / 100);
  }
  get draftGrossSalary(): number {
    return Math.round(this.configDraft.baseSalary ?? 0)
         + Math.round(this.configDraft.travelAllowance ?? 0)
         + Math.round(this.configDraft.otherAllowance  ?? 0);
  }
  /** Net = gross − PF on base. PF is only on base salary, not allowances. */
  get draftNetPayable(): number {
    return this.draftGrossSalary - this.draftPfAmount;
  }

  /**
   * Revenue-% salary is deferred to phase 2, so its configuration card is hidden.
   *
   * Nothing else is removed: the DTO field, the salaryType derivation, the
   * backend column and any values already configured all stay exactly as they
   * are. An employee previously set up on a revenue % keeps that setup and it
   * round-trips untouched through a save — this only stops NEW ones being
   * configured. Flip this to true to bring the feature back.
   */
  readonly revenuePercentEnabled = false;

  get hasFixedComponent(): boolean  { return (this.configDraft.baseSalary ?? 0) > 0; }
  get hasPercentComponent(): boolean { return (this.configDraft.revenuePercentage ?? 0) > 0; }

  // ── Existing config net (for view card) ───────────────────────────────────
  configNetSalary(cfg: UserSalaryConfigDTO): number {
    return (cfg.baseSalary ?? 0)
         + (cfg.travelAllowance ?? 0)
         + (cfg.otherAllowance  ?? 0)
         - (cfg.pfAmount        ?? 0);
  }

  get selectedUserName(): string {
    if (!this.selectedConfigUserId) return '';
    const u = this.userList.find(x => x.id === this.selectedConfigUserId);
    return u ? this.fullName(u) : '';
  }

  readonly SalaryStatus = SalaryStatus;

  private destroy$ = new Subject<void>();

  constructor(
    private salarySvc: SalaryService,
    private memberSvc: MemberService,
    private toastr:    ToastrService,
  ) {}

  ngOnInit(): void {
    this.loadMonthly();
    this.loadConfigTab(); // prefetch in background so config tab is instant
  }

  // ── Tab switching ──────────────────────────────────────────────────────────

  switchTab(tab: 'monthly' | 'config'): void {
    this.activeTab = tab;
    this.closePanel();
    // Reload only if prefetch hasn't started or failed (isLoadingConfigTab = false AND list empty)
    if (tab === 'config' && !this.userList.length && !this.isLoadingConfigTab) {
      this.loadConfigTab();
    }
  }

  // ── Month navigation ───────────────────────────────────────────────────────

  prevMonth(): void {
    if (this.currentMonth === 1) { this.currentMonth = 12; this.currentYear--; }
    else { this.currentMonth--; }
    this.monthlyData = null;
    this.closePanel();
    this.loadMonthly();
  }

  nextMonth(): void {
    if (this.isCurrentMonth) return;
    if (this.currentMonth === 12) { this.currentMonth = 1; this.currentYear++; }
    else { this.currentMonth++; }
    this.monthlyData = null;
    this.closePanel();
    this.loadMonthly();
  }

  // ── Monthly data ───────────────────────────────────────────────────────────

  private loadMonthly(): void {
    this.isLoading      = true;
    this.spinnerMessage = `Loading salary data for ${this.monthLabel}…`;
    this.salarySvc.getMonthlySalary(this.currentYear, this.currentMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          data.employees = (data.employees ?? []).map(r => ({
            ...r,
            status: this.deriveStatus(r),
          }));
          this.monthlyData = data;

          if (this.panelRecord) {
            const fresh = data.employees.find(r => r.userId === this.panelRecord!.userId);
            this.panelRecord = fresh ?? null;
            if (!this.panelRecord) this.closePanel();
          }
          this.isLoading = false;
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isLoading = false;
        },
      });
  }

  private deriveStatus(rec: SalaryRecordDTO): SalaryStatus {
    if (rec.isFullyPaid)            return SalaryStatus.Paid;
    if ((rec.totalPaid ?? 0) > 0)   return SalaryStatus.PartiallyPaid;
    return SalaryStatus.Pending;
  }

  // ── Generate salary ────────────────────────────────────────────────────────

  // generateSalary(): void {
  //   if (this.isGenerating) return;
  //   this.isGenerating = true;
  //   this.salarySvc.generateSalary({ month: this.currentMonth, year: this.currentYear })
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe({
  //       next: () => {
  //         this.toastr.success(`Salary generated for ${this.monthLabel}.`, 'Done');
  //         this.isGenerating = false;
  //         this.loadMonthly();
  //       },
  //       error: () => {
  //         this.toastr.error('Failed to generate salary.', 'Error');
  //         this.isGenerating = false;
  //       },
  //     });
  // }

  // ── Payment panel ──────────────────────────────────────────────────────────

  openPanel(record: SalaryRecordDTO): void {
    this.panelRecord        = record;
    this.isPanelOpen        = true;
    this.isAddingPayment    = false;
    this.paymentAmountError = '';
    this.paymentForm = {
      ...this.blankPaymentForm(),
      salaryId:     record.salaryId,
      paymentMonth: `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`,
    };
  }

  closePanel(): void {
    this.isPanelOpen               = false;
    this.panelRecord               = null;
    this.isAddingPayment           = false;
    this.isFullPaymentAmountLocked = false;
    this.fullPaymentCalcResult     = null;
  }

  toggleAddPayment(): void {
    if (!this.isAddingPayment && this.panelRecord) {
      // Opening — reset to a blank Partial form (amount intentionally empty)
      this.paymentForm = {
        ...this.blankPaymentForm(),
        salaryId:      this.panelRecord.salaryId,
        paymentMonth:  `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`,
        paymentAmount: null as unknown as number,   // renders as blank in the number input
        paymentFor:    PaymentFor.BaseSalary,
        paymentType:   PaymentType.Partial,
      };
    }
    this.isAddingPayment           = !this.isAddingPayment;
    this.isFullPaymentAmountLocked = false;
    this.fullPaymentCalcResult     = null;
    this.paymentAmountError        = '';
  }

  /**
   * Pay Full: calls CalculatePayableSalary to get the deduction-adjusted net,
   * subtracts any payments already recorded, then pre-fills and locks the amount field.
   */
  openFullPayment(): void {
    if (!this.panelRecord || this.isCalculatingForPayment) return;
    this.isCalculatingForPayment = true;
    this.calcError               = '';

    // Captured now: panelRecord can be nulled by the user closing the panel while
    // the request is still in flight, and the error handler still needs the id.
    const userId = this.panelRecord.userId;

    this.salarySvc
      .calculatePayableSalary(userId, this.currentYear, this.currentMonth)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: result => {
          const rec = this.panelRecord;
          // The panel can be closed mid-request; opening the payment form against a
          // record that is no longer on screen would throw on the non-null assertion
          // this used to make.
          if (!rec) {
            this.isCalculatingForPayment = false;
            return;
          }

          this.fullPaymentCalcResult     = result;
          this.isAddingPayment           = true;
          this.isFullPaymentAmountLocked = true;
          this.paymentAmountError        = '';
          this.isCalculatingForPayment   = false;
          this.calcError                 = '';

          // "Full" settles ONE component, so the form opens on Base Salary and the
          // amount is that component's remaining balance. It used to pre-fill the
          // whole month's net and post it as a single Base Salary row, which is why
          // Travel / Other Allowance never showed up in payment history.
          // Switching component re-computes the amount (see onPaymentForChange).
          this.paymentForm = {
            ...this.blankPaymentForm(),
            salaryId:      rec.salaryId,
            paymentMonth:  `${this.currentYear}-${String(this.currentMonth).padStart(2, '0')}`,
            paymentAmount: 0,
            paymentFor:    PaymentFor.BaseSalary,
            paymentType:   PaymentType.Full,
          };
          this.paymentForm.paymentAmount = this.pendingForSelectedType;
        },
        error: (err: unknown) => {
          this.isCalculatingForPayment   = false;
          this.fullPaymentCalcResult     = null;
          this.isAddingPayment           = false;
          this.isFullPaymentAmountLocked = false;
          this.calcError = this.describeHttpError(
            err,
            `CalculatePayableSalary(userId=${userId}, ${this.currentYear}-${this.currentMonth}) for Pay Full`);
        },
      });
  }

  /**
   * Base-salary component cap for a record, leave-adjusted.
   *
   * Prefers the server's `baseSalaryCap`, which is the exact value
   * SalaryService.GetPayableSourceCap enforces on every payment. The local
   * fallback reproduces that formula (base − leave deduction, then PF on the
   * remainder) for older API responses; the previous `baseSalary − pfAmount`
   * ignored the leave deduction entirely and so could exceed the server's cap,
   * which the API then rejected outright.
   */
  private baseSalaryCapOf(rec: SalaryRecordDTO): number {
    if (rec.baseSalaryCap != null) return rec.baseSalaryCap;

    // Fallback mirrors SalaryService.ComputeMonthAmounts, including its rounding:
    // the payable base is snapped to a whole rupee BEFORE PF is charged on it, so
    // rounding only at the end would land a rupee away from the server's cap and
    // get the payment rejected.
    const payableBase = Math.round(
      Math.max(0, (rec.baseSalary ?? 0) - (rec.leaveDeductionAmount ?? 0)));
    const pf = rec.adjustedPfAmount
            ?? (rec.pfPercentage != null
                  ? Math.round(payableBase * rec.pfPercentage / 100)
                  : (rec.pfAmount ?? 0));
    return Math.max(0, payableBase - pf);
  }

  /** Outstanding base-salary balance for the displayed month. */
  private basePendingOf(rec: SalaryRecordDTO): number {
    return rec.baseSalaryPending
        ?? Math.max(0, this.baseSalaryCapOf(rec) - (rec.baseSalaryPaid ?? 0));
  }

  /** Outstanding travel-allowance balance for the displayed month. */
  private travelPendingOf(rec: SalaryRecordDTO): number {
    return rec.travelAllowancePending
        ?? Math.max(0, Math.round(rec.travelAllowance ?? 0) - (rec.travelAllowancePaid ?? 0));
  }

  /** Outstanding other-allowance balance for the displayed month. */
  private otherPendingOf(rec: SalaryRecordDTO): number {
    return rec.otherAllowancePending
        ?? Math.max(0, Math.round(rec.otherAllowance ?? 0) - (rec.otherAllowancePaid ?? 0));
  }

  /**
   * Returns the outstanding (unpaid) amount for whichever PaymentFor component
   * is currently selected in the partial-payment form.
   * Falls back to total pendingAmount for Full payments or unknown types.
   */
  get pendingForSelectedType(): number {
    const rec = this.panelRecord;
    if (!rec) return 0;

    // "All Components" — the sum of what is outstanding across all three.
    if (this.paymentForm.paymentFor === PaymentFor.AllComponents) {
      return this.basePendingOf(rec)
           + this.travelPendingOf(rec)
           + this.otherPendingOf(rec);
    }

    // Per-component for BOTH Partial and Full — Full settles the selected
    // component rather than the whole month.
    {
      switch (this.paymentForm.paymentFor) {
        case PaymentFor.BaseSalary:      return this.basePendingOf(rec);
        case PaymentFor.TravelAllowance: return this.travelPendingOf(rec);
        case PaymentFor.OtherAllowance:  return this.otherPendingOf(rec);
      }
    }

    // No component selected yet — fall back to the month's total pending.
    return rec.pendingAmount ?? 0;
  }

  /** Fills the amount field with the max pending for the selected payment component. */
  fillMaxAmount(): void {
    if (!this.panelRecord) return;
    this.paymentForm.paymentAmount = this.pendingForSelectedType;
    this.onAmountInput();
  }

  /** Re-validate amount whenever the Payment For selection changes. */
  onPaymentForChange(): void {
    this.paymentAmountError = '';

    // Full settles the whole of the chosen component, and its amount field is
    // locked — so it must be re-filled on every switch, not blanked, or the user
    // is left staring at a locked empty box.
    if (this.paymentForm.paymentType === PaymentType.Full) {
      this.paymentForm.paymentAmount = this.pendingForSelectedType;
      return;
    }

    // Partial: clear amount so the user starts fresh for the new component.
    this.paymentForm.paymentAmount = null as unknown as number;
  }

  onAmountInput(): void {
    if (!this.panelRecord) return;

    // Payments are whole rupees. Snapping on input rather than on submit means the
    // field shows the same figure the API will store, instead of silently changing
    // it server-side after the user confirms.
    const raw = this.paymentForm.paymentAmount;
    if (raw != null && !Number.isInteger(raw)) {
      this.paymentForm.paymentAmount = Math.round(raw);
    }

    const amt = this.paymentForm.paymentAmount ?? 0;
    const max = this.pendingForSelectedType;

    if (amt <= 0) {
      this.paymentAmountError = 'Amount must be greater than ₹ 0.';
    } else if (amt > max) {
      const label = this.paymentForm.paymentType === PaymentType.Partial
        ? `${this.paymentForLabel(this.paymentForm.paymentFor)} pending`
        : 'pending';
      this.paymentAmountError =
        `Amount cannot exceed ${label} ₹ ${max.toLocaleString('en-IN')}.`;
    } else {
      this.paymentAmountError = '';
    }
  }

  get paymentFormValid(): boolean {
    return (
      !this.paymentAmountError &&
      (this.paymentForm.paymentAmount ?? 0) > 0 &&
      !!this.paymentForm.paymentDate &&
      // Required for BOTH types now: Full settles a specific component (or all
      // three), so it can no longer be submitted without a choice.
      !!this.paymentForm.paymentFor
    );
  }

  submitPayment(): void {
    if (!this.paymentFormValid || !this.panelRecord) return;
    this.isAddingPayment = false;

    // "All Components" is a UI-only choice — PaymentFor.AllComponents must never
    // reach the payment table as a source. It routes to PayAllComponents, which
    // writes one real row per component so history stays itemised.
    const request$ = this.isPayingAllComponents
      ? this.salarySvc.payAllComponents({
          salaryId:     this.paymentForm.salaryId,
          paymentMonth: this.paymentForm.paymentMonth,
          paymentDate:  this.paymentForm.paymentDate,
          reference:    this.paymentForm.reference ?? null,
        })
      : this.salarySvc.addPayment(this.paymentForm);

    request$
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadMonthly();
          this.isAddingPayment = false;
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isAddingPayment = true;
        },
      });
  }

  // ── Config tab ─────────────────────────────────────────────────────────────

  private loadConfigTab(): void {
    this.isLoadingConfigTab = true;
    forkJoin({
      users:   this.memberSvc.getAll().pipe(catchError(() => of([] as MemberDto[]))),
      configs: this.salarySvc.getSalaryConfig().pipe(catchError(() => of([] as UserSalaryConfigDTO[]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ users, configs }) => {
          // Only active staff are relevant for salary configuration
          this.userList           = filterActiveMembers(users);
          this.configList         = configs;
          this.isLoadingConfigTab = false;
          if (!this.userList.length) this.toastr.warning('Could not load employee list.', 'Warning');
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isLoadingConfigTab = false;
        },
      });
  }

  private refreshConfigs(): void {
    this.salarySvc.getSalaryConfig()
      .pipe(catchError(() => of([] as UserSalaryConfigDTO[])), takeUntil(this.destroy$))
      .subscribe(data => { this.configList = data; });
  }

  // ── User dropdown ──────────────────────────────────────────────────────────

  openDropdown(): void { this.isDropdownOpen = true; this.userSearchTerm = ''; }

  closeDropdown(): void { setTimeout(() => { this.isDropdownOpen = false; }, 150); }

  selectUser(user: MemberDto): void {
    this.selectedConfigUserId = user.id;
    this.isDropdownOpen       = false;
    this.userSearchTerm       = '';
    this.isEditingConfig      = false;
    if (this.isNewConfig) this.beginAddConfig();
  }

  clearUserSelection(): void {
    this.selectedConfigUserId = null;
    this.isEditingConfig      = false;
    this.userSearchTerm       = '';
  }

  // ── Config CRUD ────────────────────────────────────────────────────────────

  beginAddConfig(): void {
    this.configDraft = {
      userId:                this.selectedConfigUserId!,
      baseSalary:            0,
      pfPercentage:          12,
      travelAllowance:       0,
      otherAllowance:        0,
      allowedLeavesPerMonth: 1,
      salaryType:            0,
      revenuePercentage:     null,
    };
    this.isEditingConfig = true;
  }

  startEditConfig(): void {
    const cfg = this.selectedUserConfig;
    if (!cfg) return;
    this.configDraft = {
      userId:                cfg.userId,
      baseSalary:            cfg.baseSalary,
      pfPercentage:          cfg.pfPercentage,
      travelAllowance:       cfg.travelAllowance ?? 0,
      otherAllowance:        cfg.otherAllowance  ?? 0,
      allowedLeavesPerMonth: cfg.allowedLeavesPerMonth ?? 1,
      salaryType:            cfg.salaryType ?? 0,
      revenuePercentage:     cfg.revenuePercentage ?? null,
    };
    this.isEditingConfig = true;
  }

  cancelEditConfig(): void {
    this.isEditingConfig = false;
    if (!this.selectedUserConfig) this.selectedConfigUserId = null;
  }

  saveConfig(): void {
    const hasFixed   = (this.configDraft.baseSalary ?? 0) > 0;
    const hasPct     = (this.configDraft.revenuePercentage ?? 0) > 0;
    if (!hasFixed && !hasPct) {
      this.toastr.warning(
        this.revenuePercentEnabled
          ? 'Enter a fixed base salary, a revenue %, or both.'
          : 'Enter a fixed base salary.',
        'Validation');
      return;
    }
    // Derive salaryType: 0 = fixed only, 1 = % only, 2 = both
    this.configDraft.salaryType = hasFixed && hasPct ? 2 : hasPct ? 1 : 0;
    const pf = this.configDraft.pfPercentage ?? 0;
    if (pf < 0 || pf > 100) {
      this.toastr.warning('PF % must be between 0 and 100.', 'Validation');
      return;
    }
    const leaves = this.configDraft.allowedLeavesPerMonth ?? 0;
    if (!Number.isInteger(leaves) || leaves < 0 || leaves > 31) {
      this.toastr.warning('Allowed leaves must be a whole number between 0 and 31.', 'Validation');
      return;
    }
    this.isSavingConfig = true;
    this.salarySvc.saveSalaryConfig(this.configDraft)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSavingConfig  = false;
          this.isEditingConfig = false;
          this.refreshConfigs();
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isSavingConfig = false;
        },
      });
  }

  // ── Template helpers ───────────────────────────────────────────────────────

  isInactiveRecord(rec: SalaryRecordDTO): boolean {
    if (!rec.deactivatedAt) return false;
    return new Date(rec.deactivatedAt) <= new Date();
  }

  statusClass(status: SalaryStatus | undefined): string {
    switch (status) {
      case SalaryStatus.Paid:          return 'badge-paid';
      case SalaryStatus.PartiallyPaid: return 'badge-partial';
      default:                         return 'badge-pending';
    }
  }

  statusLabel(status: SalaryStatus | undefined): string {
    switch (status) {
      case SalaryStatus.Paid:          return 'Paid';
      case SalaryStatus.PartiallyPaid: return 'Partial';
      default:                         return 'Pending';
    }
  }

  /**
   * Salary is paid in whole rupees, so no amount is ever shown with paise.
   * maximumFractionDigits is explicit because toLocaleString defaults it to 3 —
   * a stray 241.94 from an older record would otherwise render as "241.94"
   * beside figures the server has already rounded to 242.
   */
  formatINR(val: number | null | undefined): string {
    return '₹ ' + Math.round(val ?? 0).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }

  userInitial(name: string | undefined): string {
    return (name?.charAt(0) ?? '?').toUpperCase();
  }

  fullName(u: MemberDto): string {
    return `${u.first_Name ?? ''} ${u.last_Name ?? ''}`.trim() || u.user_Name || 'Unknown';
  }

  hasConfig(userId: number): boolean {
    return this.configList.some(c => c.userId === userId);
  }


  private todayIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
