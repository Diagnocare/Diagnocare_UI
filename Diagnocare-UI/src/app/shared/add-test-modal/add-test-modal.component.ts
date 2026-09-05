import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';

import {
  InstitutionType,
  paymentMode,
  paymentType,
} from 'src/app/constant/enums';
import { SamplingLocationService } from 'src/app/services/samplingServices/sampling-location.service';
// import { GroupSubGroupModel } from 'src/app/models/pathTest/groupSubGroupModel';
// import { TestItem }           from 'src/app/models/path-Test/test/test.model.ts';
import { ReceiptCreateDto }   from 'src/app/models/receipt/receipt-create.dto';
import { AddPatientTestDto }  from 'src/app/models/patient/add-patient-test.dto';
import { PatientService }     from 'src/app/services/patientServices/patient.service';
import { PathTestService }    from 'src/app/services/pathTestServices/path-test-service';
import { CommonService }      from 'src/app/shared/common.service';
import { AutocompleteInputDirective } from 'src/app/shared/directives/autocomplete-input.directive';
import { StepperComponent }           from 'src/app/component/patient/stepper/stepper.component';
import { GroupSubGroupModel } from 'src/app/models/path-test/group/group.model';
import { TestItem } from 'src/app/models/path-test/test/test.model';
import { ContactAddressListDto } from 'src/app/models/contactAddress/contactAddress-list.dto';
import { ContactAddressService } from 'src/app/services/contactAddressServices/contact-address.service';
import { TpaDetailsModalComponent } from 'src/app/shared/tpa-details-modal/tpa-details-modal.component';
import { TpaDetails } from 'src/app/models/tpa/tpa-details.model';
import { PaymentCalculatorComponent } from 'src/app/shared/payment-calculator/payment-calculator.component';
import { TokenService }              from 'src/app/core/interceptors/token.service';
import { TestProtocolPanelComponent } from 'src/app/shared/test-protocol-panel/test-protocol-panel.component';
import {
  TestBookingProtocolsDto,
  TestProtocolDto,
} from 'src/app/models/path-test/protocol/test-protocol.model';

@Component({
  selector: 'app-add-test-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, AutocompleteInputDirective, StepperComponent, TpaDetailsModalComponent, PaymentCalculatorComponent, TestProtocolPanelComponent],
  templateUrl: './add-test-modal.component.html',
  styleUrls: ['./add-test-modal.component.css'],
})
export class AddTestModalComponent implements OnChanges, OnDestroy {
  // ── Inputs / Outputs ──────────────────────────────────────────────────────
  @Input() patientId: string  = '';
  @Input() visible:   boolean = false;

  @Output() saved     = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  // ── Sampling locations (from localStorage via service) ────────────────────
  get samplingDoneAt(): string[] { return this._sampling.getAll(); }
  readonly paymentTypeOptions     = Object.values(paymentType);
  readonly paymentModeOptions     = Object.values(paymentMode);
  readonly referredByTypeOptions  = Object.keys(InstitutionType).filter(k => isNaN(Number(k)));
  readonly PaymentType            = paymentType;

  /** Steps fed to the shared app-stepper — same shape as add-patient uses. */
  readonly stepperSteps = [
    { id: 1, title: 'Test & Lab',  description: 'Select tests and lab preferences' },
    { id: 2, title: 'Payment',     description: 'Review amounts and complete billing' },
  ];

  // ── Internal stepper (1 = Test & Lab, 2 = Payment) ───────────────────────
  currentStep: 1 | 2 = 1;

  // ── Test catalog state ────────────────────────────────────────────────────
  showTestCatalog = false;
  query           = '';
  groupedTests:   GroupSubGroupModel[] = [];
  subGroupTests:  GroupSubGroupModel[] = [];
  pathologyTest:  any[]                = [];
  selectedTestGroup?:  GroupSubGroupModel;
  selectedSubGroup?:   GroupSubGroupModel;
  selectedGroupId:    string | null = null;
  selectedSubGroupId: string | null = null;
  selectedTestIds = new Set<string>();
  selectedTests:  TestItem[] = [];
  focusedTestId:  string | null = null;

  // ── Sample collection protocols ───────────────────────────────────────────
  /**
   * Protocols for the test the operator last clicked in the catalogue. A list, because a
   * test can be collected under several. Null until something has been clicked; an empty
   * array means the test has none linked, which the panel states in words.
   */
  focusedProtocols: TestProtocolDto[] | null = null;
  focusedProtocolTestName = '';
  focusedProtocolTestCode = '';
  focusedProtocolLoading = false;
  /** Guards against an earlier, slower protocol response overwriting a later one. */
  private protocolRequestSeq = 0;

  /** Protocols for everything in the basket, grouped by test, shown on the Test & Lab step. */
  selectedTestProtocols: TestBookingProtocolsDto[] = [];
  selectedProtocolsLoading = false;
  /** Expanded by default — the requirements are the point; the operator can collapse them. */
  showSelectedProtocols = true;

  // ── Referred By autocomplete ──────────────────────────────────────────────
  referredByOptions:         string[] = [];
  filteredReferredByOptions: string[] = [];
  showReferredBySuggestions  = false;
  /** Full contact records for the currently-selected institution type. */
  private referredByContacts: ContactAddressListDto[] = [];

  // ── Payment state ─────────────────────────────────────────────────────────
  paymentConfirmed = false;
  amountPaidError  = '';
  showPartialPaymentPanel = false;

  // ── TPA state ─────────────────────────────────────────────────────────────
  showTpaModal = false;
  tpaDetails: TpaDetails | null = null;

  // ── Submission state ──────────────────────────────────────────────────────
  isSaving  = false;
  saveError = '';

  // ── Form ──────────────────────────────────────────────────────────────────
  form: FormGroup;

  private destroy$ = new Subject<void>();

  constructor(
    private fb:              FormBuilder,
    private _testService:    PathTestService,
    private _patientService: PatientService,
    private _common:         CommonService,
    private toastr:          ToastrService,
    private cdr:             ChangeDetectorRef,
    private _sampling:       SamplingLocationService,
    private _contactService: ContactAddressService,
    private _token:          TokenService,
  ) {
    this.form = this.fb.group({
      test_Name:         ['', Validators.required],
      urgent_Report:     [false],
      test_Amount:       ['', Validators.required],
      referred_By_Type:  ['Doctor', Validators.required],
      referred_By:       ['', Validators.required],
      sampling_Done:     [''],
      collected_Outside: [false],
      area:              [''],
      collected_By:      [''],
      remark:            [''],
      discount:          [0],
      net_Amount:        [0, Validators.required],
      payment_Type:      [paymentType.Full, Validators.required],
      payment_Mode:      [paymentMode.Cash, Validators.required],
      amount_Paid:       ['', Validators.required],
      amount_Pending:    ['0', Validators.required],
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.resetModal();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Computed helpers ──────────────────────────────────────────────────────

  get totalAmount(): number {
    return this.selectedTests.reduce((s, it) => s + Number(it.price || 0), 0);
  }

  get isStep1Valid(): boolean {
    return (
      !!this.form.get('test_Name')?.valid &&
      !!this.form.get('test_Amount')?.valid &&
      !!this.form.get('referred_By_Type')?.valid &&
      !!this.form.get('referred_By')?.valid
    );
  }

  get isTpaMode(): boolean {
    return this.form.get('payment_Mode')?.value === paymentMode.TPA;
  }

  get isStep2Valid(): boolean {
    const type = this.form.get('payment_Type')?.value as string;
    if (!type) return false;
    // NoPayment: skip payment mode validation
    if (type !== paymentType.NoPayment && !this.form.get('payment_Mode')?.valid) return false;
    // TPA mode: must have confirmed TPA details
    if (this.isTpaMode && !this.tpaDetails) return false;
    if (type === paymentType.Full) return !!this.form.get('net_Amount')?.valid;
    if (type === paymentType.NoPayment) return !!this.form.get('net_Amount')?.valid;
    return this.paymentConfirmed;
  }

  get filteredGroups():    GroupSubGroupModel[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.groupedTests.filter(g => `${g.testGroupId} ${g.name}`.toLowerCase().includes(q)) : this.groupedTests;
  }
  get filteredSubGroups(): GroupSubGroupModel[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.subGroupTests.filter(s => `${s.testGroupId} ${s.name}`.toLowerCase().includes(q)) : this.subGroupTests;
  }
  get filteredTests(): any[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.pathologyTest.filter(t => `${t.testCode} ${t.testName}`.toLowerCase().includes(q)) : this.pathologyTest;
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  goToStep2(): void {
    if (this.isStep1Valid) {
      this.currentStep = 2;
      // When entering payment step, sync amounts for Full / NoPayment
      const payType = this.form.get('payment_Type')?.value;
      if (payType === paymentType.Full) {
        this.form.patchValue({ amount_Paid: this.form.get('net_Amount')?.value, amount_Pending: 0 });
      } else if (payType === paymentType.NoPayment) {
        this.form.patchValue({ amount_Paid: 0, amount_Pending: this.form.get('net_Amount')?.value ?? 0 });
      }
    }
  }

  goToStep1(): void {
    this.currentStep = 1;
  }

  // ── Test Catalog ──────────────────────────────────────────────────────────

  openTestCatalog(event: Event): void {
    event.preventDefault();
    this._testService.getTestGroupList().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: GroupSubGroupModel[]) => {
        this.groupedTests = res ?? [];
        this.selectedTestGroup = this.groupedTests[0];
        this.selectedGroupId = this.selectedTestGroup?.testGroupId;
        this.getSubGroupList(this.selectedTestGroup!);
        this.showTestCatalog = true;
      },
      // Message shown centrally by ErrorInterceptor.
      error: () => {
        this.groupedTests = [];
      },
    });
  }

  getSubGroupList(tg: GroupSubGroupModel): void {
    this.selectedTestGroup = tg;
    this.selectedGroupId   = tg.testGroupId;
    this._testService.getTestSubGroupList(tg.testGroupId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: GroupSubGroupModel[]) => {
        this.subGroupTests    = res ?? [];
        this.selectedSubGroup = this.subGroupTests[0];
        this.selectedSubGroupId = this.selectedSubGroup?.testGroupId;
        if (this.selectedSubGroup) this.getMedicalTestList(this.selectedSubGroup);
      },
      error: () => { this.subGroupTests = []; },   // message shown centrally by ErrorInterceptor
    });
  }

  getMedicalTestList(sg: GroupSubGroupModel): void {
    this.selectedSubGroup   = sg;
    this.selectedSubGroupId = sg.testGroupId;
    this._testService.getMedicalTestList(sg.testGroupId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any[]) => { this.pathologyTest = res ?? []; },
      error: () => { this.pathologyTest = []; },   // message shown centrally by ErrorInterceptor
    });
  }

  /**
   * A test with no parameters configured cannot be booked — there is nothing to
   * enter results into and its report would render an empty table. The server
   * rejects such a booking outright (PatientService.ValidateTestsAreBookableAsync);
   * this keeps the operator from selecting one and only finding out on Save.
   */
  isTestBookable(t: TestItem): boolean {
    return (t?.parameterCount ?? 0) > 0;
  }

  /**
   * Loads the protocol for the test the operator just clicked.
   *
   * Clicking a row in the catalogue both selects the test and focuses it, so this rides
   * along with the existing click rather than adding a second gesture — the operator sees
   * the requirements for whatever they last touched, without hunting for an info button.
   *
   * Responses are sequence-checked: a fast click through several tests can return out of
   * order, and showing the wrong test's sample requirements is worse than showing none.
   */
  private loadFocusedProtocol(t: TestItem): void {
    const testRegId = t?.testRegId ?? 0;
    this.focusedProtocolTestName = t?.testName ?? '';
    this.focusedProtocolTestCode = t?.testCode ?? '';

    if (!testRegId) {
      this.focusedProtocols = null;
      this.focusedProtocolLoading = false;
      return;
    }

    const seq = ++this.protocolRequestSeq;
    this.focusedProtocolLoading = true;

    this._testService.getTestProtocols(testRegId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (protocols) => {
        if (seq !== this.protocolRequestSeq) return;
        this.focusedProtocols = protocols ?? [];
        this.focusedProtocolLoading = false;
      },
      // Message shown centrally by ErrorInterceptor. Leaving the protocol null makes the
      // panel say the requirements are unknown, which is the truthful outcome here.
      error: () => {
        if (seq !== this.protocolRequestSeq) return;
        this.focusedProtocols = null;
        this.focusedProtocolLoading = false;
      },
    });
  }

  /**
   * Loads protocols for everything currently in the basket, for the summary on step 1.
   * One request for the whole selection rather than one per test.
   */
  private loadSelectedProtocols(): void {
    const codes = this.selectedTests.map(t => t.testCode).filter(c => !!c);
    if (!codes.length) {
      this.selectedTestProtocols = [];
      this.selectedProtocolsLoading = false;
      return;
    }

    this.selectedProtocolsLoading = true;
    this._testService.getTestProtocolsByCodes(codes).pipe(takeUntil(this.destroy$)).subscribe({
      next: (grouped) => {
        this.selectedTestProtocols = grouped ?? [];
        this.selectedProtocolsLoading = false;
      },
      error: () => {
        this.selectedTestProtocols = [];
        this.selectedProtocolsLoading = false;
      },
    });
  }

  /** Tests in the basket with no protocol linked at all. */
  get testsMissingProtocol(): TestBookingProtocolsDto[] {
    return this.selectedTestProtocols.filter(t => !t.protocols?.length);
  }

  /**
   * Tests in the basket that need the patient to fast, with the longest fast each one
   * demands — the one requirement that has to reach the patient before they leave.
   *
   * The longest, not the first: a test collected under two protocols with 8 and 12 hours
   * needs 12, and telling the patient the shorter number wastes their second trip.
   */
  get fastingTests(): { testName: string; hours: number | null }[] {
    return this.selectedTestProtocols
      .map(t => {
        const fasting = (t.protocols ?? []).filter(p => p.fastingRequired);
        if (!fasting.length) return null;
        const hours = fasting.reduce<number | null>(
          (max, p) => (p.fastingHours != null && (max == null || p.fastingHours > max) ? p.fastingHours : max),
          null,
        );
        return { testName: t.testName, hours };
      })
      .filter((x): x is { testName: string; hours: number | null } => x !== null);
  }

  toggleTestSelection(t: TestItem): void {
    this.focusedTestId = t.testCode;
    this.loadFocusedProtocol(t);

    // Selecting is blocked, but de-selecting must always work — otherwise a test
    // whose last parameter was deleted after it was picked would be stuck in the
    // basket with no way to remove it.
    if (!this.isTestBookable(t) && !this.selectedTestIds.has(t.testCode)) {
      this.toastr.warning(
        `${t.testName} has no parameters configured, so it cannot be booked.`,
        'Test not available');
      return;
    }

    if (this.selectedTestIds.has(t.testCode)) {
      this.selectedTestIds.delete(t.testCode);
      this.selectedTests = this.selectedTests.filter(x => x.testCode !== t.testCode);
    } else {
      this.selectedTestIds.add(t.testCode);
      this.selectedTests = [...this.selectedTests, t];
    }
  }

  removeSelectedTest(testId: string): void {
    const t = this.selectedTests.find(x => x.testCode === testId);
    if (!t) return;
    this.selectedTestIds.delete(testId);
    this.selectedTests = this.selectedTests.filter(x => x.testCode !== testId);
    this.selectedTestProtocols = this.selectedTestProtocols.filter(t => t.testCode !== testId);
  }

  confirmTestSelection(): void {
    if (this.selectedTests.length === 0) {
      this.toastr.warning('Please select at least one test', 'No test selected');
      return;
    }

    // Catches anything that got in before its parameters were removed.
    const unbookable = this.selectedTests.filter(t => !this.isTestBookable(t));
    if (unbookable.length) {
      this.toastr.error(
        `Remove ${unbookable.map(t => t.testName).join(', ')} — no parameters configured.`,
        'Test not available');
      return;
    }
    this.form.patchValue({
      test_Name:   this.selectedTests.map(t => t.testName).join(', '),
      test_Amount: this.totalAmount,
    });
    this.showTestCatalog = false;
    this.calculateNetAmount();
    // Bring the requirements back to the form step, where the operator is still with the
    // patient and can tell them about fasting before they leave.
    this.loadSelectedProtocols();
  }

  cancelTestCatalog(): void {
    this.showTestCatalog = false;
    // The basket survives "Back to Form", so the summary on step 1 has to be refreshed
    // here too. Without this, backing out after changing the selection leaves the fasting
    // and missing-protocol alerts describing a basket that no longer exists.
    this.loadSelectedProtocols();
  }

  isTestSelected(t: TestItem): boolean {
    return this.selectedTestIds.has(t.testCode);
  }

  // ── Referred By ───────────────────────────────────────────────────────────

  onReferredByTypeChange(): void {
    const selectedType = this.form.get('referred_By_Type')?.value || '';
    this.form.patchValue(
      { referred_By: this._common.getDefaultReferredByText(selectedType) },
      { emitEvent: false }
    );
    this.showReferredBySuggestions = false;
    if (this._common.shouldLoadDistinctReferredBy(selectedType)) {
      this.loadDistinctReferredBy();
    } else {
      this.referredByOptions = [];
      this.filteredReferredByOptions = [];
    }
  }

  loadDistinctReferredBy(): void {
    const type = this.form.get('referred_By_Type')?.value || '';
    const institutionType = this.referredByTypeToInstitutionType(type);
    if (institutionType === null) {
      this.referredByContacts = [];
      this.referredByOptions = [];
      this.filteredReferredByOptions = [];
      this.showReferredBySuggestions = false;
      return;
    }
    this._contactService.getContactsByType(institutionType).pipe(takeUntil(this.destroy$)).subscribe({
      next: (contacts: ContactAddressListDto[]) => {
        this.referredByContacts = contacts;
        this.referredByOptions  = contacts.map(c => c.name);
        this.filterReferredByOptions(this.form.get('referred_By')?.value || '');
        this.showReferredBySuggestions = false;
      },
      error: () => {
        this.referredByContacts = [];
        this.referredByOptions  = [];
        this.filteredReferredByOptions = [];
      },
    });
  }

  /** Maps an InstitutionType key string (e.g. 'Doctor') to its numeric enum value. */
  private referredByTypeToInstitutionType(type: string): InstitutionType | null {
    const value = InstitutionType[type as keyof typeof InstitutionType];
    return value !== undefined ? (value as InstitutionType) : null;
  }

  onReferredByInput(event?: Event): void {
    const selectedType = this.form.get('referred_By_Type')?.value || '';
    if (!this._common.shouldLoadDistinctReferredBy(selectedType)) {
      this.showReferredBySuggestions = false;
      return;
    }
    const keyword = event
      ? (event.target as HTMLInputElement).value
      : (this.form.get('referred_By')?.value || '');
    this.filterReferredByOptions(keyword);
    this.showReferredBySuggestions = this.filteredReferredByOptions.length > 0;
    this.cdr.detectChanges();
  }

  onReferredByFocus(): void {
    const selectedType = this.form.get('referred_By_Type')?.value || '';
    if (!this._common.shouldLoadDistinctReferredBy(selectedType)) return;
    this.filterReferredByOptions(this.form.get('referred_By')?.value || '');
    this.showReferredBySuggestions = this.filteredReferredByOptions.length > 0;
    this.cdr.detectChanges();
  }

  onReferredByBlur(): void {
    setTimeout(() => { this.showReferredBySuggestions = false; }, 200);
  }

  selectReferredBy(option: string): void {
    this.form.patchValue({ referred_By: option });
    this.showReferredBySuggestions = false;
  }

  private filterReferredByOptions(keyword: string): void {
    this.filteredReferredByOptions = this._common.filterStringOptions(this.referredByOptions, keyword);
  }

  // ── Payment Calculations ──────────────────────────────────────────────────

  /** Maximum discount % allowed for this lab (admin-configured). */
  get maxDiscountPercent(): number { return this._token.getMaxDiscountPercent(); }

  calculateNetAmount(): void {
    const testAmount  = +this.form.get('test_Amount')?.value || 0;
    const discount    = +this.form.get('discount')?.value   || 0;
    const maxDiscount = this._token.getMaxDiscountPercent();

    if (discount > maxDiscount) {
      this.form.get('discount')?.setErrors({ maxExceeded: true });
      return;
    }
    this.form.get('discount')?.setErrors(null);

    if (testAmount > 0 && discount >= 0 && discount <= maxDiscount) {
      const net = testAmount - (discount * testAmount / 100);
      this.form.patchValue({ net_Amount: net });
    }
    const payType = this.form.get('payment_Type')?.value;
    // Reset payment confirmation when amounts change
    if (this.paymentConfirmed) {
      this.paymentConfirmed = false;
      this.form.patchValue({ amount_Paid: '', amount_Pending: '' });
    }
    // Sync Full payment
    if (payType === paymentType.Full) {
      this.form.patchValue({
        amount_Paid:    this.form.get('net_Amount')?.value,
        amount_Pending: 0,
      });
    } else if (payType === paymentType.NoPayment) {
      // Keep NoPayment amounts in sync with net_Amount
      this.form.patchValue({
        amount_Paid:    0,
        amount_Pending: this.form.get('net_Amount')?.value ?? 0,
      });
    }
  }

  calculateDiscount(): void {
    const testAmount = +this.form.get('test_Amount')?.value || 0;
    const netAmount  = +this.form.get('net_Amount')?.value  || 0;
    if (netAmount > 0 && netAmount <= testAmount && testAmount > 0) {
      this.form.patchValue({ discount: (testAmount - netAmount) * 100 / testAmount });
    }
  }

  onPaymentTypeChange(): void {
    const type = this.form.get('payment_Type')?.value as string;
    this.paymentConfirmed = false;
    this.amountPaidError  = '';

    if (type === paymentType.Full) {
      this.showPartialPaymentPanel = false;
      this.form.patchValue({
        amount_Paid:    this.form.get('net_Amount')?.value,
        amount_Pending: 0,
      });
    } else if (type === paymentType.NoPayment) {
      // No payment now — 0 paid, full amount pending
      this.showPartialPaymentPanel = false;
      this.form.patchValue({
        amount_Paid:    0,
        amount_Pending: this.form.get('net_Amount')?.value ?? 0,
      });
    } else {
      // Partial — open inline panel
      this.form.patchValue({ amount_Paid: '', amount_Pending: '' });
      this.showPartialPaymentPanel = true;
    }
  }

  // ── TPA modal handlers ────────────────────────────────────────────────────

  onPaymentModeChange(): void {
    if (this.isTpaMode) {
      // Open TPA details modal immediately
      this.showTpaModal = true;
    } else {
      // Switching away from TPA — clear any saved TPA details
      this.tpaDetails    = null;
      this.showTpaModal  = false;
    }
  }

  onTpaConfirmed(details: TpaDetails): void {
    this.tpaDetails   = details;
    this.showTpaModal = false;
  }

  onTpaCancelled(): void {
    this.showTpaModal = false;
    if (!this.tpaDetails) {
      // User never confirmed TPA details — revert mode to Cash
      this.form.patchValue({ payment_Mode: paymentMode.Cash });
    }
  }

  editTpaDetails(): void {
    this.showTpaModal = true;
  }

  // ── Partial Payment Panel ─────────────────────────────────────────────────

  onPartialAmountPaidInput(event: Event): void {
    this.amountPaidError = '';
    const raw       = (event.target as HTMLInputElement).value;
    const amtPaid   = parseFloat(raw) || 0;
    const netAmount = parseFloat(this.form.get('net_Amount')?.value) || 0;

    if (amtPaid <= 0) {
      this.form.patchValue({ amount_Pending: '' });
      return;
    }
    if (amtPaid >= netAmount) {
      this.amountPaidError = `Amount paid cannot equal or exceed net amount (₹${netAmount}). Use "Full" payment type.`;
      this.form.patchValue({ amount_Pending: '' });
      return;
    }
    const pending = +(netAmount - amtPaid).toFixed(2);
    this.form.patchValue({ amount_Pending: pending });
  }

  confirmPartialPayment(): void {
    const amtPaid   = parseFloat(this.form.get('amount_Paid')?.value)  || 0;
    const netAmount = parseFloat(this.form.get('net_Amount')?.value)    || 0;
    if (amtPaid <= 0) {
      this.amountPaidError = 'Please enter the correct amount paid.';
      return;
    }
    if (amtPaid >= netAmount) {
      this.amountPaidError = `Amount paid cannot equal or exceed net amount (₹${netAmount}).`;
      return;
    }
    const pending = +(netAmount - amtPaid).toFixed(2);
    this.form.patchValue({ amount_Paid: amtPaid, amount_Pending: pending });
    this.amountPaidError  = '';
    this.paymentConfirmed = true;
    this.showPartialPaymentPanel = false;
  }

  cancelPartialPayment(): void {
    this.showPartialPaymentPanel = false;
    this.paymentConfirmed = false;
    this.amountPaidError  = '';
    this.form.patchValue({
      payment_Type:   paymentType.Full,
      amount_Paid:    this.form.get('net_Amount')?.value,
      amount_Pending: 0,
    });
  }

  editPartialPayment(): void {
    this.paymentConfirmed = false;
    this.amountPaidError  = '';
    this.showPartialPaymentPanel = true;
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  submit(): void {
    if (!this.isStep2Valid || this.isSaving) return;

    // Auto-create an AddressManager entry if the typed referrer name is new
    const referredByName  = this.form.get('referred_By')?.value?.trim() || '';
    const referredType    = this.form.get('referred_By_Type')?.value || '';
    const institutionType = this.referredByTypeToInstitutionType(referredType);
    const alreadyExists   = this.referredByContacts.some(
      c => c.name.toLowerCase() === referredByName.toLowerCase()
    );
    if (institutionType !== null && referredByName && !alreadyExists) {
      this._contactService.getOrCreate(referredByName, institutionType)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => this.doSubmit(),
          error: () => this.doSubmit(), // proceed even if contact creation fails
        });
      return;
    }

    this.doSubmit();
  }

  private doSubmit(): void {
    const f           = this.form.getRawValue();
    const netAmt      = f.net_Amount ?? 0;
    const isFullPay   = f.payment_Type === paymentType.Full;
    const isNoPayment = f.payment_Type === paymentType.NoPayment;
    const amtPaid     = isFullPay ? netAmt : isNoPayment ? 0 : (f.amount_Paid || 0);
    const amtPending  = isFullPay ? 0 : isNoPayment ? netAmt : +(netAmt - amtPaid).toFixed(2);

    // Build test IDs string
    let testIds = '';
    this.selectedTestIds.forEach(id => (testIds += id + ','));
    testIds = testIds.slice(0, -1);

    // Always create receipt — even for No Payment — so test/net amounts are
    // stored and the receipt module can show the balance and allow "Pay Now" later.
    // For No Payment: amountPaid=0, amountPending=netAmount, paymentMode=''.
    const isTpa = f.payment_Mode === paymentMode.TPA;
    const receipt: ReceiptCreateDto = {
      patientTestId: 0,
      testAmount:    f.test_Amount ?? 0,
      discount:      f.discount    ?? 0,
      netAmount:     netAmt,
      paymentType:   f.payment_Type,
      amountPaid:    amtPaid,
      amountPending: amtPending,
      paymentMode:   isNoPayment ? '' : f.payment_Mode,
      // TPA fields — only included when mode is TPA
      ...(isTpa && this.tpaDetails && {
        tpaName:            this.tpaDetails.tpaName            || undefined,
        tpaPolicyNumber:    this.tpaDetails.tpaPolicyNumber    || undefined,
        tpaClaimNumber:     this.tpaDetails.tpaClaimNumber     || undefined,
        tpaApprovalCode:    this.tpaDetails.tpaApprovalCode    || undefined,
        tpaPolicyValidFrom: this.tpaDetails.tpaPolicyValidFrom || undefined,
        tpaPolicyValidTo:   this.tpaDetails.tpaPolicyValidTo   || undefined,
      }),
    };

    const payload: AddPatientTestDto = {
      patientId:       this.patientId,
      test: {
        test_Id:          testIds,
        test_Name:         f.test_Name,
        urgent_Report:     f.urgent_Report     ?? false,
        test_Amount:       f.test_Amount       ?? 0,
        referred_By_Type:  f.referred_By_Type  ?? '',
        referred_By: f.referred_By ?? '',
        remark:            f.remark            ?? '',
        collected_Outside: f.collected_Outside ?? false,
        area:              f.area              ?? '',
        collected_By:      f.collected_By      ?? '',
        sampling_Done:     f.sampling_Done     ?? '',
      },
      receipt,
    };

    this.isSaving  = true;
    this.saveError = '';

    this._patientService.addPatientTest(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.isSaving = false;
        this.saved.emit();
      },
      error: (err: Error) => {
        this.isSaving  = false;
        this.saveError = err.message || 'Failed to add test. Please try again.';
      },
    });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private resetModal(): void {
    this.currentStep          = 1;
    this.showTestCatalog      = false;
    this.showPartialPaymentPanel = false;
    this.showTpaModal         = false;
    this.tpaDetails           = null;
    this.paymentConfirmed     = false;
    this.amountPaidError      = '';
    this.saveError            = '';
    this.isSaving             = false;
    this.query                = '';
    this.selectedTestIds      = new Set<string>();
    this.selectedTests        = [];
    this.focusedTestId             = null;
    this.focusedProtocols          = null;
    this.focusedProtocolTestName   = '';
    this.focusedProtocolTestCode   = '';
    this.focusedProtocolLoading    = false;
    // protocolRequestSeq is deliberately NOT reset. The modal is reused across opens, and
    // rewinding the counter would let a response still in flight from the previous session
    // match a sequence number issued after the reset — writing one test's sample
    // requirements onto another, which is the exact failure the counter exists to prevent.
    this.selectedTestProtocols     = [];
    this.selectedProtocolsLoading  = false;
    this.showSelectedProtocols     = true;
    this.referredByContacts        = [];
    this.referredByOptions         = [];
    this.filteredReferredByOptions = [];
    this.showReferredBySuggestions = false;

    this.form.reset({
      test_Name:         '',
      urgent_Report:     false,
      test_Amount:       '',
      referred_By_Type:  'Doctor',
      referred_By:       '',
      sampling_Done:     '',
      collected_Outside: false,
      area:              '',
      collected_By:      '',
      remark:            '',
      discount:          0,
      net_Amount:        0,
      payment_Type:      paymentType.Full,
      payment_Mode:      paymentMode.Cash,
      amount_Paid:       '',
      amount_Pending:    '0',
    });

    // Load AddressManager options for the default type
    this.onReferredByTypeChange();
  }
}
