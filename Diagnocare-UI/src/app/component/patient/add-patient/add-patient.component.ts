import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StepperComponent } from '../stepper/stepper.component';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { tabOrderAdd, validationMessages, DEFAULT_DIALING_CODE } from 'src/app/constant/constants';
import { FieldErrorComponent } from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';
import { ReceiptCreateDto } from 'src/app/models/receipt/receipt-create.dto';
import { PatientService } from 'src/app/services/patientServices/patient.service';
import { CommonService } from 'src/app/shared/common.service';
import { AppValidators } from 'src/app/shared/validators/app-validators';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { PathTestService } from 'src/app/services/pathTestServices/path-test-service';
import { salutation, gender, maritalStatus, relations, ageGroup, paymentType, paymentMode, Role, InstitutionType } from 'src/app/constant/enums';
import { SamplingLocationService } from 'src/app/services/samplingServices/sampling-location.service';
import { AreaService }             from 'src/app/services/areaServices/area.service';
import { MemberService } from 'src/app/services/memberService/member.service';
import { MemberDto }     from 'src/app/models/member/member.dto';
import { ContactAddressService } from 'src/app/services/contactAddressServices/contact-address.service';
import { ContactAddressListDto } from 'src/app/models/contactAddress/contactAddress-list.dto';
import { AutocompleteInputDirective } from 'src/app/shared/directives/autocomplete-input.directive';
import { DatePickerComponent } from 'src/app/shared/date-picker/date-picker.component';
import { GroupSubGroupModel } from 'src/app/models/path-test/group/group.model';
import { TestItem } from 'src/app/models/path-test/test/test.model';
import { TpaDetailsModalComponent } from 'src/app/shared/tpa-details-modal/tpa-details-modal.component';
import { TpaDetails } from 'src/app/models/tpa/tpa-details.model';
import { PaymentCalculatorComponent } from 'src/app/shared/payment-calculator/payment-calculator.component';
import { TokenService }              from 'src/app/core/interceptors/token.service';

@Component({
  selector: 'app-patient-registration',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    StepperComponent,
    FormsModule,
    AutocompleteInputDirective,
    LoadingSpinnerComponent,
    DatePickerComponent,
    TpaDetailsModalComponent,
    FieldErrorComponent,
    FormKeyboardDirective,
    PaymentCalculatorComponent,
  ],
  providers: [],
  standalone: true,
  templateUrl: './add-patient.component.html',
  styleUrls: ['./add-patient.component.scss']
})
export class AddPatientComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>()

  // ── Per-step required field map ────────────────────────────────────────────
  // Only fields listed here are checked when deciding whether Next is enabled.
  private readonly stepFields: Record<number, string[]> = {
    1: [], // All disabled / auto-filled — always passable
    2: [
      'patient_Name', 'patient_DOB', 'patient_Age', 'patient_Age_Group',
      'patient_Gender', 'patient_Marital_Status', 'patient_Address',
      'relation', 'relative_Name', 'patient_Contact', 'patient_Email'
    ],
    3: ['test_Name', 'test_Amount', 'referred_By_Type', 'referred_By'],
    4: ['net_Amount', 'payment_Type', 'amount_Paid', 'amount_Pending', 'payment_Mode']
    // Note: TPA sub-fields are validated separately via isTpaValid getter (not in stepFields)
    // because they are conditionally required only when payment_Mode === 'TPA'
  };

  isLoading: boolean = false;
  currentStep = 1;

  /** Exposed for [tabFields] binding on the form element. */
  readonly tabFields = tabOrderAdd;

  /** True once the user clicks "Confirm" in the Partial Payment modal. */
  paymentConfirmed = false;
  /** Inline error shown inside the Partial Payment modal. */
  amountPaidError  = '';
  /** Tracks whether Next/Submit was clicked on each step — triggers inline errors. */
  stepTouched: Record<number, boolean> = { 1: false, 2: false, 3: false, 4: false };

  // ── TPA state ──────────────────────────────────────────────────────────────
  showTpaModal = false;
  tpaDetails: TpaDetails | null = null;
  query = '';
  today: string = new Date().toISOString().split('T')[0];
  salutation = Object.values(salutation);
  gender = Object.values(gender);
  maritalStatus = Object.values(maritalStatus);
  relations = Object.values(relations);
  ageRange = Object.values(ageGroup);
  get samplingDoneAt(): string[] { return this._sampling.getAll(); }
  get areas(): string[] { return this._area.getAll(); }
  paymentType = Object.values(paymentType);
  paymentMode = Object.values(paymentMode);
  // All InstitutionType enum keys (Clinic, Hospital, Laboratory, DiagnosticCenter, Pharmacy, Other, Doctor)
  referredByTypeOptions = Object.keys(InstitutionType).filter(k => isNaN(Number(k)));
  referredByOptions: string[] = [];
  filteredReferredByOptions: string[] = [];
  showReferredBySuggestions: boolean = false;
  /** Full contact records loaded from AddressManager for the current referred-by type. */
  private referredByContacts: ContactAddressListDto[] = [];
  collectionBoys: MemberDto[] = [];

  patientForm: FormGroup;
  countryCodes: { code: string, label: string }[] = [];
  groupedTests: GroupSubGroupModel[] = [];
  subGroupTests: GroupSubGroupModel[] = [];
  pathologyTest: any[] = [];
  selectedTestGroup?: GroupSubGroupModel;
  selectedSubGroup?: GroupSubGroupModel;
  selectedTest?: any;
  showTest: boolean = false;
  showOtherTestDetails: boolean = true;

  selectedGroupId: string | null = null;
  selectedSubGroupId: string | null = null;
  selectedTestIds = new Set<string>();
  selectedTests: TestItem[] = [];
  focusedTestId: string | null = null;

  /** Upper bound for the DOB picker — today in YYYY-MM-DD format. */
  readonly todayIso = new Date().toISOString().split('T')[0];
  

  steps = [
    { id: 1, title: 'Basic Info',       description: 'Patient identification' },
    { id: 2, title: 'Personal Details', description: 'Contact & demographics' },
    { id: 3, title: 'Test & Lab',       description: 'Medical information'    },
    { id: 4, title: 'Payment',          description: 'Billing details'        }
  ];

  constructor(
    private fb: FormBuilder,
    private _common: CommonService,
    private _patientService: PatientService,
    private _testService: PathTestService,
    private _route: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
    private _sampling:        SamplingLocationService,
    private _area:            AreaService,
    private _memberService:   MemberService,
    private _contactService:  ContactAddressService,
    private _token:           TokenService,
  ) {
    this.patientForm = this.fb.group({
      country_Code:      ['+91', Validators.required],
      patient_Reg_Date:     new FormControl({ value: new Date().toISOString().split('T')[0], disabled: true }),
      serial_Number:        new FormControl({ value: 0,   disabled: true }),
      patient_Id:           new FormControl({ value: '',  disabled: true }),
      patient_Salutation:   ['Mr.', Validators.required],
      patient_Name:         ['', [Validators.required, AppValidators.stringOnly()]],
      patient_DOB:          ['', [Validators.required, AppValidators.noFutureDate()]],
      patient_Age:          ['', Validators.required],
      patient_Age_Group:    ['', Validators.required],
      patient_Gender:       ['', Validators.required],
      patient_Marital_Status: ['', Validators.required],
      patient_Address:      ['', Validators.required],
      relation:             ['S/O', Validators.required],
      relative_Name:        ['', [Validators.required, AppValidators.stringOnly()]],
      patient_Contact:      ['', [Validators.required, AppValidators.contactNumber()]],
      patient_Email:        ['', [Validators.required, Validators.email]],
      test_id:              [''],
      test_Name:            ['', Validators.required],
      urgent_Report:        [false],
      test_Amount:          ['', Validators.required],
      referred_By_Type:     ['Doctor', Validators.required],
      referred_By:          ['', Validators.required],
      remark:               [''],
      collected_Outside:    [false],
      area:                 [''],
      collected_By:         [''],
      sampling_Done:        [],
      discount:             [0],
      net_Amount:           [0, Validators.required],
      payment_Type:         ['Full', Validators.required],
      amount_Paid:          ['', Validators.required],
      amount_Pending:       ['0', Validators.required],
      payment_Mode:         ['Cash', Validators.required]
    });
  }

  ngOnInit() {
      this.initializeComponent();
      this.countryCodes = [{ code: DEFAULT_DIALING_CODE, label: `India (${DEFAULT_DIALING_CODE})` }];
      this.patientForm.patchValue({ country_Code: DEFAULT_DIALING_CODE });

      // Load collection boys for "Collected By" dropdown
      this._memberService.getAll(Role.Collection_Boy.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (list: MemberDto[]) => { this.collectionBoys = list ?? []; },
          error: ()                  => { this.collectionBoys = []; },
        });

    // Keep amount_Paid in sync when payment type / net amount changes
    this.patientForm.get('payment_Type')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(type => {
        if (type === paymentType.Full) {
          this.patientForm.patchValue({ amount_Paid: this.patientForm.get('net_Amount')?.value, amount_Pending: 0 });
        } else if (type === paymentType.NoPayment) {
          this.paymentConfirmed = false;
          this.patientForm.patchValue({ amount_Paid: 0, amount_Pending: this.patientForm.get('net_Amount')?.value ?? 0 });
        } else {
          // Partial — reset amounts so user goes through the modal
          this.paymentConfirmed = false;
          this.patientForm.patchValue({ amount_Paid: '', amount_Pending: '' });
        }
      });

    this.patientForm.get('net_Amount')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(netAmount => {
        const type = this.patientForm.get('payment_Type')?.value;
        if (type === paymentType.Full) {
          this.patientForm.patchValue({ amount_Paid: netAmount, amount_Pending: 0 });
        } else if (type === paymentType.NoPayment) {
          this.patientForm.patchValue({ amount_Paid: 0, amount_Pending: netAmount ?? 0 });
        } else {
          // Net changed after partial confirmation → stale; require re-confirmation
          if (this.paymentConfirmed) {
            this.paymentConfirmed = false;
            this.patientForm.patchValue({ amount_Paid: '', amount_Pending: '' });
          }
        }
      });

    this.patientForm.get('discount')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.patientForm.get('payment_Type')?.value === paymentType.Partial && this.paymentConfirmed) {
          this.paymentConfirmed = false;
          this.patientForm.patchValue({ amount_Paid: '', amount_Pending: '' });
        }
      });
  }

  initializeComponent() {
    this.getSerialNPatientId();
    this.onReferredByTypeChange();
    this.calculateAge();
  }
 /**
   * Returns the tabindex for a given control name based on tabOrderAdd.
   */
  getTabIndex(controlName: string): number {
    const idx = tabOrderAdd.indexOf(controlName);
    return idx === -1 ? -1 : idx + 1;
  }

  // ── Step Validation ────────────────────────────────────────────────────────

  /**
   * TRUE when every required field for the current step is valid.
   * Bound directly to the Next button: [disabled]="!isCurrentStepValid"
   */
  /** True when payment mode is TPA. */
  get isTpaMode(): boolean {
    return this.patientForm.get('payment_Mode')?.value === 'TPA';
  }

  /** True when TPA details have been confirmed via the modal (or mode is not TPA). */
  get isTpaValid(): boolean {
    if (!this.isTpaMode) return true;
    return this.tpaDetails !== null;
  }

  get isCurrentStepValid(): boolean {
    let fields = this.stepFields[this.currentStep] ?? [];
    if (fields.length === 0) return true;   // Step 1 — no user input required
    // NoPayment: payment_Mode is not required (no payment is collected now)
    if (this.currentStep === 4 && this.patientForm.get('payment_Type')?.value === paymentType.NoPayment) {
      fields = fields.filter(f => f !== 'payment_Mode');
    }
    const baseValid = fields.every(key => this.patientForm.get(key)?.valid ?? true);
    if (this.currentStep === 4) return baseValid && this.isTpaValid;
    return baseValid;
  }


  /**
   * TRUE when a field is invalid AND has been touched or dirtied.
   * For radio groups (gender, marital status):
   * Only show error if all radio options are touched and none is selected,
   * and only after focus leaves the group (on blur or moving to another input).
   */
  isFieldInvalid(fieldName: string): boolean {
    const c = this.patientForm.get(fieldName);
    if (!c) return false;
    const forceShow = this.stepTouched[this.currentStep];
    if (fieldName === 'patient_Gender') {
      return !!(c.invalid && (c.touched || forceShow));
    }
    if (fieldName === 'patient_Marital_Status') {
      return !!(c.invalid && (c.touched || forceShow));
    }
    return !!(c.invalid && (c.touched || forceShow));
  }

  // Track focus/blur for radio groups
  genderRadioFocused = false;
  maritalRadioFocused = false;

  onGenderRadioFocus() { this.genderRadioFocused = true; }
  onGenderRadioBlur()  { this.genderRadioFocused = false; this.patientForm.get('patient_Gender')?.markAsTouched(); }
  onMaritalRadioFocus() { this.maritalRadioFocused = true; }
  onMaritalRadioBlur()  { this.maritalRadioFocused = false; this.patientForm.get('patient_Marital_Status')?.markAsTouched(); }

  /**
   * Show error for radio group only if:
   * - none selected
   * - group is not focused (blurred)
   * - group has been touched (user interacted and left)
   */
  shouldShowRadioGroupError(type: 'gender' | 'maritalStatus', c: any): boolean {
    const isEmpty = !c.value;
    const groupFocused = type === 'gender' ? this.genderRadioFocused : this.maritalRadioFocused;
    // Only show error if group is blurred, has been touched, and none selected
    return !!(isEmpty && c.touched && !groupFocused);
  }

  /** Human-readable label for each form field. */
  private readonly fieldLabels: Record<string, string> = {
    patient_Name:           'Patient Name',
    patient_DOB:            'Date of Birth',
    patient_Age:            'Age',
    patient_Age_Group:      'Age Group',
    patient_Gender:         'Gender',
    patient_Marital_Status: 'Marital Status',
    patient_Address:        'Address',
    relation:               'Relation',
    relative_Name:          'Relative Name',
    patient_Contact:        'Mobile Number',
    patient_Email:          'Email',
    test_Name:              'Test Name',
    test_Amount:            'Test Amount',
    referred_By:            'Referred By',
    net_Amount:             'Net Amount',
    amount_Paid:            'Amount Paid',
    payment_Mode:           'Payment Mode',
    payment_Type:           'Payment Type',
  };

  /** Returns the first inline error message for a field. */
  getFieldError(fieldName: string): string {
    const c = this.patientForm.get(fieldName);
    const forceShow = this.stepTouched[this.currentStep];
    if (!c?.errors || (!c.touched && !forceShow)) return '';
    const e = c.errors;
    const label = this.fieldLabels[fieldName] ?? fieldName;
    if (e['required'])     return `${label} is required.`;
    if (e['email'])        return 'Please enter a valid email address.';
    if (e['contactNumber']) return 'Enter a valid 10-digit mobile number that does not start with 0.';
    if (e['pattern'])      return fieldName === 'patient_Contact'
                             ? 'Enter a valid 10-digit mobile number.'
                             : `${label} format is invalid.`;
    if (e['stringOnly'])   return `${label} must contain letters only.`;
    if (e['noFutureDate']) return 'Date of Birth cannot be a future date.';
    return `${label} is invalid.`;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  /** Marks all required fields for the current step as touched to reveal inline errors. */
  private markCurrentStepTouched(): void {
    this.stepTouched[this.currentStep] = true;
    const fields = this.stepFields[this.currentStep] ?? [];
    fields.forEach(f => this.patientForm.get(f)?.markAsTouched());
  }

  handleNext() {
    if (this.currentStep >= 4) return;
    if (!this.isCurrentStepValid) {
      this.markCurrentStepTouched();
      return;
    }
    this.currentStep++;
    this.showOtherTestDetails = true;
    this.showTest = false;
  }

  handlePrevious() {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.showOtherTestDetails = true;
      this.showTest = false;
    }
  }

  /** True when the user has attempted Next/Submit and the current step still has errors. */
  get hasStepErrors(): boolean {
    return this.stepTouched[this.currentStep] && !this.isCurrentStepValid;
  }

  // ── Referred By ────────────────────────────────────────────────────────────

  /** Maps an InstitutionType key string (e.g. 'Doctor') to its numeric enum value, or null if unrecognised. */
  private referredByTypeToInstitutionType(type: string): InstitutionType | null {
    const value = InstitutionType[type as keyof typeof InstitutionType];
    return value !== undefined ? (value as InstitutionType) : null;
  }

  loadDistinctReferredBy(): void {
    const type = this.patientForm.get('referred_By_Type')?.value || '';
    const institutionType = this.referredByTypeToInstitutionType(type);

    if (institutionType === null) {
      // Self / Other — no directory lookup needed
      this.referredByContacts = [];
      this.referredByOptions  = [];
      this.filteredReferredByOptions = [];
      this.showReferredBySuggestions = false;
      return;
    }

    this._contactService.getContactsByType(institutionType)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (contacts: ContactAddressListDto[]) => {
          this.referredByContacts = contacts;
          this.referredByOptions  = contacts.map(c => c.name);
          const keyword = this.patientForm.get('referred_By')?.value || '';
          this.filterReferredByOptions(keyword);
          this.showReferredBySuggestions = false;
        },
        error: () => {
          this.referredByContacts = [];
          this.referredByOptions  = [];
          this.filteredReferredByOptions = [];
          this.showReferredBySuggestions = false;
        }
      });
  }

 onReferredByInput(event?: Event): void {
  const selectedType = this.patientForm.get('referred_By_Type')?.value || '';
  if (!this._common.shouldLoadDistinctReferredBy(selectedType)) {
    this.showReferredBySuggestions = false;
    return;
  }
  // ✅ Fix Bug 2: read directly from the DOM event, not the (possibly stale) form value
  const keyword = event
    ? (event.target as HTMLInputElement).value
    : (this.patientForm.get('referred_By')?.value || '');
  this.filterReferredByOptions(keyword);
  this.showReferredBySuggestions = this.filteredReferredByOptions.length > 0;
  this.cdr.detectChanges();
  console.log('[onReferredByInput] showReferredBySuggestions:', this.showReferredBySuggestions, 'filtered:', this.filteredReferredByOptions);
}

  onReferredByFocus(): void {
  const selectedType = this.patientForm.get('referred_By_Type')?.value || '';
  if (!this._common.shouldLoadDistinctReferredBy(selectedType)) return;
  // On focus with empty field, show all loaded options
  const keyword = this.patientForm.get('referred_By')?.value || '';
  this.filterReferredByOptions(keyword);
  this.showReferredBySuggestions = this.filteredReferredByOptions.length > 0;
  this.cdr.detectChanges();
}
  onReferredByBlur(): void {
  // ✅ Fix Bug 3 (was in directive): delay so (mousedown) on a suggestion fires first
  setTimeout(() => {
    this.showReferredBySuggestions = false;
  }, 200);
}
  selectReferredBy(option: string): void {
    this.patientForm.patchValue({ referred_By: option });
    this.showReferredBySuggestions = false;
  }

  private filterReferredByOptions(keyword: string): void {
    this.filteredReferredByOptions = this._common.filterStringOptions(this.referredByOptions, keyword);
  }

  onReferredByTypeChange(): void {
    const selectedType = this.patientForm.get('referred_By_Type')?.value || '';
    this.patientForm.patchValue({ referred_By: this._common.getDefaultReferredByText(selectedType) }, { emitEvent: false });
    this.showReferredBySuggestions = false;
    if (this._common.shouldLoadDistinctReferredBy(selectedType)) {
      this.loadDistinctReferredBy();
    } else {
      this.referredByOptions = [];
      this.filteredReferredByOptions = [];
      // Do not show suggestions by default
      this.showReferredBySuggestions = false;
    }
    
  }

  // ── DOB / Age ──────────────────────────────────────────────────────────────

  onDateInput(event: Event): void {
    debugger;
    const input = event.target as HTMLInputElement;
    let { value, cursorPos } = this._common.formatDateInputMask(input.value);

    // Validate day and month as user types, but preserve leading zeros
    const parts = value.split('/');
    let dayStr = parts[0] || '';
    let monthStr = parts[1] || '';
    let yearStr = parts[2] || '';
    let changed = false;

    // Only correct if out of range, otherwise preserve user input (including leading zeros)
    let day = dayStr ? parseInt(dayStr, 10) : 0;
    let month = monthStr ? parseInt(monthStr, 10) : 0;
    if (day > 31) { dayStr = '31'; changed = true; }
    if (month > 12) { monthStr = '12'; changed = true; }
    if (day < 0 && dayStr) { dayStr = '01'; changed = true; }
    if (month < 0 && monthStr) { monthStr = '01'; changed = true; }
    if (changed) {
      value = `${dayStr}/${monthStr}/${yearStr}`;
      cursorPos = value.length;
    }

    input.value = value;
    input.setSelectionRange(cursorPos, cursorPos);
    this.patientForm.get('patient_DOB')?.setValue(value, { emitEvent: true });
  }

  onDateKeyUp(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    const cursorPos = input.selectionStart ?? input.value.length;
    const value = input.value;

    if (event.key === 'Backspace') {
      event.preventDefault();
      const { newValue, newPos } = this._common.handleDateBackspace(value, cursorPos);
      input.value = newValue;
      input.setSelectionRange(newPos, newPos);
      this.patientForm.get('patient_DOB')?.setValue(newValue, { emitEvent: true });
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const parts = value.split('/');
      if (parts.length !== 3) return;
      let [day, month, year] = parts.map(p => parseInt(p.replace(/\D/g, ''), 10) || 0);
      if (!day || !month || !year) return;

      const partIdx = cursorPos >= 6 ? 2 : cursorPos >= 3 ? 1 : 0;
      const delta = event.key === 'ArrowUp' ? 1 : -1;
      const today = new Date();

      if (partIdx === 0) {
        const max = new Date(year, month, 0).getDate();
        day = ((day - 1 + delta + max) % max) + 1;
      } else if (partIdx === 1) {
        month = ((month - 1 + delta + 12) % 12) + 1;
        day = Math.min(day, new Date(year, month, 0).getDate());
      } else {
        year = year + delta;
        if (year > today.getFullYear()) year = 1900;
        if (year < 1900) year = today.getFullYear();
        day = Math.min(day, new Date(year, month, 0).getDate());
      }

      const candidate = new Date(year, month - 1, day);
      candidate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      if (candidate > today) return;

      const pad = (n: number, l = 2) => n.toString().padStart(l, '0');
      const newValue = `${pad(day)}/${pad(month)}/${pad(year, 4)}`;
      input.value = newValue;
      input.setSelectionRange(cursorPos, cursorPos);
      this.patientForm.get('patient_DOB')?.setValue(newValue, { emitEvent: true });

      const age = this._common.calculateAge(newValue);
      this.patientForm.patchValue({
        patient_Age:       age,
        patient_Age_Group: this._common.calculateAgeRange(parseInt(age.split(' ')[0]) || 0)
      });
    }
  }

  calculateAge() {
    if (this.patientForm.controls['patient_DOB'].errors?.['noFutureDate']) return;
    const dob = this.patientForm.get('patient_DOB')?.value;
    if (!dob) return;

    const isoDate  = this._common.setYearofDate(dob); // used internally only — not written back to form
    const age      = this._common.calculateAge(isoDate);
    const ageRange = this._common.calculateAgeRange(parseInt(age.split(' ')[0]));
    this.patientForm.patchValue({ patient_Age: age, patient_Age_Group: ageRange });
  }

  /**
   * Called when the user picks a date in the hidden native picker.
   * Converts ISO yyyy-MM-dd → dd/mm/yyyy (the text-mask format),
   * writes it to the form control, then recalculates age.
   */
  onDobPickerChange(isoDate: string): void {
    if (!isoDate) return;
    const [y, m, d] = isoDate.split('-');
    const dmy = `${d}/${m}/${y}`;
    this.patientForm.get('patient_DOB')?.setValue(dmy, { emitEvent: true });
    this.calculateAge();
  }

  // ── Tests ──────────────────────────────────────────────────────────────────

  get filteredGroups():    GroupSubGroupModel[] { const q = this.query.trim().toLowerCase(); return q ? this.groupedTests.filter(g  => `${g.testGroupId} ${g.name}`.toLowerCase().includes(q))  : this.groupedTests;  }
  get filteredSubGroups(): GroupSubGroupModel[] { const q = this.query.trim().toLowerCase(); return q ? this.subGroupTests.filter(s  => `${s.testGroupId} ${s.name}`.toLowerCase().includes(q))  : this.subGroupTests; }
  get filteredTests():     any[]           { const q = this.query.trim().toLowerCase(); return q ? this.pathologyTest.filter(t  => `${t.testCode} ${t.testName}`.toLowerCase().includes(q)) : this.pathologyTest; }
  get totalAmount(): number { return this.selectedTests.reduce((s, it) => s + Number(it.price || 0), 0); }

  openTestForm(event: Event): void {
    this.query = '';
    this._testService.getTestGroupList().pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: GroupSubGroupModel[]) => {
        this.groupedTests = res ?? [];
        this.selectedTestGroup = this.groupedTests[0];
        this.selectedGroupId = this.selectedTestGroup?.testGroupId;
        this.getSubGroupList(this.selectedTestGroup!);
      },
      error: () => { this.groupedTests = []; this.toastr.error('Failed to load test groups', 'Error'); }
    });
  }

  getSubGroupList(tg: GroupSubGroupModel): void {
    this.selectedTestGroup = tg;
    this._testService.getTestSubGroupList(tg.testGroupId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: GroupSubGroupModel[]) => {
        this.subGroupTests = res ?? [];
        this.selectedSubGroup = this.subGroupTests[0];
        this.selectedSubGroupId = this.selectedSubGroup?.testGroupId;
        this.getMedicalTestList(this.selectedSubGroup!);
      },
      error: () => { this.subGroupTests = []; this.toastr.error('Failed to load sub-groups', 'Error'); }
    });
  }

  getMedicalTestList(sg: GroupSubGroupModel): void {
    this.selectedSubGroup = sg;
    this._testService.getMedicalTestList(sg.testGroupId).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: GroupSubGroupModel[]) => {
        this.pathologyTest = res ?? [];
        this.selectedTest  = this.pathologyTest[0];
        const el = document.getElementById('testCatalogModal');
          if (el) this.showModal('testCatalogModal');
      },
      error: () => { this.pathologyTest = []; this.toastr.error('Failed to load tests', 'Error'); }
    });
  }

  getSelectedClass(item: any): string {
    return (item === this.selectedTestGroup || item === this.selectedSubGroup || item === this.selectedTest)
      ? 'selectedTestFormRow' : '';
  }

  selectGroup(g: GroupSubGroupModel)    { this.selectedGroupId = g.testGroupId; this.getSubGroupList(g); }
  selectSubGroup(s: GroupSubGroupModel) { this.selectedSubGroupId = s.testGroupId; this.getMedicalTestList(s); }

  toggleTestSelection(t: TestItem) {
    this.focusedTestId = t.testCode;
    if (this.selectedTestIds.has(t.testCode)) {
      this.selectedTestIds.delete(t.testCode);
      this.selectedTests = this.selectedTests.filter(x => x.testCode !== t.testCode);
      this.toastr.info(`${t.testName} removed`);
    } else {
      this.selectedTestIds.add(t.testCode);
      this.selectedTests = [...this.selectedTests, t];
      this.toastr.info(`${t.testName} added`);
    }
  }

  removeSelected(testId: string) {
    const t = this.selectedTests.find(x => x.testCode === testId);
    if (!t) return;
    this.selectedTestIds.delete(testId);
    this.selectedTests = this.selectedTests.filter(x => x.testCode !== testId);
    this.toastr.info(`${t.testName} removed`);
  }

  modalTestClose() {
    this.patientForm.patchValue({
      test_Name:   this.selectedTests.map(t => t.testName).join(', '),
      test_Amount: this.totalAmount
    });
    const el = document.getElementById('testCatalogModal');
    if (el) this.hideModal('testCatalogModal');
    this.calculateNetAmount();
  }

  // ── Collection Modal ───────────────────────────────────────────────────────

  onCollectedOutsideClick(event: any) {
    if (event.target.checked) {
      const el = document.getElementById('collectionModal');
      if (el) this.showModal('collectionModal');
    }
  }

  modalCollectionClose() {
    const el = document.getElementById('collectionModal');
    if (el) this.hideModal('collectionModal');
    if (!this.patientForm.get('area')?.value && !this.patientForm.get('collected_By')?.value) {
      this.patientForm.patchValue({ collected_Outside: false });
    }
  }

  clearOutsideCollectionModal() {
    this.patientForm.patchValue({ collected_By: '', area: '', collected_Outside: false });
    this.modalCollectionClose();
  }

  // ── Payment ────────────────────────────────────────────────────────────────

  /** Maximum discount % allowed for this lab (admin-configured). */
  get maxDiscountPercent(): number { return this._token.getMaxDiscountPercent(); }

  calculateNetAmount() {
    const testAmount  = this.patientForm.get('test_Amount')?.value;
    const discount    = this.patientForm.get('discount')?.value;
    const maxDiscount = this._token.getMaxDiscountPercent();

    if (discount > maxDiscount) {
      this.patientForm.get('discount')?.setErrors({ maxExceeded: true });
      return;
    }
    this.patientForm.get('discount')?.setErrors(null);

    if (discount <= maxDiscount && testAmount > 0) {
      this.patientForm.patchValue({ net_Amount: testAmount - discount * testAmount / 100 });
    }
  }

  calculateDiscount() {
    const testAmount = this.patientForm.get('test_Amount')?.value;
    const netAmount  = this.patientForm.get('net_Amount')?.value;
    if (netAmount > 0 && netAmount <= testAmount && testAmount > 0) {
      this.patientForm.patchValue({ discount: (testAmount - netAmount) * 100 / testAmount });
    }
  }

  /**
   * Live calculation — bound to (input) on the Amount Paid field inside the
   * Partial Payment modal. Updates amount_Pending in real time.
   *
   * Reads value from the DOM event directly (not from the form control) to avoid
   * the NumberValueAccessor timing gap where the control value hasn't been updated
   * yet when the (input) handler fires.
   *
   * Does NOT use { emitEvent: false } so that Angular's FormControlName directive
   * receives the valueChanges notification and calls writeValue() on the step-4
   * readonly input — keeping both bound inputs in sync.
   */
  onAmountPaidInput(event: Event) {
    this.amountPaidError = '';
    const raw        = (event.target as HTMLInputElement).value;
    const amountPaid = parseFloat(raw) || 0;
    const netAmount  = parseFloat(this.patientForm.get('net_Amount')?.value) || 0;

    if (amountPaid <= 0) {
      this.patientForm.patchValue({ amount_Pending: '' });
      return;
    }
    if (amountPaid >= netAmount) {
      this.amountPaidError = `Amount paid cannot equal or exceed net amount (₹${netAmount}). Use "Full" payment type instead.`;
      this.patientForm.patchValue({ amount_Pending: 0 });
      return;
    }

    const pending = +(netAmount - amountPaid).toFixed(2);
    this.patientForm.patchValue({ amount_Pending: pending });
  }

  onTpaConfirmed(details: TpaDetails): void {
    this.tpaDetails   = details;
    this.showTpaModal = false;
  }

  onTpaCancelled(): void {
    this.showTpaModal = false;
    if (!this.tpaDetails) {
      // Never confirmed — revert mode to Cash
      this.patientForm.patchValue({ payment_Mode: 'Cash' });
    }
  }

  editTpaDetails(): void {
    this.showTpaModal = true;
  }

  /**
   * Called when the Payment TYPE radio changes.
   * Receives the selected value directly from the template to avoid any
   * FormControl timing issues with the change event.
   */
  onPaymentTypeChange(selectedType: string): void {
    this.paymentConfirmed = false;
    this.amountPaidError  = '';

    if (selectedType === paymentType.Full) {
      this.patientForm.patchValue({
        amount_Paid:    this.patientForm.get('net_Amount')?.value,
        amount_Pending: 0
      });
    } else if (selectedType === paymentType.NoPayment) {
      // No payment now — 0 paid, full amount pending; no modal needed
      this.patientForm.patchValue({
        amount_Paid:    0,
        amount_Pending: this.patientForm.get('net_Amount')?.value ?? 0
      });
    } else {
      // Partial — reset amounts and open modal for the user to enter how much they're paying
      this.patientForm.patchValue({ amount_Paid: '', amount_Pending: '' });
      this.showModal('paymentModal');
    }
  }

  /**
   * Called when the Payment MODE select changes.
   * Handles TPA detection only.
   */
  onPaymentModeChange() {
    if (this.isTpaMode) {
      // Switching to TPA — clear any prior details and open the modal
      this.tpaDetails   = null;
      this.showTpaModal = true;
    } else {
      // Switching away from TPA — clear saved TPA details
      this.tpaDetails   = null;
      this.showTpaModal = false;
    }
    // For Partial type, reset confirmation so the user re-confirms with the new mode
    if (this.patientForm.get('payment_Type')?.value === paymentType.Partial) {
      this.paymentConfirmed = false;
      this.amountPaidError  = '';
      this.patientForm.patchValue({ amount_Paid: '', amount_Pending: '' });
      this.showModal('paymentModal');
    }
  }

  /**
   * Called when the user clicks "Confirm" in the Partial Payment modal.
   *
   * Reads the modal's native input value directly (not from the form control)
   * to avoid any NumberValueAccessor timing gap, then explicitly patches both
   * amount_Paid and amount_Pending without emitEvent:false so that Angular's
   * FormControlName directive propagates writeValue() to the step-4 readonly
   * inputs and the view updates reliably when the modal closes.
   */
  confirmPayment() {
    // Read directly from the DOM to avoid form-control timing issues
    const modalInput = document.querySelector<HTMLInputElement>(
      '#paymentModal input[formcontrolname="amount_Paid"], #paymentModal input[ng-reflect-name="amount_Paid"]'
    );
    const rawValue   = modalInput?.value ?? (this.patientForm.get('amount_Paid')?.value ?? '');
    const amountPaid = parseFloat(String(rawValue)) || 0;
    const netAmount  = parseFloat(String(this.patientForm.get('net_Amount')?.value)) || 0;

    if (amountPaid <= 0) {
      this.amountPaidError = 'Please enter the correct amount paid.';
      return;
    }
    if (amountPaid >= netAmount) {
      this.amountPaidError = `Amount paid cannot equal or exceed net amount (₹${netAmount}).`;
      return;
    }

    const pending = +(netAmount - amountPaid).toFixed(2);

    this.amountPaidError = '';

    // Explicitly patch both values — this fires valueChanges (no emitEvent:false)
    // so FormControlName's writeValue() runs on every bound input including the
    // step-4 readonly fields, guaranteeing the view shows the confirmed values.
    this.patientForm.patchValue({
      amount_Paid:    amountPaid,
      amount_Pending: pending
    });

    this.paymentConfirmed = true;
    this.modalPaymentClose();
  }

  modalPaymentClose() {
    const el = document.getElementById('paymentModal');
    if (el) this.hideModal('paymentModal');
  }

  /** Opens the Partial Payment modal again so the user can amend confirmed values. */
  editPaymentDetails() {
    this.paymentConfirmed = false;
    this.amountPaidError  = '';
    this.showModal('paymentModal');
  }

  clearPaymentModal() {
    // Cancel → revert to Full payment, clear partial amounts
    this.paymentConfirmed = false;
    this.amountPaidError  = '';
    this.patientForm.patchValue({
      amount_Paid:    '',
      amount_Pending: '',
      payment_Type:   this.paymentType[0]   // 'Full'
    });
    this.modalPaymentClose();
  }

  // ── Serial / Patient ID ────────────────────────────────────────────────────

  getSerialNPatientId() {
    this._patientService.getSerialNPatientId().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data: any) => this.patientForm.patchValue({ serial_Number: data.key, patient_Id: data.value }),
      error: (err: any)     => this.toastr.error('Failed to load serial number', 'Error')
    });
  }

  // ── Register ───────────────────────────────────────────────────────────────

  registerPatient() {
    if (!this.patientForm.valid) {
      this.stepTouched[this.currentStep] = true;
      this.patientForm.markAllAsTouched();
      return;
    }

    // Auto-create a contact directory entry for the referrer if they are a
    // Doctor or Lab and the typed name isn't already in the loaded list.
    const referredByName = this.patientForm.get('referred_By')?.value?.trim() || '';
    const referredType   = this.patientForm.get('referred_By_Type')?.value || '';
    const institutionType = this.referredByTypeToInstitutionType(referredType);
    const alreadyExists   = this.referredByContacts.some(
      c => c.name.toLowerCase() === referredByName.toLowerCase()
    );

    if (institutionType !== null && referredByName && !alreadyExists) {
      this._contactService.getOrCreate(referredByName, institutionType)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => this.doRegisterPatient(),
          error: () => this.doRegisterPatient() // proceed even if contact creation fails
        });
      return;
    }

    this.doRegisterPatient();
  }

  private doRegisterPatient() {

    this.isLoading = true;
    const f = this.patientForm.getRawValue();

    // ── Build test IDs comma string ────────────────────────────────────
    let testIds = '';
    this.selectedTestIds.forEach(id => (testIds += id + ','));
    testIds = testIds.slice(0, -1);

    // ── Determine final paid / pending amounts ─────────────────────────
    const netAmt      = f.net_Amount ?? 0;
    const isFullPay   = f.payment_Type === paymentType.Full;
    const isNoPayment = f.payment_Type === paymentType.NoPayment;
    const amtPaid     = isFullPay ? netAmt : isNoPayment ? 0 : (f.amount_Paid || 0);
    const amtPending  = isFullPay ? 0 : isNoPayment ? netAmt : +(netAmt - amtPaid).toFixed(2);

    // ── Nested Receipt ─────────────────────────────────────────────────
    // Always created — even for No Payment — so test/net amounts are stored
    // and the receipt module can show the balance and allow "Pay Now" later.
    // For No Payment: amountPaid=0, amountPending=netAmount, paymentMode=''.
    const isTpa = f.payment_Mode === 'TPA';
    const receipt: ReceiptCreateDto = {
      patientTestId: 0,          // derived server-side from the new PatientTest row
      testAmount:    f.test_Amount ?? 0,
      discount:      f.discount    ?? 0,
      netAmount:     netAmt,
      paymentType:   f.payment_Type,
      amountPaid:    amtPaid,
      amountPending: amtPending,
      paymentMode:   isNoPayment ? '' : f.payment_Mode,
      // TPA fields — only included when mode is TPA and details confirmed
      ...(isTpa && this.tpaDetails && {
        tpaName:            this.tpaDetails.tpaName            || undefined,
        tpaPolicyNumber:    this.tpaDetails.tpaPolicyNumber    || undefined,
        tpaClaimNumber:     this.tpaDetails.tpaClaimNumber     || undefined,
        tpaApprovalCode:    this.tpaDetails.tpaApprovalCode    || undefined,
        tpaPolicyValidFrom: this.tpaDetails.tpaPolicyValidFrom || undefined,
        tpaPolicyValidTo:   this.tpaDetails.tpaPolicyValidTo   || undefined,
      }),
    };

    // ── Nested Test — matches backend AddPatientTestDTO ────────────────
    const test = {
      test_Id:          testIds,
      test_Name:         f.test_Name,
      urgent_Report:     f.urgent_Report    ?? false,
      test_Amount:       f.test_Amount      ?? 0,
      referred_By_Type:  f.referred_By_Type ?? '',
      referred_By:  f.referred_By      ?? '',
      remark:            f.remark           ?? '',
      collected_Outside: f.collected_Outside ?? false,
      area:              f.area             ?? '',
      collected_By:      f.collected_By     ?? '',
      sampling_Done:     f.sampling_Done    ?? '',
    };

    // ── Root patient payload — matches backend PatientModel ────────────
    const payload = {
      serial_Number:          f.serial_Number,
      patient_Id:             f.patient_Id,
      patient_Name:           `${f.patient_Salutation} ${f.patient_Name}`,
      patient_DOB:            f.patient_DOB,
      patient_Age:            f.patient_Age,
      patient_Age_Group:      f.patient_Age_Group,
      patient_Gender:         f.patient_Gender,
      patient_Marital_Status: f.patient_Marital_Status,
      patient_Address:        f.patient_Address,
      relation:               f.relation,
      relative_Name:          f.relative_Name,
      patientDialingContact:  `${f.country_Code}-${f.patient_Contact}`,
      patient_Email:          f.patient_Email,
      patient_Reg_Date:       f.patient_Reg_Date,
      test,
      receipt,
    };

    this._patientService.AddPatient(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: any) => {
        this.isLoading = false;
        if (res) {
          this.toastr.success('Patient Registered Successfully', 'Success');
          this._route.navigate(['/patients']);
        }
      },
      error: (err: any) => {
        this.isLoading = false;
        this.toastr.error('Failed to register patient', 'Error');
      }
    });
  }

  getInvalidControls(form: FormGroup): string[] {
    return Object.keys(form.controls).filter(key => form.get(key)?.invalid);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Simple DOM-based modal helpers (replaces Bootstrap modal usage)
  private showModal(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    // show modal
    el.classList.add('show');
    el.classList.remove('fade');
    (el as HTMLElement).style.display = 'block';
    el.setAttribute('aria-hidden', 'false');
    el.setAttribute('aria-modal', 'true');
    // prevent body scroll
    document.body.classList.add('modal-open');
    // add backdrop
    const existing = document.getElementById(`backdrop-${id}`);
    if (!existing) {
      const backdrop = document.createElement('div');
      backdrop.id = `backdrop-${id}`;
      backdrop.className = 'modal-backdrop fade show';
      document.body.appendChild(backdrop);
    }
  }

  private hideModal(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    (el as HTMLElement).style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    el.removeAttribute('aria-modal');
    // remove backdrop
    const backdrop = document.getElementById(`backdrop-${id}`);
    if (backdrop) backdrop.remove();
    // restore body scroll if no other backdrops
    if (!document.querySelector('.modal-backdrop')) {
      document.body.classList.remove('modal-open');
    }
  }
}