import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { StepperComponent } from '../stepper/stepper.component';
import { ToastrService } from 'ngx-toastr';
import { Router } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, filter, switchMap, map, catchError } from 'rxjs/operators';
import { tabOrderAdd, validationMessages, DEFAULT_DIALING_CODE } from 'src/app/constant/constants';
import { FieldErrorComponent } from 'src/app/shared/field-error/field-error.component';
import { FormKeyboardDirective } from 'src/app/shared/directives/form-keyboard.directive';
import { NumericOnlyDirective } from 'src/app/shared/directives/numeric-only.directive';
import { ReceiptCreateDto } from 'src/app/models/receipt/receipt-create.dto';
import { PatientService } from 'src/app/services/patientServices/patient.service';
import { SampleLabelService } from 'src/app/services/sampleLabelServices/sample-label.service';
import { BookingResultDto } from 'src/app/models/patient/booking-result.dto';
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
// The one payment dialog. This screen used to carry its own Bootstrap modal
// with its own markup, labels and buttons; it now opens the same component
// Patient Tests and Bill / Receipt open, configured to collect only the figure
// this step cannot (how much is being paid now) and to save nothing, because
// the payment is written with the booking in registerPatient().
import { PaymentModalComponent, PaymentModalResult } from 'src/app/shared/payment-modal/payment-modal.component';
import { TokenService }              from 'src/app/core/interceptors/token.service';
import { TestProtocolPanelComponent } from 'src/app/shared/test-protocol-panel/test-protocol-panel.component';
// The catalogue itself. Shared with AddTestModalComponent so registration and
// Add New Test are the same screen rather than two look-alikes that drift.
import {
  DcTestPickerComponent, DcPickableTest, DcTestGroup,
} from 'src/app/shared/simple/dc-test-picker.component';
import {
  TestBookingProtocolsDto,
  TestProtocolDto,
} from 'src/app/models/path-test/protocol/test-protocol.model';

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
    NumericOnlyDirective,
    PaymentCalculatorComponent,
    PaymentModalComponent,
    TestProtocolPanelComponent,
    DcTestPickerComponent,
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
    4: ['discount', 'discount_Reason', 'net_Amount', 'payment_Type', 'amount_Paid', 'amount_Pending', 'payment_Mode']
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

  // ── Shared payment dialog ──────────────────────────────────────────────────
  // Visibility is a plain boolean now, not a Bootstrap show/hide call, because
  // the dialog is an Angular component bound with [visible] exactly as it is on
  // Patient Tests and Bill / Receipt.
  showPaymentModal = false;
  /** Amount the dialog opens at, so Edit shows the figure being amended. */
  paymentModalSeed = 0;
  /**
   * True when a discount edit has just reset a Partial payment back to Full.
   * Drives the note on the payment step — the payment type changes under the
   * user, so it has to say so. Cleared as soon as they touch the type again.
   */
  partialResetByDiscount = false;
  /** Tracks whether Next/Submit was clicked on each step — triggers inline errors. */
  stepTouched: Record<number, boolean> = { 1: false, 2: false, 3: false, 4: false };

  // ── TPA state ──────────────────────────────────────────────────────────────
  showTpaModal = false;
  tpaDetails: TpaDetails | null = null;
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
  showTest: boolean = false;
  showOtherTestDetails: boolean = true;

  /** True while the catalogue has taken over the card from the step form. */
  showTestCatalog = false;

  /**
   * The catalogue as a tree, for <dc-test-picker>. The old browser fetched one
   * column at a time because one column was all it could show; the picker also
   * searches across every test, so it needs the lot up front.
   */
  testGroups: DcTestGroup[] = [];
  /** The same catalogue flat and de-duplicated — resolves a code the picker returns. */
  allTests: TestItem[] = [];
  isLoadingAllTests = false;

  selectedTestIds = new Set<string>();
  selectedTests: TestItem[] = [];
  focusedTestId: string | null = null;

  // ── Sample collection protocols ────────────────────────────────────────────
  // Mirrors AddTestModalComponent — the two pickers are separate components, so a
  // change to one belongs in both.
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
  /** Collapsed by default so selecting tests stays uncluttered; the operator opens it with the toggle. */
  showSelectedProtocols = false;
  /** Catalogue protocol panel for the last-clicked test — hidden until the operator asks for it. */
  showFocusedProtocol = false;

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
    private _sampleLabelService: SampleLabelService,
  ) {
    this.patientForm = this.fb.group({
      country_Code:      ['+91', Validators.required],
      patient_Reg_Date:     new FormControl({ value: new Date().toISOString().split('T')[0], disabled: true }),
      serial_Number:        new FormControl({ value: 0,   disabled: true }),
      patient_Id:           new FormControl({ value: '',  disabled: true }),
      patient_Salutation:   ['Mr.', Validators.required],
      patient_Name:         ['', [Validators.required, AppValidators.stringOnly()]],
      // Date of birth is no longer required on its own: a patient who does not
      // know it can be recorded by typing their age instead, and the DOB is
      // back-calculated. `patient_Age` stays required, so one of the two routes
      // must still be used — it is filled by whichever the operator chooses.
      patient_DOB:          ['', [AppValidators.noFutureDate()]],
      patient_Age:          ['', Validators.required],
      patient_Age_Group:    ['', Validators.required],

      // Age as three parts. These are the inputs; `patient_Age` above is the
      // composed "41Y 3M 12D" string that goes to the API.
      patient_Age_Years:    [null],
      patient_Age_Months:   [null],
      patient_Age_Days:     [null],
      patient_Gender:       ['', Validators.required],
      // Optional: plenty of walk-in patients decline to state it, and nothing
      // downstream depends on it.
      patient_Marital_Status: [''],
      // Optional: walk-in patients often register without giving an address.
      patient_Address:      [''],
      relation:             [''],
      // Optional, but still letters-only when something IS typed — stringOnly()
      // returns null for an empty value, so a blank field is valid.
      relative_Name:        ['', [AppValidators.stringOnly()]],
      // Not required, but still validated when something IS typed —
      // contactNumber() and email() both return null for an empty value, so a
      // blank field is valid while a half-typed number is not.
      patient_Contact:      ['', [AppValidators.contactNumber()]],
      patient_Email:        ['', [Validators.email]],
      test_id:              [''],
      test_Name:            ['', Validators.required],
      urgent_Report:        [false],
      // Per-booking: send THIS booking's report on WhatsApp, to whatsApp_Number.
      // The number is pre-filled from patient_Contact and may be changed to send
      // the report elsewhere; required only while the toggle is on
      // (see syncWhatsAppNumberRule).
      report_On_WhatsApp:   [false],
      whatsApp_Number:      ['', [AppValidators.contactNumber()]],
      test_Amount:          ['', Validators.required],
      referred_By_Type:     ['Doctor', Validators.required],
      referred_By:          ['', Validators.required],
      remark:               [''],
      collected_Outside:    [false],
      area:                 [''],
      collected_By:         [''],
      sampling_Done:        [this._sampling.getDefault(), Validators.required],   // index 0 of the list
      discount:             [0],
      // Required only while the discount is above the lab limit (it then goes to a
      // Super Admin, who needs to know why) — toggled in syncDiscountApproval().
      discount_Reason:      ['', [Validators.maxLength(500)]],
      net_Amount:           ['0', Validators.required],
      payment_Type:         ['Full', Validators.required],
      amount_Paid:          ['0', Validators.required],
      amount_Pending:       ['0', Validators.required],
      payment_Mode:         ['Cash', Validators.required]
    });
  }

  ngOnInit() {
      this.initializeComponent();
      this.countryCodes = [{ code: DEFAULT_DIALING_CODE, label: `India (${DEFAULT_DIALING_CODE})` }];
      this.patientForm.patchValue({ country_Code: DEFAULT_DIALING_CODE });

      // Load collection boys for "Collected By" dropdown.
      // Uses the LabOperations-scoped lookup, not api/User (Admin-only), so a
      // Receptionist / Lab Assistant isn't 403'd off this page.
      this._memberService.getCollectionBoysLookup()
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
          this.clearPartialAmounts();
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
            this.clearPartialAmounts();
          }
        }
      });

    this.patientForm.get('report_On_WhatsApp')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(on => this.syncWhatsAppNumberRule(!!on));

    // While the WhatsApp number is still the patient's own mobile (or empty), keep it
    // in step when the mobile is corrected on the Patient step. A number that was
    // deliberately changed to someone else's is left alone.
    let lastMobile = `${this.patientForm.get('patient_Contact')?.value ?? ''}`;
    this.patientForm.get('patient_Contact')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        const mobile = `${value ?? ''}`;
        const number = this.patientForm.get('whatsApp_Number');
        const current = `${number?.value ?? ''}`;
        if (this.reportOnWhatsApp && number && (current === '' || current === lastMobile)) {
          number.setValue(mobile, { emitEvent: false });
        }
        lastMobile = mobile;
      });

    this.patientForm.get('discount')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // A discount edit changes the net amount, so any partial amount already
        // entered is stale. This used to blank amount_Paid / amount_Pending,
        // which stranded the user: both fields are readonly and can only be
        // filled from the Partial Payment modal, and the only control that
        // reopens that modal sits behind *ngIf="paymentConfirmed" — which this
        // same code had just set false. Two blank, required, unfillable fields.
        //
        // The booking now falls back to Full payment instead. The payment_Type
        // subscription above rewrites amount_Paid / amount_Pending to the new
        // net, so the form stays valid, and the radio visibly moves to Full so
        // the change is not silent (the note on the step says so too). The user
        // picks Partial again if they still want one, which reopens the modal.
        //
        // Deliberately not conditional on paymentConfirmed: closing the modal
        // with the X leaves Partial selected and unconfirmed, and that state
        // needs the same escape.
        //
        // This runs per keystroke in the discount box, but only the first one
        // does anything — after it the type is Full, not Partial.
        if (this.patientForm.get('payment_Type')?.value === paymentType.Partial) {
          this.paymentConfirmed       = false;
          this.amountPaidError        = '';
          this.partialResetByDiscount = true;
          this.patientForm.patchValue({ payment_Type: paymentType.Full });
        }
        // Runs after the control holds the new value, whichever order the (input)
        // handler and the value accessor fired in — so an over-limit discount
        // always ends in a consistent No Payment state.
        this.syncDiscountApproval();
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

  // ── Report on WhatsApp ─────────────────────────────────────────────────────

  get reportOnWhatsApp(): boolean {
    return !!this.patientForm?.get('report_On_WhatsApp')?.value;
  }

  /** WhatsApp is on but there is no valid number to send to yet. */
  get whatsAppNeedsNumber(): boolean {
    const number = this.patientForm.get('whatsApp_Number');
    return this.reportOnWhatsApp && (!number?.value || !!number?.invalid);
  }

  /** The WhatsApp number typed for this booking is the patient's own mobile. */
  get whatsAppIsPatientNumber(): boolean {
    const mobile = `${this.patientForm.get('patient_Contact')?.value ?? ''}`;
    const number = `${this.patientForm.get('whatsApp_Number')?.value ?? ''}`;
    return !!mobile && mobile === number;
  }

  /**
   * Turning the toggle on makes the WhatsApp number required and pre-fills it with
   * the patient's mobile, which staff can change to send the report to someone else.
   * Turning it off clears the number. The patient's own mobile stays optional.
   */
  private syncWhatsAppNumberRule(on: boolean): void {
    const number = this.patientForm.get('whatsApp_Number');
    const mobile = this.patientForm.get('patient_Contact');
    if (!number) return;
    if (on) {
      number.addValidators(Validators.required);
      if (!number.value && mobile?.value && mobile.valid) {
        number.setValue(`${mobile.value}`, { emitEvent: false });
      }
    } else {
      number.removeValidators(Validators.required);
      number.setValue('', { emitEvent: false });
    }
    number.updateValueAndValidity({ emitEvent: false });
  }

  /** Puts the patient's mobile back into the WhatsApp number field. */
  usePatientMobileForWhatsApp(): void {
    const mobile = this.patientForm.get('patient_Contact')?.value;
    this.patientForm.get('whatsApp_Number')?.setValue(mobile ? `${mobile}` : '');
  }

  get isCurrentStepValid(): boolean {
    // Test step: a WhatsApp report needs a number to send to (the field under the toggle).
    if (this.currentStep === 3 && this.whatsAppNeedsNumber) return false;
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
    if (this.currentStep === 3 && this.reportOnWhatsApp) {
      this.patientForm.get('whatsApp_Number')?.markAsTouched();
    }
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

  /**
   * The typed DOB as YYYY-MM-DD for the calendar picker beside the text box.
   *
   * The text box is the single source of truth for the date; this getter is how
   * the calendar follows it, so opening the calendar after typing 11/08/2001
   * lands on August 2001 with the 11th highlighted rather than on today's month.
   * Empty while the date is still half-typed or impossible — see dmyToIso().
   */
  get dobIso(): string {
    return this._common.dmyToIso(this.patientForm.get('patient_DOB')?.value);
  }

  onDateInput(event: Event): void {
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

      // One place computes age from DOB — see calculateAge().
      this.calculateAge();
    }
  }

  /**
   * Date of birth → age. Fills the three Y/M/D boxes, the composed string that
   * is sent to the API, and the age group.
   *
   * `emitEvent: false` on the parts: they are being written BY this method, and
   * letting them emit would call onAgePartChange(), which writes the DOB back —
   * a loop that would fight the operator mid-keystroke.
   */
  calculateAge() {
    if (this.patientForm.controls['patient_DOB'].errors?.['noFutureDate']) return;
    const dob = this.patientForm.get('patient_DOB')?.value;
    if (!dob) return;

    const isoDate = this._common.setYearofDate(dob); // used internally only — not written back to form
    const { years, months, days } = this._common.calculateAgeParts(isoDate);

    this.patientForm.patchValue({
      patient_Age_Years:  years,
      patient_Age_Months: months,
      patient_Age_Days:   days,
    }, { emitEvent: false });

    this.patientForm.patchValue({
      patient_Age:       this._common.formatAgeParts(years, months, days),
      patient_Age_Group: this._common.calculateAgeRange(years),
    });
  }

  /**
   * Age → date of birth. The other direction, for the patient who knows they
   * are "about 45" but not the date.
   *
   * The DOB it produces is an approximation, which is what an age-only record
   * is regardless — writing it keeps every downstream consumer (reports, the
   * report header, the age group) working off one field.
   */
  onAgePartChange(): void {
    const f = this.patientForm.value;
    const years  = Number(f.patient_Age_Years)  || 0;
    const months = Number(f.patient_Age_Months) || 0;
    const days   = Number(f.patient_Age_Days)   || 0;

    // Keep each part inside its own range rather than rejecting it: 18 months
    // is a thing people type, and it means a year and a half.
    const clamped = {
      years:  Math.max(0, Math.min(150, years)),
      months: Math.max(0, Math.min(11,  months)),
      days:   Math.max(0, Math.min(31,  days)),
    };
    if (clamped.months !== months || clamped.days !== days || clamped.years !== years) {
      this.patientForm.patchValue({
        patient_Age_Years:  clamped.years  || null,
        patient_Age_Months: clamped.months || null,
        patient_Age_Days:   clamped.days   || null,
      }, { emitEvent: false });
    }

    const hasAge = clamped.years > 0 || clamped.months > 0 || clamped.days > 0;

    this.patientForm.patchValue({
      patient_Age:       hasAge ? this._common.formatAgeParts(clamped.years, clamped.months, clamped.days) : '',
      patient_Age_Group: hasAge ? this._common.calculateAgeRange(clamped.years) : '',
      patient_DOB:       hasAge ? this._common.dobFromAgeParts(clamped.years, clamped.months, clamped.days) : '',
    }, { emitEvent: false });

    this.patientForm.get('patient_Age')?.markAsDirty();
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

  get totalAmount(): number { return this.selectedTests.reduce((s, it) => s + Number(it.price || 0), 0); }

  /** Codes of the chosen tests, in pick order — what the picker highlights. */
  get selectedTestCodes(): string[] {
    return this.selectedTests.map(t => t.testCode).filter(c => !!c);
  }

  /** Hands the card over to the catalogue and fetches it if this is the first time. */
  openTestForm(_event?: Event): void {
    this.showTestCatalog = true;
    this.loadAllTests();
  }

  /** Back out without touching the selection — the form is exactly as it was. */
  cancelTestCatalog(): void {
    this.showTestCatalog = false;
  }

  /**
   * The whole catalogue — groups, their sub-groups, and the tests in each.
   *
   * Built from the three endpoints that already exist, so no API change was
   * needed. Every request fails soft: one bad sub-group costs its own tests,
   * not the whole catalogue. Cached for the life of the component.
   *
   * Mirrors AddTestModalComponent.loadAllTests.
   */
  private loadAllTests(): void {
    if (this.testGroups.length > 0 || this.isLoadingAllTests) return;
    this.isLoadingAllTests = true;

    this._testService.getTestGroupList().pipe(
      switchMap((groups: GroupSubGroupModel[]) => {
        if (!groups || groups.length === 0) return of([] as any[]);

        return forkJoin(groups.map(group =>
          this._testService.getTestSubGroupList(group.testGroupId).pipe(
            catchError(() => of([] as GroupSubGroupModel[])),
            switchMap((subs: GroupSubGroupModel[]) => {
              if (!subs || subs.length === 0) {
                return of({
                  id: group.testGroupId, name: group.name,
                  subGroups: [] as { id: string; name: string; tests: DcPickableTest[] }[],
                  rawTests:  [] as TestItem[],
                });
              }
              return forkJoin(subs.map(sub =>
                this._testService.getMedicalTestList(sub.testGroupId).pipe(
                  catchError(() => of([] as any[])),
                  map((tests: any[]) => ({
                    id:       sub.testGroupId,
                    name:     sub.name,
                    tests:    (tests ?? []).map((t: any) => this.toPickable(t as TestItem, group.name)),
                    rawTests: (tests ?? []) as TestItem[],
                  })),
                )
              )).pipe(map(subGroups => ({
                id:        group.testGroupId,
                name:      group.name,
                subGroups: subGroups.map(sg => ({ id: sg.id, name: sg.name, tests: sg.tests })),
                rawTests:  ([] as TestItem[]).concat(...subGroups.map(sg => sg.rawTests)),
              })));
            }),
          )
        ));
      }),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (groups: any[]) => {
        this.testGroups = (groups ?? []).map((g: any) => ({
          id: g.id, name: g.name, subGroups: g.subGroups ?? [],
        })) as DcTestGroup[];

        // A test can sit under more than one sub-group, and the picker hands
        // back a code we have to resolve to exactly one TestItem.
        const seen = new Set<string>();
        this.allTests = ([] as TestItem[])
          .concat(...(groups ?? []).map((g: any) => g.rawTests ?? []))
          .filter((t: TestItem) => {
            const code = String(t?.testCode ?? '');
            if (!code || seen.has(code)) return false;
            seen.add(code);
            return true;
          });

        this.isLoadingAllTests = false;
      },
      // Message shown centrally by ErrorInterceptor.
      error: () => { this.isLoadingAllTests = false; },
    });
  }

  /** TestItem → the plain shape the picker understands. */
  private toPickable(t: TestItem, groupName: string): DcPickableTest {
    return {
      code:     String(t?.testCode ?? ''),
      name:     String(t?.testName ?? ''),
      price:    Number(t?.price ?? 0),
      bookable: this.isTestBookable(t),
      group:    groupName,
    };
  }

  /** Bridges a code from the picker back to the selection rules below. */
  onPickerToggled(picked: DcPickableTest): void {
    const test = this.allTests.find(t => t.testCode === picked.code);
    if (test) this.toggleTestSelection(test);
  }

  /** The test the protocol panel under the catalogue is describing. */
  onPickerFocused(picked: DcPickableTest): void {
    const test = this.allTests.find(t => t.testCode === picked.code);
    if (test) {
      this.focusedTestId = test.testCode;
      this.loadFocusedProtocol(test);
    }
  }

  /**
   * A test with no parameters configured cannot be booked — there is nothing to
   * enter results into and its report would render an empty table. The server
   * rejects such a booking (PatientService.ValidateTestsAreBookableAsync); this
   * stops the operator picking one and only finding out on Save.
   *
   * Mirrors AddTestModalComponent.isTestBookable — the two test pickers are
   * separate components, so a rule added to one has to be added to both.
   */
  isTestBookable(t: TestItem): boolean {
    return (t?.parameterCount ?? 0) > 0;
  }

  /**
   * Loads the protocol for the test the operator just clicked.
   *
   * Responses are sequence-checked: clicking quickly through several tests can return
   * out of order, and showing the wrong test's sample requirements is worse than
   * showing none. Mirrors AddTestModalComponent.loadFocusedProtocol.
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
      // Message shown centrally by ErrorInterceptor. A null protocol makes the panel say
      // the requirements are unknown, which is the truthful outcome here.
      error: () => {
        if (seq !== this.protocolRequestSeq) return;
        this.focusedProtocols = null;
        this.focusedProtocolLoading = false;
      },
    });
  }

  /** Loads protocols for everything in the basket, for the summary on the Test & Lab step. */
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

  /**
   * Adds or removes one test. Focus and its protocol are handled by
   * onPickerFocused, which the picker fires first on the same tap — loading it
   * here as well would send two requests for every click.
   */
  toggleTestSelection(t: TestItem) {
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
      // Drop the protocol card for a test that is no longer in the basket.
      this.selectedTestProtocols = this.selectedTestProtocols.filter(p => p.testCode !== t.testCode);
    } else {
      this.selectedTestIds.add(t.testCode);
      this.selectedTests = [...this.selectedTests, t];
    }
  }

  /** Applies the basket to the form and returns to the step. */
  confirmTestSelection() {
    // Catches anything that got in before its parameters were removed.
    const unbookable = this.selectedTests.filter(t => !this.isTestBookable(t));
    if (unbookable.length) {
      this.toastr.error(
        `Remove ${unbookable.map(t => t.testName).join(', ')} — no parameters configured.`,
        'Test not available');
      return;
    }

    this.patientForm.patchValue({
      test_Name:   this.selectedTests.map(t => t.testName).join(', '),
      test_Amount: this.totalAmount
    });
    this.showTestCatalog = false;
    this.calculateNetAmount();
    // Bring the requirements back to the form step, where the operator is still with the
    // patient and can tell them about fasting before they leave.
    this.loadSelectedProtocols();
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

  /** Hard ceiling regardless of approval — 100% would make the test free. The API enforces the same. */
  readonly absoluteMaxDiscount = 99;

  /** A Super Admin's own over-limit discount is self-approved by the API. */
  get isSuperAdmin(): boolean { return this._token.isSuperAdmin(); }

  /** Discount is above the lab limit (but still within the hard ceiling). */
  get isDiscountOverLimit(): boolean {
    const d = this.toNumber(this.patientForm.get('discount')?.value);
    return d > this.maxDiscountPercent && d <= this.absoluteMaxDiscount;
  }

  /**
   * This booking's discount will go to a Super Admin for approval. While it does,
   * billing is held: no money may be taken now, and a reason is required.
   */
  get needsDiscountApproval(): boolean {
    return this.isDiscountOverLimit && !this.isSuperAdmin;
  }

  /** Payment types the operator may pick right now. */
  isPaymentTypeLocked(entry: string): boolean {
    return this.needsDiscountApproval && entry !== paymentType.NoPayment;
  }

  /**
   * Keeps the form consistent with whether the discount needs approval:
   *  - over the limit → force "No Payment" and require a reason;
   *  - back within it → drop the reason requirement (the operator picks payment again).
   */
  private syncDiscountApproval(): void {
    const reason = this.patientForm.get('discount_Reason');
    if (!reason) return;

    if (this.needsDiscountApproval) {
      reason.setValidators([Validators.required, Validators.maxLength(500)]);
      // Always re-assert the No Payment state, not only when the type changes:
      // a Partial payment cleared by a discount edit leaves amount_Paid blank
      // even if payment_Type already reads "No Payment", and a blank
      // amount_Paid fails `required` ("Please complete: Amount Paid").
      this.paymentConfirmed = false;
      this.amountPaidError  = '';
      this.patientForm.patchValue({
        payment_Type:   paymentType.NoPayment,
        amount_Paid:    0,
        amount_Pending: this.patientForm.get('net_Amount')?.value ?? 0,
      }, { emitEvent: false });
      this.patientForm.get('payment_Type')?.updateValueAndValidity({ emitEvent: false });
      this.patientForm.get('amount_Paid')?.updateValueAndValidity({ emitEvent: false });
    } else {
      reason.setValidators([Validators.maxLength(500)]);
    }
    reason.updateValueAndValidity({ emitEvent: false });
  }

  /** Parses a form value that may be a string, number, null or '' into a number. */
  private toNumber(value: any): number {
    const n = parseFloat(String(value ?? '').trim());
    return isNaN(n) ? 0 : n;
  }

  /** Rounds to 2 decimals — keeps money and percentages clean and API-friendly. */
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /**
   * Adds or removes a single named error on a control WITHOUT wiping the errors
   * its own validators produced.
   *
   * setErrors(null) clears everything — including `required` — which is how the
   * old code could leave a control looking valid when it wasn't, and how a
   * `maxExceeded` flag set from one field could never be cleared from the other.
   */
  private setControlError(controlName: string, key: string, on: boolean): void {
    const ctrl = this.patientForm.get(controlName);
    if (!ctrl) return;

    const errors = { ...(ctrl.errors ?? {}) };

    if (on) {
      if (errors[key]) return;              // already flagged — nothing to do
      errors[key] = true;
      ctrl.setErrors(errors);
      return;
    }

    if (!(key in errors)) return;           // not flagged — nothing to do
    delete errors[key];
    if (Object.keys(errors).length) {
      ctrl.setErrors(errors);
    } else {
      ctrl.setErrors(null);
      // Re-run the control's own validators (required, etc.) that setErrors(null)
      // just cleared, so removing OUR flag can't accidentally make an empty
      // field look valid.
      ctrl.updateValueAndValidity({ emitEvent: false });
    }
  }

  /**
   * Enforces the lab's maximum discount, from BOTH directions.
   *
   * Called whether the operator typed a percentage or typed a net amount, so the
   * cap cannot be bypassed by entering a low net amount, and — just as important —
   * the error can never get stuck after the value is corrected from the other field.
   *
   * @returns true when the discount is within the allowed range.
   */
  private validateDiscountLimit(discount: number): boolean {
    const negative = discount < 0;
    // Only the hard ceiling is an error now. Above the LAB limit is allowed — it is
    // sent to a Super Admin for approval (see syncDiscountApproval).
    const exceeded = discount > this.absoluteMaxDiscount;

    this.setControlError('discount', 'negative',    negative);
    this.setControlError('discount', 'maxExceeded', !negative && exceeded);

    this.syncDiscountApproval();
    return !negative && !exceeded;
  }

  /**
   * Discount % → Net Amount.
   *
   * Bound to (input), not (change), so the Net Amount field and the summary cards
   * move on every keystroke instead of waiting for the field to lose focus.
   *
   * Only net_Amount is patched here, so this can never ping-pong with
   * calculateDiscount().
   */
  calculateNetAmount(typed?: string | number) {
    const testAmount = this.toNumber(this.patientForm.get('test_Amount')?.value);
    // Prefer the value from the input event: a template (input) handler can run
    // before the form control's own value accessor, so the control may still
    // hold the previous keystroke's value here.
    const discount   = this.toNumber(typed ?? this.patientForm.get('discount')?.value);

    // A net amount typed by hand may have been flagged as above the test amount;
    // recalculating from the discount always produces a valid one.
    this.setControlError('net_Amount', 'aboveTestAmount', false);

    if (!this.validateDiscountLimit(discount)) return;  // keep the last good net amount
    if (testAmount <= 0) return;

    this.patientForm.patchValue({
      net_Amount: this.round2(testAmount - discount * testAmount / 100)
    });
  }

  /**
   * Net Amount → Discount %.
   *
   * Bound to (input) for the same reason as above. Rounds to 2 dp so the operator
   * sees "90.43%" rather than "90.43478260869566%", and so the value the API
   * stores is a sane percentage.
   */
  calculateDiscount(typed?: string | number) {
    const testAmount = this.toNumber(this.patientForm.get('test_Amount')?.value);
    const rawNet     = String(typed ?? this.patientForm.get('net_Amount')?.value ?? '').trim();

    if (testAmount <= 0) return;

    // Field cleared mid-edit — leave the discount alone and let `required` speak.
    if (rawNet === '') {
      this.setControlError('net_Amount', 'aboveTestAmount', false);
      return;
    }

    const netAmount = this.toNumber(rawNet);

    // A net amount above the test amount is a negative discount — reject it here
    // instead of silently doing nothing, which used to leave the two fields
    // disagreeing with no explanation.
    const aboveTest = netAmount > testAmount;
    this.setControlError('net_Amount', 'aboveTestAmount', aboveTest);
    if (aboveTest || netAmount < 0) return;

    const discount = this.round2((testAmount - netAmount) * 100 / testAmount);
    this.patientForm.patchValue({ discount });
    this.validateDiscountLimit(discount);
  }

  // The live amount-pending calculation that used to sit here belonged to this
  // screen's own Amount Paid field, inside its own Partial Payment modal. The
  // shared dialog works the running total out itself and shows it beside the
  // figure being typed, so there is no second field to keep in step and no
  // NumberValueAccessor timing gap to work around. onPaymentCollected() patches
  // both amounts once, when the operator confirms.

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
    // Over-limit discount awaiting approval: payment can't be taken yet.
    if (this.isPaymentTypeLocked(selectedType)) {
      this.patientForm.patchValue({ payment_Type: paymentType.NoPayment }, { emitEvent: false });
      selectedType = paymentType.NoPayment;
    }
    this.paymentConfirmed       = false;
    this.amountPaidError        = '';
    this.partialResetByDiscount = false;   // the user has chosen; the note goes

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
      this.clearPartialAmounts();
      this.openPaymentModal();
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
      this.clearPartialAmounts();
      this.openPaymentModal();
    }
  }

  /**
   * Opens the shared payment dialog, seeded with whatever is already entered so
   * reopening to amend shows the figure being amended rather than a fresh guess.
   */
  private openPaymentModal(): void {
    this.amountPaidError  = '';   // never greet the operator with last time's error
    this.paymentModalSeed = parseFloat(String(this.patientForm.get('amount_Paid')?.value)) || 0;
    this.showPaymentModal = true;
  }

  /**
   * Called when the user confirms in the shared payment dialog.
   *
   * The dialog hands back the figures; the rules about them stay here, because
   * they belong to this booking and not to the dialog. A partial amount has to
   * be strictly less than the net amount — equal means the booking is paid in
   * full and should be recorded as Full, which is a different payment type and
   * a different receipt, not a partial payment that happens to add up.
   *
   * The error is pushed back into the dialog's own error slot rather than
   * shown behind it, so the message appears where the number was typed.
   *
   * Both values are patched without emitEvent:false so Angular's
   * FormControlName directive propagates writeValue() to the step-4 readonly
   * inputs and the view updates reliably when the dialog closes.
   */
  onPaymentCollected(result: PaymentModalResult): void {
    const amountPaid = result.amountPaid || 0;
    const netAmount  = parseFloat(String(this.patientForm.get('net_Amount')?.value)) || 0;

    if (amountPaid <= 0) {
      this.amountPaidError = 'Please enter the correct amount paid.';
      return;
    }
    if (amountPaid >= netAmount) {
      this.amountPaidError = `Amount paid cannot equal or exceed net amount (₹${netAmount}). Choose "Full" instead.`;
      return;
    }

    const pending = +(netAmount - amountPaid).toFixed(2);

    this.amountPaidError = '';

    this.patientForm.patchValue({
      amount_Paid:    amountPaid,
      amount_Pending: pending
    });

    this.paymentConfirmed = true;
    this.modalPaymentClose();
  }

  modalPaymentClose() {
    this.showPaymentModal = false;
  }

  /**
   * Blank the two amount fields AND forget that the user ever touched them.
   *
   * Both are cleared by code, never by the user, so any touched/dirty state left
   * over from an earlier pass describes a value that no longer exists. Without
   * the reset the fields come back red the instant they are cleared, before the
   * user has been given a chance to type anything: `isFieldInvalid()` tests
   * `c.touched`, and styles.css paints every `input.ng-invalid.ng-touched` with
   * a red left border — which is why the error appeared both inside the Partial
   * Payment modal and on the step behind it.
   *
   * The controls stay `required` and still invalid; this only stops the form
   * claiming the user got it wrong when they have not been asked yet.
   */
  private clearPartialAmounts(): void {
    this.patientForm.patchValue({ amount_Paid: '', amount_Pending: '' });
    for (const name of ['amount_Paid', 'amount_Pending']) {
      const c = this.patientForm.get(name);
      c?.markAsUntouched();
      c?.markAsPristine();
    }
  }

  /** Opens the Partial Payment modal again so the user can amend confirmed values. */
  editPaymentDetails() {
    this.paymentConfirmed = false;
    this.amountPaidError  = '';
    this.openPaymentModal();
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
      error: () => { /* message shown centrally by ErrorInterceptor */ }
    });
  }

  // ── Register ───────────────────────────────────────────────────────────────

  registerPatient() {
    // Over-limit discount → No Payment with amount_Paid 0, re-asserted here so a
    // stale payment state can never block registration with "Amount Paid".
    this.syncDiscountApproval();

    if (!this.patientForm.valid) {
      this.stepTouched[this.currentStep] = true;
      this.patientForm.markAllAsTouched();
      // Previously this returned silently, so a problem on an earlier step — or a
      // discount over the lab limit — looked like a dead "Register Patient" button.
      this.toastr.error(this.describeInvalidFields(), 'Cannot register yet');
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

  /** Human-readable labels for the controls named in validation messages. */
  private static readonly FIELD_LABELS: Record<string, string> = {
    patient_Name: 'Patient Name', patient_DOB: 'Date of Birth', patient_Age: 'Age',
    patient_Age_Group: 'Age Group', patient_Gender: 'Gender',
    patient_Address: 'Address', relative_Name: 'Relative Name',
    patient_Contact: 'Contact Number', patient_Email: 'Email',
    test_Name: 'Test', test_Amount: 'Test Amount', referred_By_Type: 'Referred By Type',
    referred_By: 'Referred By', discount: 'Discount (%)', net_Amount: 'Net Amount',
    discount_Reason: 'Reason for Discount',
    payment_Type: 'Payment Type', amount_Paid: 'Amount Paid',
    amount_Pending: 'Amount Pending', payment_Mode: 'Payment Mode',
  };

  /** Builds the toast text listing what is still blocking registration. */
  private describeInvalidFields(): string {
    const discount = this.patientForm.get('discount');
    if (discount?.errors?.['maxExceeded']) {
      return `Discount cannot exceed ${this.absoluteMaxDiscount}%. Lower the discount or raise the net amount.`;
    }
    if (discount?.errors?.['negative']) {
      return 'Discount cannot be negative.';
    }
    if (this.patientForm.get('discount_Reason')?.errors?.['required']) {
      return `The discount is above the lab limit of ${this.maxDiscountPercent}%. Enter a reason for the Super Admin.`;
    }
    if (this.patientForm.get('net_Amount')?.errors?.['aboveTestAmount']) {
      return 'Net amount cannot be more than the test amount.';
    }

    const invalid = Object.keys(this.patientForm.controls)
      .filter(k => this.patientForm.get(k)?.invalid)
      .map(k => AddPatientComponent.FIELD_LABELS[k] ?? k);

    return invalid.length
      ? `Please complete: ${invalid.slice(0, 4).join(', ')}${invalid.length > 4 ? '…' : ''}`
      : 'Please review the highlighted fields.';
  }

  private doRegisterPatient() {

    this.isLoading = true;
    const f = this.patientForm.getRawValue();
    const sentForApproval = this.needsDiscountApproval;

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
      // Sent whenever typed; the API only requires it when the discount is over the limit.
      ...(this.isDiscountOverLimit && f.discount_Reason?.trim() && {
        discountReason: f.discount_Reason.trim(),
      }),
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
      report_On_WhatsApp: !!f.report_On_WhatsApp,
      // The API stores it on the booking only when it differs from the patient's mobile.
      whatsApp_Number:    f.report_On_WhatsApp && f.whatsApp_Number ? `${f.whatsApp_Number}` : null,
      test_Amount:       f.test_Amount      ?? 0,
      referred_By_Type:  f.referred_By_Type ?? '',
      referred_By:  f.referred_By      ?? '',
      remark:            f.remark           ?? '',
      collected_Outside: f.collected_Outside ?? false,
      area:              f.area             ?? '',
      collected_By:      f.collected_By     ?? '',
      // Must be sampling_Done_At — the API property is Sampling_Done_At, and the
      // old key 'sampling_Done' matched nothing, so the location was never saved.
      sampling_Done_At:  f.sampling_Done    ?? '',
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
      // ?? '' on the now-optional fields: the API maps these to NOT NULL
      // columns that default to an empty string, so a blank must arrive as ''
      // rather than null — otherwise a skipped field is a 500, not a blank.
      patient_Marital_Status: f.patient_Marital_Status ?? '',
      patient_Address:        f.patient_Address,
      relation:               f.relation ?? '',
      relative_Name:          f.relative_Name,
      patient_Contact:        `${f.patient_Contact ?? ''}`,
      patient_Email:          f.patient_Email ?? '',
      patient_Reg_Date:       f.patient_Reg_Date,
      test,
      receipt,
    };

    this._patientService.AddPatient(payload).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res: BookingResultDto) => {
        this.isLoading = false;

        if (!res?.success) {
          // API returned HTTP 200 but the operation failed (e.g. transaction
          // rolled back). This is not an HTTP error, so the global interceptor
          // won't fire — surface it explicitly.
          this.toastr.error(res?.message || 'Failed to register patient. Please try again.', 'Error');
          return;
        }

        if (sentForApproval) {
          this.toastr.info(
            'The discount has been sent to the Super Admin for approval. Payment can be collected once it is approved.',
            'Discount awaiting approval', { timeOut: 8000 });
        }

        this.printSampleLabels(res);
        this._route.navigate(['/patients']);
      },
      error: () => {
        // HTTP/network errors are surfaced centrally by ErrorInterceptor;
        // here we only reset local state.
        this.isLoading = false;
      }
    });
  }

  /**
   * Opens the sample collection labels for a just-created booking — one sticker
   * per booked test, with the print dialog opening by itself.
   *
   * Called only after a confirmed successful registration, so a label can never
   * be printed for a booking that was rolled back and does not exist.
   *
   * Failures here are deliberately non-fatal: the patient IS registered by this
   * point, and blocking or alarming the operator over a label would misrepresent
   * what happened. They are told how to reprint instead — the booking's labels
   * remain available from the patient's test list.
   */
  private printSampleLabels(booking: BookingResultDto): void {
    if (booking.testRegId && booking.labelsReady === false) {
      // No sampling location → no barcode. It is generated once the location is
      // selected and saved from the patient's test list.
      this.toastr.info(
        'Barcode not generated because "Sampling Done At" was not selected. ' +
        'Select it from the patient\'s tests to generate the barcode.',
        'Barcode pending', { timeOut: 8000 });
      return;
    }

    if (!booking.testRegId || !booking.labels?.length) {
      return;
    }

    // Deliberately NOT piped through takeUntil(this.destroy$).
    //
    // The caller navigates to the patient list immediately after this returns,
    // which destroys this component and completes destroy$. A label request bound
    // to it would be cancelled mid-flight and the labels would silently never
    // appear. This request has to outlive the screen that started it; ToastrService
    // is app-scoped, so the messages below still reach the operator afterwards.
    this._sampleLabelService.printLabels(booking.testRegId)
      .subscribe({
        next: (opened: boolean) => {
          if (!opened) {
            // A blocked pop-up is silent in most browsers; without this the
            // operator would simply never see the labels and not know why.
            this.toastr.warning(
              'Patient registered, but the label window was blocked. ' +
              'Allow pop-ups for this site, then reprint from the patient\'s tests.',
              'Labels not shown');
          }
        },
        error: () => {
          this.toastr.warning(
            'Patient registered, but the sample labels could not be fetched. ' +
            'You can reprint them from the patient\'s tests.',
            'Labels not printed');
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
