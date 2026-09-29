import { Component, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import {
  SIMPLE_UI,
  DcChoiceOption,
  DcWizardStep,
  DcSummaryRow,
  DcPickableTest,
  DcTestGroup,
  DcPaymentDecision,
  yesNoOptions,
} from '../index';

/**
 * SimpleUiShowcaseComponent — every component in the kit, on one page, with
 * realistic Diagnocare data.
 *
 * This is a living reference, not a demo: point it at a technician, watch
 * which control they hesitate over, and fix it here once for the whole app.
 *
 * Two ways to open it — see showcase/HOW-TO-RUN.md:
 *
 *   1. Its own dev server, touching no app code at all:
 *        ng serve ui-kit        →  http://localhost:4300
 *
 *   2. Inside the real app, as one extra route in app-routing.module.ts:
 *        { path: 'ui-kit', loadComponent: () =>
 *            import('./shared/simple/showcase/simple-ui-showcase.component')
 *              .then(m => m.SimpleUiShowcaseComponent) }
 *      then open  #/ui-kit.
 *
 * The component pulls in simple-ui.css itself with encapsulation turned off,
 * so it renders correctly whether or not styles.css imports the tokens yet.
 * That is deliberate and specific to this page: it is how the showcase stays
 * runnable without any change to the app's setup.
 */
@Component({
  selector: 'app-simple-ui-showcase',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...SIMPLE_UI],
  // None, so the kit's :root tokens actually reach the document. Scoped
  // component styles would rewrite `:root` into a selector that matches
  // nothing. Only this demo page does it — the kit's own components are all
  // normally encapsulated.
  encapsulation: ViewEncapsulation.None,
  styleUrls: ['../simple-ui.css'],
  template: `
  <div class="page-container">

    <div class="page-header">
      <div class="header-left">
        <h2>Simple UI kit</h2>
        <p class="subtitle">The building blocks for screens used by non-technical staff</p>
      </div>
      <div class="header-actions uikit-switches">
        <!-- Check the kit against every theme the app ships, without logging in. -->
        <select class="uikit-theme" [ngModel]="theme" (ngModelChange)="setTheme($event)"
                aria-label="Preview theme">
          <option *ngFor="let name of themes" [value]="name">{{ name }} theme</option>
        </select>
        <button class="dc-btn dc-btn--cancel" (click)="toggleLargeText()">
          <i class="fa fa-text-height"></i>
          {{ largeText ? 'Normal text size' : 'Large text size' }}
        </button>
      </div>
    </div>

    <div class="content-container">

      <!-- ═══ 1. Task tiles ═══════════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">1 &middot; Task tiles &mdash; a home screen anyone can use</h3>
        <p class="uikit-demo__note">
          Tasks named the way staff say them, with a badge showing work already waiting.
          One tile is accented as the expected next action.
        </p>

        <div class="dc-task-grid">
          <dc-task-tile icon="fa-user-plus" label="Register a patient"
                        hint="Add a new patient and book their tests"
                        [accent]="true" (open)="say('Register a patient')"></dc-task-tile>

          <dc-task-tile icon="fa-flask" label="Enter test results"
                        hint="Fill in results for booked tests"
                        [badge]="7" badgeLabel="waiting"
                        (open)="say('Enter test results')"></dc-task-tile>

          <dc-task-tile icon="fa-print" label="Print a report"
                        hint="Find a completed report and print it"
                        (open)="say('Print a report')"></dc-task-tile>

          <dc-task-tile icon="fa-rupee" label="Take a payment"
                        hint="Record cash, card or UPI against a booking"
                        (open)="say('Take a payment')"></dc-task-tile>
        </div>
      </section>

      <!-- ═══ 2. Search ═══════════════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">2 &middot; Search &mdash; the same behaviour on every screen</h3>
        <p class="uikit-demo__note">
          Enter searches, the button searches, and Clear brings the whole list back.
          Type something that matches nothing to see the zero state.
        </p>

        <dc-search [(value)]="searchTerm"
                   label="Find a patient"
                   placeholder="Type a name or patient ID"
                   [resultCount]="matchingPatients.length"
                   resultNoun="patient"
                   (search)="say('Searched for: ' + ($event || 'everything'))">
        </dc-search>
      </section>

      <!-- ═══ 3. Records ══════════════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">3 &middot; Record cards &mdash; a list that survives a narrow screen</h3>
        <p class="uikit-demo__note">
          Same data as the patient table, in reading order, with actions that
          say what they do and stay attached to their record at any width.
        </p>

        <dc-record *ngFor="let patient of matchingPatients"
                   [title]="patient.name"
                   [subtitle]="'S/o ' + patient.relative"
                   [reference]="'ID ' + patient.id"
                   [muted]="patient.status === 'Deactivated'"
                   [facts]="[
                     { label: 'Registered', value: patient.registered },
                     { label: 'Age / Sex',  value: patient.age + ' / ' + patient.sex },
                     { label: 'Tests',      value: patient.tests }
                   ]">
          <div status><dc-status [status]="patient.status"></dc-status></div>
          <div actions>
            <dc-action type="results" (clicked)="say('Results for ' + patient.name)"></dc-action>
            <dc-action type="edit"    (clicked)="say('Edit ' + patient.name)"></dc-action>
            <dc-action type="print"   (clicked)="say('Print ' + patient.name)"></dc-action>
            <dc-action type="delete"  label="Deactivate" (clicked)="say('Deactivate ' + patient.name)"></dc-action>
          </div>
        </dc-record>

        <dc-empty *ngIf="matchingPatients.length === 0"
                  icon="fa-search"
                  title="No patients match that search"
                  message="Check the spelling, or try just the first few letters of the name."
                  actionLabel="Show all patients"
                  (action)="searchTerm = ''">
        </dc-empty>
      </section>

      <!-- ═══ 4. Status vocabulary ════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">4 &middot; Status &mdash; colour, icon and word, always all three</h3>
        <p class="uikit-demo__note">
          One shared table, so a status looks identical on every screen. Squint,
          or turn your monitor's colour down: each one is still readable.
        </p>

        <div class="dc-actions-row">
          <dc-status *ngFor="let status of allStatuses" [status]="status"></dc-status>
        </div>
      </section>

      <!-- ═══ 5. Notes ════════════════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">5 &middot; Notes &mdash; the rule, where the rule applies</h3>

        <dc-note tone="info" title="Results can only be entered for booked tests">
          Book the test first, then it appears in the results list.
        </dc-note>

        <dc-note tone="tip">
          Press <kbd>Enter</kbd> to jump to the next box instead of reaching for the mouse.
        </dc-note>

        <dc-note tone="warn" title="Maximum discount is 20%">
          Anything higher needs a Super Admin to authorise it.
        </dc-note>

        <dc-note tone="danger" title="Deleting permanently cannot be undone">
          Deactivate instead if you might need the record later.
        </dc-note>
      </section>

      <!-- ═══ 6. The form kit, inside a wizard ════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">6 &middot; Registration as a wizard &mdash; one short step at a time</h3>
        <p class="uikit-demo__note">
          The same FormGroup you already have. Next stays visible but disabled
          until the step is valid, and says what is missing.
        </p>

        <dc-wizard [steps]="steps"
                   [(index)]="stepIndex"
                   [canContinue]="canContinue"
                   [blockReason]="blockReason"
                   finishLabel="Register patient"
                   [busy]="saving"
                   (finish)="register()">

          <!-- Step 1 — who -->
          <div *ngIf="stepIndex === 0" class="dc-form-grid">
            <dc-field class="dc-form-grid__wide"
                      label="Patient name"
                      hint="As written on the ID proof"
                      [control]="form.get('name')"
                      [submitted]="submitted">
              <input class="form-control" formControlName="name" placeholder="e.g. Ramesh Kumar">
            </dc-field>

            <dc-field label="Age" [control]="form.get('age')" [submitted]="submitted">
              <dc-number formControlName="age" [min]="0" [max]="120" suffix="years" ariaLabel="Age"></dc-number>
            </dc-field>

            <dc-field label="Gender" [control]="form.get('sex')" [submitted]="submitted">
              <dc-choice formControlName="sex" [options]="sexOptions" ariaLabel="Gender"></dc-choice>
            </dc-field>

            <dc-field label="Mobile number"
                      hint="10 digits, used to send the report link"
                      [control]="form.get('mobile')"
                      [submitted]="submitted">
              <input class="form-control" formControlName="mobile" inputmode="numeric" placeholder="9876543210">
            </dc-field>

            <dc-field label="Report urgency" [control]="form.get('urgent')">
              <dc-choice formControlName="urgent" [options]="urgencyOptions" ariaLabel="Report urgency"></dc-choice>
            </dc-field>
          </div>

          <!-- Step 2 — money -->
          <div *ngIf="stepIndex === 1">
            <dc-note tone="warn" title="Maximum discount is 20%">
              The box below will not let you go past it.
            </dc-note>

            <div class="dc-form-grid">
              <dc-field label="Payment mode" [control]="form.get('mode')">
                <dc-choice formControlName="mode" [options]="paymentOptions" ariaLabel="Payment mode"></dc-choice>
              </dc-field>

              <dc-field label="Discount" hint="Ask a Super Admin for anything above 20%">
                <dc-number formControlName="discount" suffix="%" [min]="0" [max]="20" [step]="5" ariaLabel="Discount"></dc-number>
              </dc-field>

              <dc-field label="Amount received">
                <dc-number formControlName="amount" prefix="₹" [min]="0" [step]="100" ariaLabel="Amount received"></dc-number>
              </dc-field>
            </div>
          </div>

          <!-- Step 3 — check -->
          <div *ngIf="stepIndex === 2">
            <dc-summary title="Please check these details before saving"
                        [rows]="reviewRows"
                        editLabel="Change something"
                        (edit)="stepIndex = 0">
            </dc-summary>
          </div>
        </dc-wizard>
      </section>

      <!-- ═══ 7. Save bar ═════════════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">7 &middot; Save bar &mdash; the button never scrolls away</h3>
        <p class="uikit-demo__note">
          Empty the patient name above and watch the bar explain itself instead
          of just greying out.
        </p>

        <dc-save-bar [canSave]="form.valid"
                     [blockReason]="saveBlockReason"
                     saveLabel="Save patient"
                     [busy]="saving"
                     [dirty]="form.dirty"
                     (save)="register()"
                     (cancel)="say('Cancelled')">
        </dc-save-bar>
      </section>

      <!-- ═══ 8. Test picker ══════════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">8 &middot; Test picker &mdash; the four-column catalogue, replaced</h3>
        <p class="uikit-demo__note">
          Browse Group &rarr; Sub-group &rarr; Tests as before, or type in the box
          at the top to search every group at once &mdash; try &ldquo;thy&rdquo;.
          The unbookable test says why on its own row rather than hiding the
          reason in a tooltip.
        </p>

        <dc-test-picker
          [groups]="demoGroups"
          [selectedCodes]="demoSelectedCodes"
          (toggled)="toggleDemoTest($event)"
          (confirmed)="say('Added ' + demoSelectedCodes.length + ' tests')"
          (cancelled)="demoSelectedCodes = []">
        </dc-test-picker>
      </section>

      <!-- ═══ 9. Payment panel ════════════════════════════════════════════ -->
      <section class="uikit-demo">
        <h3 class="uikit-demo__title">9 &middot; Payment &mdash; three modals collapsed into one screen</h3>
        <p class="uikit-demo__note">
          Pick &ldquo;Some of it&rdquo;, choose Cash, then type what the patient
          handed over. The change appears next to the amount it refers to &mdash;
          no calculator to open.
        </p>

        <dc-payment-panel
          [netAmount]="1200"
          [modes]="demoModes"
          (decisionChange)="onDemoPayment($event)"
          (confirmed)="say('Payment saved (demo only)')">
        </dc-payment-panel>
      </section>

      <p class="uikit-demo__log" *ngIf="lastAction" role="status">
        <i class="fa fa-hand-pointer-o"></i> Last action: <strong>{{ lastAction }}</strong>
      </p>
    </div>
  </div>
  `,
  styles: [`
    .uikit-demo {
      margin-bottom: 2.5rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--dc-line, #e1e8ed);
    }
    .uikit-demo:last-of-type { border-bottom: 0; }

    .uikit-demo__title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--dc-ink, #2c3e50);
      margin: 0 0 0.35rem;
    }
    .uikit-demo__note {
      font-size: 0.9rem;
      color: var(--dc-ink-soft, #666);
      margin: 0 0 1.25rem;
      max-width: 46rem;
      line-height: 1.5;
    }
    .uikit-switches { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
    .uikit-theme {
      min-height: 2.6rem; padding: 0 .75rem;
      font-family: inherit; font-size: .9rem;
      background: var(--dc-surface, #fff); color: var(--dc-ink, #2c3e50);
      border: 2px solid var(--dc-line, #e1e8ed); border-radius: var(--dc-radius, .625rem);
      text-transform: capitalize;
    }
    .uikit-demo__log {
      position: sticky;
      bottom: 1rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 1rem;
      border-radius: 999px;
      background: var(--dc-ink, #2c3e50);
      color: #fff;
      font-size: 0.9rem;
    }
  `]
})
export class SimpleUiShowcaseComponent {

  // ── Demo state ────────────────────────────────────────────────────────────
  /** The five themes the app ships. The kit reads the same CSS variables they
   *  set, so switching here is a real test, not an approximation. */
  readonly themes = ['light', 'dark', 'midnight', 'warm', 'system'];
  theme = document.documentElement.getAttribute('data-theme') || 'light';

  largeText = false;
  lastAction = '';
  searchTerm = '';
  saving = false;
  submitted = false;
  stepIndex = 0;

  readonly allStatuses = [
    'Completed', 'Pending', 'Partial', 'Urgent', 'Cancelled',
    'Deactivated', 'Approved', 'Rejected', 'Scheduled', 'Normal',
  ];

  readonly patients = [
    { id: 'P-10241', name: 'Ramesh Kumar',  relative: 'Suresh Kumar', registered: '26 Aug 2026', age: 41, sex: 'Male',   tests: 'CBC, LFT',        status: 'Pending' },
    { id: 'P-10240', name: 'Anita Sharma',  relative: 'Vinod Sharma', registered: '26 Aug 2026', age: 33, sex: 'Female', tests: 'Thyroid Profile', status: 'Partial' },
    { id: 'P-10236', name: 'Imran Sheikh',  relative: 'Yusuf Sheikh', registered: '25 Aug 2026', age: 57, sex: 'Male',   tests: 'HbA1c',           status: 'Completed' },
    { id: 'P-10199', name: 'Kavita Nair',   relative: 'Rajan Nair',   registered: '19 Aug 2026', age: 28, sex: 'Female', tests: 'CBC',             status: 'Deactivated' },
  ];

  // ── Choice options ────────────────────────────────────────────────────────
  readonly sexOptions: DcChoiceOption[] = [
    { value: 'Male',   label: 'Male',   icon: 'fa-mars' },
    { value: 'Female', label: 'Female', icon: 'fa-venus' },
    { value: 'Other',  label: 'Other',  icon: 'fa-genderless' },
  ];

  readonly urgencyOptions: DcChoiceOption[] = [
    { value: 'Yes', label: 'Urgent', icon: 'fa-bolt',    hint: 'Report the same day' },
    { value: 'No',  label: 'Normal', icon: 'fa-clock-o', hint: 'Standard turnaround' },
  ];

  readonly paymentOptions: DcChoiceOption[] = [
    { value: 'cash', label: 'Cash', icon: 'fa-money' },
    { value: 'card', label: 'Card', icon: 'fa-credit-card' },
    { value: 'upi',  label: 'UPI',  icon: 'fa-mobile' },
    { value: 'tpa',  label: 'TPA',  icon: 'fa-building', hint: 'Insurance / corporate' },
  ];

  /** Kept to show the helper exists; a plain yes/no needs no hand-written array. */
  readonly consentOptions = yesNoOptions('Consent given', 'Not given');

  // ── Test picker demo ──────────────────────────────────────────────────────
  readonly demoGroups: DcTestGroup[] = [
    { id: 'HAEM', name: 'Haematology', subGroups: [
      { id: 'HAEM-R', name: 'Routine Haematology', tests: [
        { code: 'T-1001', name: 'Complete Blood Count (CBC)', price: 350, bookable: true },
        { code: 'T-1002', name: 'ESR',                        price: 120, bookable: true },
        { code: 'T-1003', name: 'Peripheral Smear',           price: 300, bookable: false },
      ]},
      { id: 'HAEM-C', name: 'Coagulation', tests: [
        { code: 'T-1010', name: 'Prothrombin Time (PT/INR)',  price: 400, bookable: true },
        { code: 'T-1011', name: 'APTT',                       price: 380, bookable: true },
      ]},
    ]},
    { id: 'BIO', name: 'Biochemistry', subGroups: [
      { id: 'BIO-L', name: 'Liver Function', tests: [
        { code: 'T-2001', name: 'Liver Function Test (LFT)',  price: 650, bookable: true },
        { code: 'T-2002', name: 'Serum Bilirubin',            price: 200, bookable: true },
      ]},
      { id: 'BIO-K', name: 'Kidney Function', tests: [
        { code: 'T-2010', name: 'Kidney Function Test (KFT)', price: 700, bookable: true },
        { code: 'T-2011', name: 'Serum Creatinine',           price: 180, bookable: true },
      ]},
      { id: 'BIO-D', name: 'Diabetes', tests: [
        { code: 'T-2020', name: 'HbA1c',                      price: 550, bookable: true },
        { code: 'T-2021', name: 'Fasting Blood Sugar',        price: 90,  bookable: true },
      ]},
    ]},
    { id: 'SERO', name: 'Serology', subGroups: [
      { id: 'SERO-I', name: 'Infectious Disease', tests: [
        { code: 'T-3001', name: 'Dengue NS1 Antigen',         price: 800, bookable: true },
        { code: 'T-3002', name: 'Widal Test',                 price: 250, bookable: true },
      ]},
    ]},
    { id: 'HORM', name: 'Hormones', subGroups: [
      { id: 'HORM-T', name: 'Thyroid Function', tests: [
        { code: 'T-4001', name: 'Thyroid Profile (T3 T4 TSH)', price: 850, bookable: true },
        { code: 'T-4002', name: 'TSH — Ultrasensitive',        price: 450, bookable: true },
      ]},
      { id: 'HORM-V', name: 'Vitamins', tests: [
        { code: 'T-4010', name: 'Vitamin D (25-OH)',           price: 1400, bookable: true },
        { code: 'T-4011', name: 'Vitamin B12',                 price: 900,  bookable: false },
      ]},
    ]},
  ];
  demoSelectedCodes: string[] = [];

  // ── Payment demo ──────────────────────────────────────────────────────────
  readonly demoModes = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'TPA'];

  readonly steps: DcWizardStep[] = [
    { title: 'Who is the patient?', hint: 'Name, age and a contact number.' },
    { title: 'Payment',             hint: 'How they are paying, and any discount.' },
    { title: 'Check and confirm',   hint: 'Read this back before saving.' },
  ];

  form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      name:     ['', Validators.required],
      age:      [null as number | null, Validators.required],
      sex:      ['', Validators.required],
      mobile:   ['', [Validators.required, Validators.pattern(/^[1-9][0-9]{9}$/)]],
      urgent:   ['No'],
      mode:     ['cash'],
      discount: [0],
      amount:   [0],
    });
  }

  // ── Derived state ─────────────────────────────────────────────────────────

  get matchingPatients() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.patients;
    return this.patients.filter(p =>
      p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term));
  }

  /** Only the current step's controls gate Next — later steps are not the
   *  user's problem yet. */
  get canContinue(): boolean {
    if (this.stepIndex === 0) {
      return ['name', 'age', 'sex', 'mobile'].every(n => this.form.get(n)?.valid);
    }
    return true;
  }

  /** The sentence shown under a disabled Next. Name the boxes, not the rule. */
  get blockReason(): string {
    if (this.canContinue) return '';
    const missing = ([
      ['name', "the patient's name"],
      ['age', 'the age'],
      ['sex', 'the gender'],
      ['mobile', 'a 10-digit mobile number'],
    ] as const)
      .filter(([control]) => this.form.get(control)?.invalid)
      .map(([, label]) => label);

    return 'Still needed: ' + missing.join(', ') + '.';
  }

  get saveBlockReason(): string {
    return this.form.valid ? '' : 'Some patient details are still missing on step 1.';
  }

  get reviewRows(): DcSummaryRow[] {
    const value = this.form.value;
    const sex = this.sexOptions.find(o => o.value === value.sex)?.label;
    const mode = this.paymentOptions.find(o => o.value === value.mode)?.label;

    return [
      { label: 'Patient name',    value: value.name, tone: 'strong' },
      { label: 'Age / Gender',    value: value.age ? `${value.age} years / ${sex ?? ''}` : '' },
      { label: 'Mobile number',   value: value.mobile },
      { label: 'Report urgency',  value: value.urgent === 'Yes' ? 'Urgent — same day' : 'Normal',
        tone: value.urgent === 'Yes' ? 'warn' : 'normal' },
      { label: 'Payment mode',    value: mode },
      { label: 'Discount',        value: value.discount ? value.discount + '%' : 'None' },
      { label: 'Amount received', value: '₹' + (value.amount ?? 0), tone: 'strong' },
    ];
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  register(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.say('Blocked — some details are still missing');
      return;
    }
    this.saving = true;
    setTimeout(() => {
      this.saving = false;
      this.say('Saved (demo only — nothing was sent to the server)');
    }, 1200);
  }

  setTheme(theme: string): void {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
  }

  toggleDemoTest(test: DcPickableTest): void {
    const at = this.demoSelectedCodes.indexOf(test.code);
    this.demoSelectedCodes = at > -1
      ? this.demoSelectedCodes.filter(code => code !== test.code)
      : [...this.demoSelectedCodes, test.code];
  }

  onDemoPayment(decision: DcPaymentDecision): void {
    if (!decision.complete) return;
    this.say('₹' + decision.amountPaid + ' by ' + decision.mode +
             (decision.changeDue ? ' · ₹' + decision.changeDue + ' change' : ''));
  }

  toggleLargeText(): void {
    this.largeText = !this.largeText;
    const root = document.documentElement;
    if (this.largeText) root.setAttribute('data-dc-size', 'large');
    else root.removeAttribute('data-dc-size');
  }

  say(what: string): void {
    this.lastAction = what;
  }
}
