import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { CommonModule, Location } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ActivatedRoute } from '@angular/router';
import { PatientTestReport, testParameter } from 'src/app/models/patientTest/testParameterModel';
import { patientTest } from 'src/app/models/patientTest/patientTestModel';
import { testDetail } from 'src/app/models/patientTest/testDetailModel';
import { TestReportService } from 'src/app/services/patientTestReportServices/test-report-service';
import { CommonService } from 'src/app/shared/common.service';
import { TestReportGenerationServices } from 'src/app/services/patientTestReportServices/test-report-generation-services';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { PaymentModalComponent } from 'src/app/shared/payment-modal/payment-modal.component';
import { AddTestModalComponent }  from 'src/app/shared/add-test-modal/add-test-modal.component';
import { CancelBookingModalComponent, CancelConfirmPayload } from 'src/app/shared/cancel-booking-modal/cancel-booking-modal.component';
import { ProtocolViewModalComponent } from 'src/app/shared/protocol-view-modal/protocol-view-modal.component';
import { TestRunModalComponent } from 'src/app/shared/test-run-modal/test-run-modal.component';
import { TestRunService } from 'src/app/services/testRunServices/test-run.service';
import { TestRunCountDto } from 'src/app/models/test-run/test-run.model';
import { SampleRejectionModalComponent } from 'src/app/shared/sample-rejection-modal/sample-rejection-modal.component';
import { SampleRejectionService } from 'src/app/services/sampleRejectionServices/sample-rejection.service';
import { SampleRejectionSummaryDto } from 'src/app/models/sample-rejection/sample-rejection.model';
import { ReportPrintStatusService } from 'src/app/services/patientTestReportServices/report-print-status.service';
import { ReportPrintStatusDto } from 'src/app/models/report-print-status/report-print-status.model';
import { RefundModalComponent } from 'src/app/shared/refund-modal/refund-modal.component';
import { PatientService } from 'src/app/services/patientServices/patient.service';
import { ReceiptService } from 'src/app/services/receiptServices/receipt.service';
import { forkJoin as forkJoinRxjs } from 'rxjs';
import { SampleLabelService } from 'src/app/services/sampleLabelServices/sample-label.service';
import { SamplingLocationService } from 'src/app/services/samplingServices/sampling-location.service';
import { BookingResultDto } from 'src/app/models/patient/booking-result.dto';
import {
  resolvePaymentStatus,
  getPaymentBadgeLabel as paymentBadgeLabel,
  getPaymentStatusClass as paymentStatusClass
} from 'src/app/utilities/patient-status.util';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One step of a visit's progress bar. */
export interface VisitStep {
  label: string;
  state: 'done' | 'current' | 'todo';
}

/**
 * Everything the page says about one booking, in plain words, computed once per
 * load rather than on every change-detection pass.
 */
export interface VisitView {
  /** Test names on the booking (codes where a name is unknown). */
  names: string[];
  isToday: boolean;
  /** "27 Sep 2026" */
  dateLabel: string;
  /** "Sunday, 27 September 2026" */
  dayLabel: string;
  /** "Today", "15 days ago" */
  relLabel: string;
  /** "SEPTEMBER 2026" — the past-visits group header */
  monthLabel: string;
  steps: VisitStep[];
  /** What the big button does. */
  next: 'sampling' | 'results' | 'payment' | 'reports' | 'none';
  nextText: string;
  statusText: string;
  statusTone: 'ok' | 'warn' | 'muted';
  paymentText: string;
  paymentTone: 'ok' | 'due' | 'hold' | 'none';
  due: number;
  cancelled: boolean;
}

@Component({
  selector: 'app-patient-test-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PaymentModalComponent, AddTestModalComponent, CancelBookingModalComponent, ProtocolViewModalComponent, TestRunModalComponent, SampleRejectionModalComponent],
  templateUrl: './patient-test-list.component.html',
  styleUrls: ['./patient-test-list.component.css']
})
export class PatientTestListComponent implements OnInit {

  // ── Data ──────────────────────────────────────────────────────────────
  /** Full list returned by the API — never filtered. */
  allPatientTests: patientTest[] = [];
  /** Currently displayed list — filtered by recency / report status. */
  patientTests: patientTest[] = [];

  testDetails: testDetail[] = [];
  testParameters: testParameter[] = [];

  /**
   * The obtained value as currently PERSISTED, keyed by parameterId.
   *
   * Rebuilt only from the server in loadTestParameters() — never from the edit
   * inputs. The report is rendered by the backend from the database, so typing a
   * value without saving must not unlock View / PDF: the report would come out
   * without it.
   */
  private savedResults = new Map<number, string>();

  // ── State ──────────────────────────────────────────────────────────────
  isLoading: boolean = false;
  isLoadingDetails: boolean = false;
  isLoadingParameters: boolean = false;
  errorMessage: string = '';
  detailErrorMessage: string = '';
  parameterErrorMessage: string = '';

  pathologyId: string = '';
  patientId: string = '';
  patientName: string = '';
  /** Cached pathology branch name — passed to report generation to fill {{PATHOLOGY_BRANCH}}. */
  pathBranch: string = '';

  activeParameterIndex: number = 0;

  showDetailView: boolean = false;
  showParameterView: boolean = false;
  selectedPatientTest: patientTest | null = null;
  selectedTestDetail: testDetail | null = null;

  pdfDoc: any = null;
  pdfWindow: Window | null = null;

  /** True while a report is being fetched from the backend. */
  isGeneratingReport: boolean = false;

  /** True while a PDF download is in progress. */
  isDownloadingPdf: boolean = false;

  /** True while the PDF is being prepared for sending on WhatsApp. */
  isSendingWhatsApp: boolean = false;

  /** Patient's contact number as stored (e.g. "+91-9876543210"), used for WhatsApp. */
  patientContact: string = '';

  showPatientIdInput: boolean = false;
  enteredPatientId: string = '';
  private navigatedViaQueryParam: boolean = false;

  // ── Sample collection protocol (read-only, post-booking) ───────────────
  /**
   * The protocol viewer is opened from a booking that already exists, so it never edits
   * anything — it answers "how is this sample collected?" for a booking that was made
   * yesterday, or is being collected right now, without sending anyone back through the
   * booking screen to find out.
   */
  showProtocolModal: boolean = false;
  protocolModalSubtitle: string = '';
  protocolTestCodes: string[] = [];
  /**
   * The booking whose test list is being fetched to open the viewer. Held by id rather
   * than as a boolean so only the clicked card's button shows a spinner.
   */
  loadingProtocolFor: string | null = null;

  // ── Repeat testing ─────────────────────────────────────────────────────
  /**
   * How many times each test on the open booking has been run, keyed by test code.
   *
   * Fetched once when the detail overlay opens rather than per test row: a booking with a
   * dozen tests would otherwise fire a dozen requests to draw a badge most of them will not
   * show. A missing key means no repeat has been recorded, which is one run, not zero.
   */
  runCounts = new Map<string, TestRunCountDto>();

  showRunModal: boolean = false;
  runModalTestRegId: number = 0;
  runModalTestCode: string = '';
  runModalTestName: string = '';

  // ── Sample rejection ───────────────────────────────────────────────────
  /**
   * Which tests on the open booking have had a sample rejected, keyed by test code.
   *
   * Fetched once when the detail overlay opens, alongside the run counts. A test waiting on
   * a fresh sample is why no result has appeared, so the flag has to be visible on the test
   * itself rather than only inside a modal somebody has to think to open.
   */
  rejectionSummary = new Map<string, SampleRejectionSummaryDto>();

  showRejectionModal: boolean = false;
  rejectionModalTestRegId: number = 0;
  rejectionModalTestCode: string = '';
  rejectionModalTestName: string = '';

  // ── Report print status ─────────────────────────────────────────────────
  /**
   * "Has this report been printed?" flag for each test on the open booking, keyed
   * by test code. Read-only here — the flag is set automatically by the Print
   * button on the generated report itself (a different tab/window), never by
   * clicking anything in this list. See ReportPrintStatusService.
   *
   * Fetched when the detail overlay opens, alongside the run counts and rejection
   * summary, and refreshed when the report screen is closed so a print that just
   * happened in the other tab shows up without reopening the booking. A test code
   * never printed has no entry here — treated the same as not printed, matching
   * how the API omits it too.
   */
  printStatus = new Map<string, ReportPrintStatusDto>();

  // ── Visit grouping (Today / Still waiting / Past) ─────────────────────
  todayVisits:   patientTest[] = [];
  waitingVisits: patientTest[] = [];
  pastVisits:    patientTest[] = [];
  /** Past visits after the search box and "Show older" limit, grouped by month. */
  pastGroups: { label: string; visits: patientTest[] }[] = [];
  pastSearch = '';
  showAllPast = false;
  readonly PAST_PAGE_SIZE = 6;
  /** Past visits matching the search, before the "Show older" cut. */
  pastMatchCount = 0;

  /** Test code → display name, loaded once for every code on this patient. */
  testNameByCode = new Map<string, string>();
  /** Cached display model per booking id — rebuilt whenever the list or names change. */
  private visitViews = new Map<string, VisitView>();

  /** Saved-result progress per test code for the OPEN visit. */
  resultProgress = new Map<string, { filled: number; total: number }>();
  isLoadingProgress = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private testReportService: TestReportService,
    private testReportGenerationService: TestReportGenerationServices,
    private pathologyService: PathologyService,
    private patientService: PatientService,
    private receiptService: ReceiptService,
    private testRunService: TestRunService,
    private sampleRejectionService: SampleRejectionService,
    private reportPrintStatusService: ReportPrintStatusService,
    private location: Location,
    private toastr: ToastrService,
    private sampleLabelService: SampleLabelService,
    private samplingLocationService: SamplingLocationService,
  ) {}

  // ── Sampling location & barcode ──────────────────────────────────────────
  /**
   * A barcode is generated only once a booking has "Sampling Done At". Bookings
   * saved without one show a picker here; saving it generates the barcode.
   */
  get samplingLocations(): string[] { return this.samplingLocationService.getAll(); }

  /** patient_Test_Id → location picked in the card, not yet saved. */
  samplingDraft: Record<string, string> = {};
  // Hold the raw id (the API sends a number despite the string typing) so the
  // template's === comparisons against test.patient_Test_Id match.
  savingSamplingFor: patientTest['patient_Test_Id'] | null = null;
  printingLabelFor:  patientTest['patient_Test_Id'] | null = null;
  /** Booking whose Smart Health Report is being generated (button spinner). */
  openingSmartReportFor: patientTest['patient_Test_Id'] | null = null;
  /** Booking whose Smart Report link is being prepared for WhatsApp (button spinner). */
  sendingSmartWhatsAppFor: patientTest['patient_Test_Id'] | null = null;

  hasSamplingLocation(test: patientTest): boolean {
    return !!(test.sampling_Done_At || '').trim();
  }

  saveSamplingLocation(test: patientTest, event?: Event): void {
    event?.stopPropagation();
    const id = String(test.patient_Test_Id);
    const location = (this.samplingDraft[id] || '').trim();
    if (!location) {
      this.toastr.warning('Select a sampling location first.', 'Sampling Done At');
      return;
    }

    this.savingSamplingFor = test.patient_Test_Id;
    this.patientService.updateSamplingLocation(Number(test.patient_Test_Id), location).subscribe({
      next: (res: BookingResultDto) => {
        this.savingSamplingFor = null;
        if (!res?.success) {
          this.toastr.error(res?.message || 'Could not save the sampling location.', 'Error');
          return;
        }
        test.sampling_Done_At = res.samplingDoneAt || location;
        delete this.samplingDraft[id];
        this.toastr.success('Sampling location saved. Barcode generated.', 'Saved');
        if (res.labelsReady) {
          this.printBarcode(test);
        }
      },
      error: (err: any) => {
        this.savingSamplingFor = null;
        this.toastr.error(err?.error?.message || 'Could not save the sampling location.', 'Error');
      },
    });
  }

  printBarcode(test: patientTest, event?: Event): void {
    event?.stopPropagation();
    if (!this.hasSamplingLocation(test)) {
      this.toastr.warning('Select "Sampling Done At" before generating the barcode.', 'Barcode pending');
      return;
    }
    this.printingLabelFor = test.patient_Test_Id;
    this.sampleLabelService.printLabels(Number(test.patient_Test_Id)).subscribe({
      next: (opened: boolean) => {
        this.printingLabelFor = null;
        if (!opened) {
          this.toastr.warning('The label window was blocked. Allow pop-ups for this site and try again.',
            'Labels not shown');
        }
      },
      error: (err: any) => {
        this.printingLabelFor = null;
        this.toastr.error(err?.error?.error || 'The barcode could not be generated.', 'Labels not printed');
      },
    });
  }

  /**
   * Opens the Smart Health Report for the whole booking in a new tab.
   * Blocked cases (cancelled, no results, nothing scoreable) come back as a 400
   * whose message the ErrorInterceptor already shows, so nothing is toasted here.
   */
  openSmartReport(test: patientTest, event?: Event): void {
    event?.stopPropagation();
    this.openingSmartReportFor = test.patient_Test_Id;
    this.testReportGenerationService.generateSmartReport(Number(test.patient_Test_Id)).subscribe({
      next: (html: string) => {
        this.openingSmartReportFor = null;
        if (!html || !html.trim()) {
          this.toastr.warning('The Smart Report came back empty.', 'Warning');
          return;
        }
        this.openHtmlReportTab(html, undefined, `${this.patientName || 'Patient'} | Smart Health Report`);
      },
      error: (err: unknown) => {
        this.openingSmartReportFor = null;
        console.error('generateSmartReport error:', err);
      },
    });
  }

  ngOnInit(): void {
    // Pre-fetch pathology details so path_Branch is available when generating reports.
    this.pathologyService.getPathology().subscribe({
      next: (lab) => { this.pathBranch = lab?.path_Branch || ''; },
      error: () => { /* non-critical — report will still generate without branch */ }
    });

    this.route.queryParamMap.subscribe(params => {
      const pid = params.get('patientId');
      if (pid) {
        this.patientId = pid;
        this.showPatientIdInput = false;
        this.navigatedViaQueryParam = true;
        this.loadPatientTests();
      } else {
        this.showPatientIdInput = true;
        this.navigatedViaQueryParam = false;
      }
    });
  }

  onPatientIdSubmit(): void {
    if (this.enteredPatientId && this.enteredPatientId.trim()) {
      this.patientId = this.enteredPatientId.trim();
      this.showPatientIdInput = false;
      this.loadPatientTests();
    }
  }

  // ── Data loading ───────────────────────────────────────────────────────

  /**
   * Reloads the patient's bookings.
   *
   * `silent` refreshes the list in the background without the full-page loading
   * overlay. Use it whenever an overlay (parameter entry, detail view) is open and
   * already showing its own spinner — two spinners on screen at once read as a
   * stuck screen, and the page overlay belongs to the list the operator is not
   * looking at.
   */
  loadPatientTests(silent: boolean = false): void {
    if (!silent) {
      this.isLoading = true;
      this.errorMessage = '';
    }

    this.loadPatientContact();

    this.testReportService.getAllPatientTests(this.patientId).subscribe({
      next: (data: patientTest[]) => {
        this.allPatientTests = data ?? [];
        this.filterTests();
        this.loadTestNames();
        if (!silent) this.isLoading = false;
      },
      error: (error: Error) => {
        if (!silent) {
          this.errorMessage = 'Failed to load patient tests. Please try again.';
          this.isLoading = false;
        }
        console.error('Error loading patient tests:', error);
      }
    });
  }

  refreshList(): void {
    this.loadPatientTests();
  }

  /**
   * Loads the patient's name and contact number. The name is used for report
   * file names; the number is the WhatsApp chat the report is sent to.
   * Non-critical: if it fails, the WhatsApp button explains the number is missing.
   */
  private loadPatientContact(): void {
    this.patientContact = '';
    if (!this.patientId) return;
    this.patientService.getPatientById(this.patientId).subscribe({
      next: (p) => {
        this.patientContact = p?.patientContact || '';
        if (p?.patientName) this.patientName = p.patientName;
      },
      error: () => { /* non-critical — WhatsApp button will report the missing number */ }
    });
  }

  // ── Grouping ───────────────────────────────────────────────────────────

  /**
   * Splits `allPatientTests` into the three sections the page shows.
   *
   *  • Today         — registered today (any status, cancelled included).
   *  • Still waiting — earlier visits, not cancelled, results not complete.
   *  • Past visits   — everything else, newest first, grouped by month.
   *
   * The split is by TIME, never by a toggle: nothing is hidden, so an old report
   * is one scroll away. `patientTests` keeps the full newest-first list.
   */
  private filterTests(): void {
    this.visitViews.clear();
    const sorted = [...this.allPatientTests].sort((a, b) => this.compareNewestFirst(a, b));
    this.patientTests = sorted;

    this.todayVisits   = sorted.filter(t => this.vm(t).isToday);
    this.waitingVisits = sorted.filter(t => !this.vm(t).isToday && !this.isCancelled(t)
                                            && this.reportStatus(t) !== 'Completed');
    const shown = new Set<patientTest>([...this.todayVisits, ...this.waitingVisits]);
    this.pastVisits    = sorted.filter(t => !shown.has(t));
    this.refreshPastGroups();
  }

  /** Newest first by registration date; the booking id breaks ties (higher = newer). */
  private compareNewestFirst(a: patientTest, b: patientTest): number {
    const da = this.visitDate(a)?.getTime() ?? 0;
    const db = this.visitDate(b)?.getTime() ?? 0;
    if (db !== da) return db - da;
    return Number(b.patient_Test_Id) - Number(a.patient_Test_Id);
  }

  /** Applies the past-visit search box and the "Show older" limit, then groups by month. */
  refreshPastGroups(): void {
    const q = this.pastSearch.trim().toLowerCase();
    const matches = !q ? this.pastVisits : this.pastVisits.filter(t => {
      const v = this.vm(t);
      const haystack = [
        ...v.names, t.test_Id, String(t.patient_Test_Id), v.dateLabel, t.referred_By || ''
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
    this.pastMatchCount = matches.length;
    // While searching, show every match — hiding a match behind "Show older" defeats the search.
    const visible = (this.showAllPast || q) ? matches : matches.slice(0, this.PAST_PAGE_SIZE);

    const groups: { label: string; visits: patientTest[] }[] = [];
    for (const t of visible) {
      const label = this.vm(t).monthLabel;
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.visits.push(t);
      else groups.push({ label, visits: [t] });
    }
    this.pastGroups = groups;
  }

  onPastSearchChange(value: string): void {
    this.pastSearch = value ?? '';
    this.refreshPastGroups();
  }

  showOlderVisits(): void {
    this.showAllPast = true;
    this.refreshPastGroups();
  }

  get hiddenPastCount(): number {
    if (this.showAllPast || this.pastSearch.trim()) return 0;
    return Math.max(0, this.pastMatchCount - this.PAST_PAGE_SIZE);
  }

  trackByVisit  = (_: number, t: patientTest) => t.patient_Test_Id;
  trackByGroup  = (_: number, g: { label: string }) => g.label;
  trackByDetail = (_: number, d: testDetail) => d.testCode;

  // ── Test names ─────────────────────────────────────────────────────────

  /** Codes on a booking, in booking order ("CBC,LIPID" → ["CBC","LIPID"]). */
  testCodes(test: patientTest): string[] {
    return (test?.test_Id || '').split(',').map(c => c.trim()).filter(c => !!c);
  }

  /**
   * One request for every test code on this patient, so each visit can show the
   * names of its tests without being opened — the list endpoint only carries
   * codes. Silent on failure: the codes are shown instead.
   */
  private loadTestNames(): void {
    const codes = Array.from(new Set(this.allPatientTests.flatMap(t => this.testCodes(t))))
      .filter(c => !this.testNameByCode.has(c));
    if (codes.length === 0) return;

    this.testReportService.getTestDetails(codes.join(',')).subscribe({
      next: (details: testDetail[]) => {
        for (const d of details ?? []) {
          if (d?.testCode) this.testNameByCode.set(d.testCode, d.testName || d.testCode);
        }
        this.filterTests();   // rebuild the view models with names
      },
      error: () => { /* names fall back to codes */ }
    });
  }

  // ── Visit view model ───────────────────────────────────────────────────

  /** Cached, plain-language description of one booking for the template. */
  vm(test: patientTest): VisitView {
    const key = String(test.patient_Test_Id);
    let v = this.visitViews.get(key);
    if (!v) {
      v = this.buildVisitView(test);
      this.visitViews.set(key, v);
    }
    return v;
  }

  private buildVisitView(test: patientTest): VisitView {
    const date      = this.visitDate(test);
    const cancelled = this.isCancelled(test);
    const status    = this.reportStatus(test);
    const payment   = this.getPaymentStatus(test);
    const due       = test.bill_Reciept?.amount_Pending ?? 0;
    const sampled   = this.hasSamplingLocation(test);
    const names     = this.testCodes(test).map(c => this.testNameByCode.get(c) || c);
    const paid      = payment === 'Paid';
    const onHold    = payment === 'Awaiting Approval';
    const resultsDone = status === 'Completed';

    // ── Money, in words ──
    let paymentText = '';
    let paymentTone: VisitView['paymentTone'] = 'none';
    if (cancelled) {
      paymentText = payment === 'Payment Settled' ? 'Payment settled' : 'Nothing to pay';
    } else if (onHold) {
      paymentText = 'Discount waiting for approval'; paymentTone = 'hold';
    } else if (paid) {
      paymentText = 'Paid'; paymentTone = 'ok';
    } else if (due > 0) {
      paymentText = `₹${this.formatMoney(due)} still to pay`; paymentTone = 'due';
    } else {
      paymentText = 'Not paid yet'; paymentTone = 'due';
    }

    // ── Progress steps ──
    const steps: VisitStep[] = [
      { label: 'Booked', state: 'done' },
      { label: sampled ? 'Sample taken' : 'Sample place not chosen', state: sampled ? 'done' : 'current' },
      {
        label: resultsDone ? 'All results entered'
             : status === 'Partial' ? 'Some results entered' : 'Results not entered',
        state: resultsDone ? 'done' : (sampled ? 'current' : 'todo')
      },
      { label: 'Report ready', state: resultsDone && paid ? 'done' : (resultsDone ? 'current' : 'todo') },
    ];

    // ── The one next step ──
    let next: VisitView['next'] = 'none';
    let nextText = '';
    if (cancelled) {
      nextText = test.cancellation_Reason ? `Cancelled — ${test.cancellation_Reason}` : 'This visit was cancelled.';
    } else if (!sampled) {
      next = 'sampling'; nextText = 'Choose where the sample was taken. This also creates the barcode.';
    } else if (!resultsDone) {
      next = 'results';
      nextText = status === 'Partial' ? 'Some results are still missing — finish entering them.'
                                      : 'Enter the test results.';
    } else if (onHold) {
      next = 'reports'; nextText = 'Results are in. Payment is on hold until the discount is approved.';
    } else if (!paid) {
      next = 'payment'; nextText = 'Results are in. Take the payment to release the report.';
    } else {
      next = 'reports'; nextText = 'Report is ready to print or send.';
    }

    // ── One status line for list rows ──
    let statusText = '';
    let statusTone: VisitView['statusTone'] = 'ok';
    if (cancelled)         { statusText = 'Cancelled';                   statusTone = 'muted'; }
    else if (!resultsDone) { statusText = status === 'Partial' ? 'Some results missing' : 'Results not entered'; statusTone = 'warn'; }
    else if (!paid)        { statusText = onHold ? 'Results ready · discount on hold' : 'Results ready · payment due'; statusTone = 'warn'; }
    else                   { statusText = 'Report ready · Paid';         statusTone = 'ok'; }

    return {
      names,
      isToday:    !!date && this.isSameDay(date, new Date()),
      dateLabel:  date ? `${String(date.getDate()).padStart(2, '0')} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}` : 'Date not recorded',
      dayLabel:   date ? date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '',
      relLabel:   date ? this.relativeLabel(date) : '',
      monthLabel: date ? date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase() : 'DATE NOT RECORDED',
      steps, next, nextText, statusText, statusTone, paymentText, paymentTone, due, cancelled,
    };
  }

  private formatMoney(n: number): string {
    return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  /** Registration date as a Date. The API sends "dd-MMM-yyyy"; ISO strings are accepted too. */
  visitDate(test: patientTest): Date | null {
    const raw = (test?.registration_Date || '').trim();
    if (!raw) return null;
    const parsed = this.parseDMMMYYYY(raw);
    if (parsed) return parsed;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /** "Today", "Yesterday", "5 days ago", "1 month ago", "2 years ago". */
  private relativeLabel(date: Date): string {
    const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((start(new Date()) - start(date)) / 86400000);
    if (days <= 0)  return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30)  return `${days} days ago`;
    const months = Math.floor(days / 30.44);
    if (months < 12) return months <= 1 ? '1 month ago' : `${months} months ago`;
    const years = Math.floor(days / 365.25);
    return years <= 1 ? '1 year ago' : `${years} years ago`;
  }

  /** Runs the visit's one main action (the big blue button). */
  doNextStep(test: patientTest, event: Event): void {
    switch (this.vm(test).next) {
      case 'payment': this.openPaymentModal(test, event); break;
      default:        this.viewDetails(test, event);      break;
    }
  }

  nextStepLabel(test: patientTest): string {
    const v = this.vm(test);
    switch (v.next) {
      case 'results': return this.reportStatus(test) === 'Partial' ? 'Finish results' : 'Enter results';
      case 'payment': return 'Take payment';
      case 'reports': return 'View reports';
      default:        return 'Open visit';
    }
  }

  // ── Visit screen: per-test result progress ─────────────────────────────

  /**
   * Reads how many parameters of each test already have a saved result, so the
   * visit screen can say "3 of 8 entered" per test instead of one booking-wide
   * Pending / Partial. One small request per test; failures just hide the count.
   */
  private loadResultProgress(test: patientTest, details: testDetail[]): void {
    this.resultProgress.clear();
    if (!details.length) return;
    this.isLoadingProgress = true;
    const id = Number(test.patient_Test_Id);
    forkJoin(details.map(d =>
      this.testReportService.getSavedTestReport(id, d.testCode).pipe(catchError(() => of(null)))
    )).subscribe(results => {
      results.forEach((rows, i) => {
        if (!rows) return;
        const filled = rows.filter((r: any) => (r?.obtainedValue ?? '').toString().trim() !== '').length;
        this.resultProgress.set(details[i].testCode, { filled, total: rows.length });
      });
      this.isLoadingProgress = false;
    });
  }

  /** 'done' | 'partial' | 'none' | 'unknown' for one test on the open visit. */
  resultState(detail: testDetail): 'done' | 'partial' | 'none' | 'unknown' {
    const p = this.resultProgress.get(detail.testCode);
    if (!p) return 'unknown';
    if (p.total > 0 && p.filled >= p.total) return 'done';
    return p.filled > 0 ? 'partial' : 'none';
  }

  resultText(detail: testDetail): string {
    const p = this.resultProgress.get(detail.testCode);
    if (!p) return this.isLoadingProgress ? 'Checking…' : '—';
    if (p.total === 0) return 'No values set up for this test';
    if (p.filled >= p.total) return 'All entered';
    if (p.filled === 0) return 'Not entered yet';
    return `${p.filled} of ${p.total} entered`;
  }

  /** How many tests on the open visit have every result saved. */
  get readyTestCount(): number {
    return this.testDetails.filter(d => this.resultState(d) === 'done').length;
  }

  /** The first test that still needs results — its button is the blue one. */
  get firstPendingTestCode(): string | null {
    const d = this.testDetails.find(x => !this.hasOpenRejection(x) && this.resultState(x) !== 'done');
    return d ? d.testCode : null;
  }

  get selectedVisitPaid(): boolean {
    return !!this.selectedPatientTest && this.getPaymentStatus(this.selectedPatientTest) === 'Paid';
  }

  /** "Sunday, 28 September 2026" for the Today heading. */
  get todayLabel(): string {
    return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Bill / paid / still-to-pay for one booking, from its embedded receipt summary. */
  visitMoney(test: patientTest): { bill: number; paid: number; due: number } {
    const r = test?.bill_Reciept;
    if (!r) return { bill: test?.amount_Tobe_Paid ?? 0, paid: 0, due: test?.amount_Tobe_Paid ?? 0 };
    const paid = r.amount_Paid || 0;
    const due  = r.amount_Pending || 0;
    const bill = r.net_Amount ?? (paid + due);
    return { bill, paid, due };
  }

  // ── "More" menu ────────────────────────────────────────────────────────

  /** Booking whose "More" menu is open (one at a time). */
  openMoreFor: patientTest['patient_Test_Id'] | null = null;

  toggleMore(test: patientTest, event: Event): void {
    event.stopPropagation();
    this.openMoreFor = this.openMoreFor === test.patient_Test_Id ? null : test.patient_Test_Id;
  }

  closeMore(): void { this.openMoreFor = null; }

  /** A click anywhere else, or Escape, closes the menu. */
  @HostListener('document:click')
  onDocumentClick(): void { this.closeMore(); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeMore(); }

  // ── Visit screen actions that open another dialog ──────────────────────
  // The payment and cancel dialogs sit on the page, so the visit screen closes
  // first — the same order payNowFromReport has always used.

  takePaymentFromVisit(event: Event): void {
    event.stopPropagation();
    const test = this.selectedPatientTest;
    if (!test) return;
    this.closeDetailView();
    this.openPaymentModal(test, event);
  }

  cancelFromVisit(event: Event): void {
    event.stopPropagation();
    const test = this.selectedPatientTest;
    if (!test) return;
    this.closeDetailView();
    this.openCancelModal(test, event);
  }

  /** Opens one finished test's report straight from the visit table. */
  viewTestReport(detail: testDetail, event: Event): void {
    event.stopPropagation();
    this.selectedTestDetail = detail;
    this.generateTestReportPDF();
  }

  // ── Add Test Modal ─────────────────────────────────────────────────────

  showAddTestModal = false;

  /** Opens the "Add New Test" slide-over modal for the current patient. */
  addNewTest(): void {
    this.showAddTestModal = true;
  }

  onAddTestSaved(): void {
    this.showAddTestModal = false;
    this.loadPatientTests();
  }

  onAddTestCancelled(): void {
    this.showAddTestModal = false;
  }

  // ── View Receipts — redirect to the shared Receipt module ────────────

  /**
   * Navigates to the shared bill-receipt page pre-filtered for this test's ID.
   * This avoids duplicating receipt display logic here.
   */
  viewReceipts(test: patientTest, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/receipt'], {
      queryParams: { patientId: test.patient_Test_Id }
    });
  }

  // ── Computed helpers ───────────────────────────────────────────────────

  /** True when there is genuinely no data for this patient at all. */
  get noTestsAtAll(): boolean {
    return !this.isLoading && this.allPatientTests.length === 0;
  }

  /**
   * Parses a date string in dd-MMM-yyyy format (e.g. "15-Jan-2025").
   * Returns null for blank or unrecognised strings.
   */
  private parseDMMMYYYY(dateStr: string): Date | null {
    if (!dateStr) return null;
    const MONTHS: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4,  Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const day   = parseInt(parts[0], 10);
    const month = MONTHS[parts[1]];
    const year  = parseInt(parts[2], 10);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;
    return new Date(year, month, day);
  }

  /** Formats a test's registration date for display. Returns '' if unavailable. */
  getFormattedDate(test: patientTest): string {
    if (!test.registration_Date) return '';
    const d = new Date(test.registration_Date);
    if (isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
  }

  /** Report status string is passed straight through from the backend. */
  reportStatus(test: patientTest): string {
    return test.is_Report_Generated || 'Pending';
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  goBack(): void {
    if (this.navigatedViaQueryParam) {
      this.location.back();
    } else if (!this.showPatientIdInput) {
      this.showPatientIdInput = true;
      this.allPatientTests = [];
      this.filterTests();
      this.pastSearch = '';
      this.showAllPast = false;
      this.patientId = '';
      this.patientName = '';
      this.enteredPatientId = '';
      this.errorMessage = '';
    } else {
      this.location.back();
    }
  }

  // ── Payment helpers ────────────────────────────────────────────────────

  /**
   * Returns the payment status for a test card badge.
   * Reads `bill_Reciept.payment_Status` first (set by backend).
   * Falls back to deriving it from `amount_Pending` for older records
   * that may not include payment_Status.
   */
  getPaymentStatus(test: patientTest): string {
    // Delegates to the shared resolver so cancelled bookings show
    // "Payment Settled" / "Payment Not Needed" consistently everywhere.
    return resolvePaymentStatus(test);
  }

  /** Full badge text, e.g. "Payment : Paid" or "Payment Settled". */
  getPaymentBadgeLabel(test: patientTest): string {
    return paymentBadgeLabel(test);
  }

  getPaymentStatusClass(test: patientTest): string {
    return paymentStatusClass(test);
  }

  // ── Payment Modal ──────────────────────────────────────────────────────

  showPaymentModal: boolean = false;
  activePaymentTest: patientTest | null = null;

  get paymentTestId(): string {
    return this.activePaymentTest?.patient_Test_Id ?? '';
  }

  /**
   * Net amount = amount_Paid + amount_Pending when the API returns net_Amount as null.
   * This is the total the patient owes for this test.
   */
  private get _derivedNetAmount(): number {
    const r = this.activePaymentTest?.bill_Reciept;
    if (!r) return this.activePaymentTest?.amount_Tobe_Paid ?? 0;
    // net_Amount is null in current API responses — derive from paid + pending
    if (r.net_Amount != null) return r.net_Amount;
    return (r.amount_Paid || 0) + (r.amount_Pending || 0);
  }

  get paymentTestAmount(): number {
    const r = this.activePaymentTest?.bill_Reciept;
    if (!r) return this.activePaymentTest?.amount_Tobe_Paid ?? 0;
    // test_Amount is null in current API — fall back to derived net amount
    return r.test_Amount ?? this._derivedNetAmount;
  }

  get paymentNetAmount(): number {
    return this._derivedNetAmount;
  }

  /**
   * True when the test already has a partial payment recorded.
   * In this case the modal opens in topup mode (pre-filled with the remaining balance).
   */
  get isPaymentTopup(): boolean {
    const r = this.activePaymentTest?.bill_Reciept;
    return !!r && (r.amount_Paid || 0) > 0 && (r.amount_Pending || 0) > 0;
  }

  /** Amount to pre-fill in topup mode = the remaining pending balance. */
  get paymentPrefillAmount(): number {
    return this.activePaymentTest?.bill_Reciept?.amount_Pending ?? 0;
  }

  openPaymentModal(test: patientTest, event: Event): void {
    event.stopPropagation();
    this.activePaymentTest = test;
    this.showPaymentModal  = true;
  }

  onPaymentSaved(): void {
    this.showPaymentModal  = false;
    this.activePaymentTest = null;
    this.loadPatientTests();
  }

  onPaymentCancelled(): void {
    this.showPaymentModal  = false;
    this.activePaymentTest = null;
  }

  getTestCount(test: patientTest): number {
    if (test.test_count) return test.test_count;
    if (test.test_Id) return test.test_Id.split(',').filter(id => id.trim()).length;
    return 0;
  }

  // ── Detail view ────────────────────────────────────────────────────────

  viewDetails(test: patientTest, event: Event): void {
    event.stopPropagation();
    this.selectedPatientTest = test;
    this.showDetailView = true;
    this.loadTestDetails(test.test_Id);
    this.loadRunCounts(Number(test.patient_Test_Id));
    this.loadRejectionSummary(Number(test.patient_Test_Id));
    this.loadPrintStatus(Number(test.patient_Test_Id));
  }

  loadTestDetails(patientTestId: string): void {
    this.isLoadingDetails = true;
    this.detailErrorMessage = '';
    this.testDetails = [];

    this.testReportService.getTestDetails(patientTestId).subscribe({
      next: (data: testDetail[]) => {
        this.testDetails = data ?? [];
        this.isLoadingDetails = false;
        if (this.selectedPatientTest) this.loadResultProgress(this.selectedPatientTest, this.testDetails);
      },
      error: (error: Error) => {
        this.detailErrorMessage = 'Failed to load test details. Please try again.';
        this.isLoadingDetails = false;
        console.error('Error loading test details:', error);
      }
    });
  }

  closeDetailView(): void {
    this.showDetailView = false;
    this.selectedPatientTest = null;
    this.testDetails = [];
    this.resultProgress.clear();
    this.runCounts.clear();
    this.rejectionSummary.clear();
    this.printStatus.clear();
  }

  // ── Sample collection protocol ─────────────────────────────────────────

  /**
   * Opens the protocol viewer for every test on a booking.
   *
   * The card knows how many tests it has but not which ones, so the test list is fetched
   * first — unless the detail overlay for this same booking is already open, in which case
   * the codes are already in hand and a second round trip would only add a delay.
   */
  openBookingProtocols(test: patientTest, event: Event): void {
    event.stopPropagation();

    const alreadyLoaded =
      this.selectedPatientTest?.patient_Test_Id === test.patient_Test_Id
        ? this.collectTestCodes(this.testDetails)
        : [];

    if (alreadyLoaded.length > 0) {
      this.openProtocolModal(alreadyLoaded, `Booking ${test.patient_Test_Id}`);
      return;
    }

    this.loadingProtocolFor = test.patient_Test_Id;
    this.testReportService.getTestDetails(test.test_Id).subscribe({
      next: (details: testDetail[]) => {
        this.loadingProtocolFor = null;
        const codes = this.collectTestCodes(details);
        if (codes.length === 0) {
          this.toastr.info('No tests found on this booking.');
          return;
        }
        this.openProtocolModal(codes, `Booking ${test.patient_Test_Id}`);
      },
      error: () => {
        this.loadingProtocolFor = null;
        this.toastr.error('Could not load the tests on this booking.');
      }
    });
  }

  /** Opens the protocol viewer for a single test inside the detail overlay. */
  openDetailProtocol(detail: testDetail, event: Event): void {
    event.stopPropagation();
    if (!detail?.testCode) {
      this.toastr.info('This test has no code, so its protocol cannot be looked up.');
      return;
    }
    this.openProtocolModal([detail.testCode], detail.testName);
  }

  closeProtocolModal(): void {
    this.showProtocolModal = false;
    this.protocolTestCodes = [];
    this.protocolModalSubtitle = '';
  }

  private openProtocolModal(codes: string[], subtitle: string): void {
    this.protocolTestCodes = codes;
    this.protocolModalSubtitle = subtitle;
    this.showProtocolModal = true;
  }

  private collectTestCodes(details: testDetail[]): string[] {
    // The detail rows are per parameter as often as per test, so the same code arrives
    // several times; the viewer would otherwise render the same protocol twice.
    return Array.from(new Set((details ?? []).map(d => d.testCode).filter(c => !!c)));
  }

  // ── Repeat testing ─────────────────────────────────────────────────────

  /**
   * How many times each test on this booking has been run.
   *
   * One request for the whole booking. Failure is silent: the badge is extra information
   * beside the result, and losing it must not put an error banner over a screen the
   * operator opened to read a value.
   */
  private loadRunCounts(patientTestId: number): void {
    this.runCounts.clear();
    if (!patientTestId) return;

    this.testRunService.getBookingCounts(patientTestId).subscribe({
      next: (counts: TestRunCountDto[]) => {
        this.runCounts = new Map((counts ?? []).map(c => [c.testCode, c]));
      },
      error: () => { /* badge simply does not appear */ }
    });
  }

  /**
   * How many times this test has been run.
   *
   * A test with no recorded runs has been run once — rows are written from the first repeat
   * onwards, so an absent entry means "never repeated", not "never done".
   */
  runCount(detail: testDetail): number {
    const entry = this.runCounts.get(detail?.testCode ?? '');
    return entry && entry.runCount > 0 ? entry.runCount : 1;
  }

  runCountTooltip(detail: testDetail): string {
    const entry = this.runCounts.get(detail?.testCode ?? '');
    const times = `Run ${this.runCount(detail)} times on the collected sample`;
    return entry?.latestReason ? `${times} — latest reason: ${entry.latestReason}` : times;
  }

  openRunHistory(detail: testDetail, event: Event): void {
    event.stopPropagation();
    if (!this.selectedPatientTest) return;

    this.runModalTestRegId = Number(this.selectedPatientTest.patient_Test_Id);
    this.runModalTestCode = detail?.testCode ?? '';
    this.runModalTestName = detail?.testName ?? '';
    this.showRunModal = true;
  }

  closeRunHistory(): void {
    this.showRunModal = false;
  }

  /** A repeat was recorded or the accepted run moved — the badge is now out of date. */
  onRunsChanged(): void {
    if (this.selectedPatientTest) {
      this.loadRunCounts(Number(this.selectedPatientTest.patient_Test_Id));
    }
  }

  // ── Sample rejection ───────────────────────────────────────────────────

  /**
   * Which tests on this booking are waiting on a fresh sample.
   *
   * One request for the whole booking, and a silent failure: losing the flag is worse than
   * an error banner over a screen someone opened to read a value, but not by enough to
   * justify one.
   */
  private loadRejectionSummary(patientTestId: number): void {
    this.rejectionSummary.clear();
    if (!patientTestId) return;

    this.sampleRejectionService.getBookingSummary(patientTestId).subscribe({
      next: (rows: SampleRejectionSummaryDto[]) => {
        this.rejectionSummary = new Map((rows ?? []).map(r => [r.testCode, r]));
      },
      error: () => { /* flag simply does not appear */ }
    });
  }

  /** True while this test is waiting on a fresh sample — the state that blocks a result. */
  hasOpenRejection(detail: testDetail): boolean {
    return this.rejectionSummary.get(detail?.testCode ?? '')?.hasOpenRejection === true;
  }

  /** True when a sample was rejected at some point, whether or not it is still open. */
  wasEverRejected(detail: testDetail): boolean {
    return (this.rejectionSummary.get(detail?.testCode ?? '')?.rejectionCount ?? 0) > 0;
  }

  /**
   * The rejection reason to show on the test.
   *
   * The open one where there is one; otherwise the most recent, so a test that was rejected
   * and re-collected still says what went wrong the first time.
   */
  rejectionReason(detail: testDetail): string {
    return this.rejectionSummary.get(detail?.testCode ?? '')?.latestReasonLabel ?? '';
  }

  rejectionCategory(detail: testDetail): string {
    return this.rejectionSummary.get(detail?.testCode ?? '')?.latestCategoryLabel ?? '';
  }

  openRejectionView(detail: testDetail, event: Event): void {
    event.stopPropagation();
    if (!this.selectedPatientTest) return;

    this.rejectionModalTestRegId = Number(this.selectedPatientTest.patient_Test_Id);
    this.rejectionModalTestCode = detail?.testCode ?? '';
    this.rejectionModalTestName = detail?.testName ?? '';
    this.showRejectionModal = true;
  }

  closeRejectionView(): void {
    this.showRejectionModal = false;
  }

  /** A rejection was recorded or closed — the flag on the test is now out of date. */
  onRejectionsChanged(): void {
    if (this.selectedPatientTest) {
      this.loadRejectionSummary(Number(this.selectedPatientTest.patient_Test_Id));
    }
  }

  // ── Report print status ─────────────────────────────────────────────────

  /**
   * The printed flag for every test on this booking.
   *
   * One request for the whole booking, and a silent failure: losing the badge is
   * worse than an error banner over a screen someone opened to read a value, but
   * not by enough to justify one.
   */
  private loadPrintStatus(patientTestId: number): void {
    this.printStatus.clear();
    if (!patientTestId) return;

    this.reportPrintStatusService.getBookingSummary(patientTestId).subscribe({
      next: (rows: ReportPrintStatusDto[]) => {
        this.printStatus = new Map((rows ?? []).map(r => [r.testCode, r]));
      },
      error: () => { /* badge simply does not appear */ }
    });
  }

  /** True once this test's report has been marked printed. A missing entry means not printed. */
  isPrinted(detail: testDetail): boolean {
    return this.printStatus.get(detail?.testCode ?? '')?.isPrinted === true;
  }

  printedTooltip(detail: testDetail): string {
    const entry = this.printStatus.get(detail?.testCode ?? '');
    if (!entry?.isPrinted) return 'Not printed yet — set automatically when the report is printed';

    const when = entry.printedAt ? new Date(entry.printedAt).toLocaleString() : '';
    const who = entry.printedBy ? ` by ${entry.printedBy}` : '';
    return when ? `Printed ${when}${who}` : `Printed${who}`;
  }

  /**
   * Re-reads the printed flag for the open booking.
   *
   * The flag itself is set from the generated report page in its own tab, so this
   * screen has no way to know when that happened — refreshing when the operator
   * comes back to it (closing the report view) is the closest this list gets to
   * "live".
   */
  private refreshPrintStatus(): void {
    if (this.selectedPatientTest) {
      this.loadPrintStatus(Number(this.selectedPatientTest.patient_Test_Id));
    }
  }

  // ── Parameter view ─────────────────────────────────────────────────────

  openParameterView(detail: testDetail, event: Event): void {
    event.stopPropagation();
    this.selectedTestDetail = detail;
    this.showParameterView = true;
    this.activeParameterIndex = 0;
    this.parameterErrorMessage = '';
    this.testParameters = [];
    this.savedResults.clear();

    this.loadTestParameters();
  }

  /**
   * (Re)loads this test's parameters and their saved results from the server.
   *
   * GetSavedTestReport returns all parameters for the test with any previously
   * saved obtainedValue (empty when not yet filled). Records present → they
   * exist in the DB → UPDATE on save; absent → INSERT on save.
   *
   * Called on open AND after a successful save. Re-loading after save is what
   * keeps `reportId` accurate — without it a second save of a freshly entered
   * result would INSERT a duplicate row instead of updating the first one.
   */
  private loadTestParameters(): void {
    if (!this.selectedPatientTest || !this.selectedTestDetail) return;

    this.isLoadingParameters = true;

    this.testReportService.getSavedTestReport(
      Number(this.selectedPatientTest.patient_Test_Id),
      this.selectedTestDetail.testCode
    ).subscribe({
      next: (saved: any[]) => {
        this.testParameters = (saved ?? []).map((s: any) => ({
          parameterId:    s.parameterId,
          testRegId:      s.testRegId,
          parameterName:  s.parameterName,
          parameterUnit:  s.parameterUnit,
          parameterRange: s.parameterRange,
          resultValue:    s.obtainedValue ?? '',
          // If the backend already has a value → UPDATE on save.
          // If obtainedValue was null/empty → this is a new entry → INSERT.
          reportId:       s.obtainedValue ? s.parameterId : undefined,
        } as testParameter));

        // Snapshot what the database actually holds — this, not the inputs,
        // is what decides whether the report can be issued.
        this.savedResults.clear();
        for (const row of (saved ?? [])) {
          this.savedResults.set(row.parameterId, (row.obtainedValue ?? '').toString());
        }

        this.isLoadingParameters = false;
      },
      error: (error: Error) => {
        this.parameterErrorMessage = 'Failed to load test parameters. Please try again.';
        this.isLoadingParameters = false;
        console.error('Error loading test parameters:', error);
      }
    });
  }

  // ── Report readiness ───────────────────────────────────────────────────────

  /** Parameters with no saved result yet. */
  get missingResultCount(): number {
    return this.testParameters
      .filter(p => !(this.savedResults.get(p.parameterId) ?? '').trim())
      .length;
  }

  /**
   * A report may only be viewed or downloaded once every parameter has a saved
   * result. Issuing one earlier produces a document with blank rows that still
   * looks like a finished lab report — the thing this guards against.
   */
  get canIssueReport(): boolean {
    return this.testParameters.length > 0 && this.missingResultCount === 0;
  }

  /** Why the report buttons are unavailable — shown as their tooltip. */
  get reportBlockedReason(): string {
    if (this.testParameters.length === 0) return 'This test has no parameters configured.';
    const n = this.missingResultCount;
    if (n === 0) return '';
    return n === 1
      ? 'One result has not been entered and saved yet.'
      : `${n} results have not been entered and saved yet.`;
  }
  closeParameterView(): void {
    this.showParameterView = false;
    this.selectedTestDetail = null;
    this.testParameters = [];
    this.activeParameterIndex = 0;
    // Whichever report action the operator just used (View Report / PDF) opened in
    // its own tab and prints from there — refresh so a print that happened while
    // this overlay was open is reflected as soon as they come back to it.
    this.refreshPrintStatus();
    // Results may have just been saved — refresh the per-test counts on the visit screen.
    if (this.selectedPatientTest && this.testDetails.length) {
      this.loadResultProgress(this.selectedPatientTest, this.testDetails);
    }
  }

  /**
   * Called from the "Create Test Report" overlay when payment is not complete.
   * Closes the parameter and detail overlays, then opens the payment modal.
   * After payment the list refreshes and both overlays can be re-entered with
   * the updated (Paid) status.
   */
  payNowFromReport(event: Event): void {
    event.stopPropagation();
    if (!this.selectedPatientTest) return;
    const test = this.selectedPatientTest;   // capture before close nulls it
    this.closeParameterView();
    this.closeDetailView();
    this.openPaymentModal(test, event);
  }

  selectParameterCard(index: number): void { this.activeParameterIndex = index; }
  isActiveParameterCard(index: number): boolean { return this.activeParameterIndex === index; }
  getParameterCardZIndex(index: number): number {
    if (index === this.activeParameterIndex) return this.testParameters.length + 1;
    return this.testParameters.length - Math.abs(index - this.activeParameterIndex);
  }

  updateParameterResult(parameter: testParameter, value: string): void {
    parameter.resultValue = value;
  }

  saveTestReport(): void {
    if (!this.selectedTestDetail) return;
    if (this.testParameters.length === 0) {
      this.toastr.warning('There is nothing to save for this test.', 'No parameters');
      return;
    }
    this.isLoadingParameters = true;
    this.parameterErrorMessage = '';

    // ── Split parameters into INSERT and UPDATE batches ────────────────
    // A parameter is UPDATEd when GetTestReportAsync returned an existing
    // row for it (reportId is set). All others are new rows → INSERT.
    const toInsert: PatientTestReport[] = [];
    const toUpdate: PatientTestReport[] = [];

    for (const param of this.testParameters) {
      const dto: PatientTestReport = {
        id:            param.reportId,
        pathologyId:   this.selectedTestDetail!.pathologyId,
        testCode:      this.selectedTestDetail!.testCode,
        testRegId:     this.selectedPatientTest!.patient_Test_Id,
        parameterId:   param.parameterId,
        obtainedValue: param.resultValue || '',
      };

      // reportId is set only when getSavedTestReport found an existing DB row
      if (param.reportId !== undefined) {
        toUpdate.push(dto);
      } else {
        toInsert.push(dto);
      }
    }

    // ── Fire required API calls in parallel ────────────────────────────
    const insert$ = toInsert.length > 0
      ? this.testReportService.saveTestReport(toInsert)
      : of(null);

    const update$ = toUpdate.length > 0
      ? this.testReportService.updateTestReport(toUpdate)
      : of(null);

    forkJoin([insert$, update$]).subscribe({
      next: ([, updateResult]: [any, any]) => {
        // The Update endpoint answers HTTP 200 even when it did not apply the
        // change (OperationResult.success === false — e.g. no matching row). A 200
        // is therefore not on its own proof of a save, and ErrorInterceptor only
        // toasts HTTP failures, so this one is ours to catch.
        if (toUpdate.length > 0 && updateResult && updateResult.success === false) {
          this.isLoadingParameters = false;
          const reason = updateResult.message || 'Results could not be saved.';
          this.parameterErrorMessage = reason;
          this.toastr.error(reason, 'Not saved');
          return;
        }

        const saved = toInsert.length + toUpdate.length;
        this.isLoadingParameters = false;
        this.toastr.success(
          saved === 1 ? 'Result saved.' : `${saved} results saved.`,
          'Saved'
        );

        // Background refresh: nothing of the full-page loading overlay here — the
        // operator is being returned to the visit screen, not made to watch it load.
        this.loadPatientTests(true);

        // Entry is done, so close the overlay. No loadTestParameters() is needed:
        // closeParameterView() drops the in-memory parameters and refreshes the
        // per-test result counts, and re-opening the overlay re-reads everything
        // (including each row's reportId) from the server — which is what keeps a
        // second save an UPDATE rather than a duplicate INSERT.
        this.closeParameterView();
      },
      // HTTP failures (4xx/5xx/network) are already toasted by ErrorInterceptor,
      // so only the inline message inside the overlay is set here.
      error: (err) => {
        this.isLoadingParameters = false;
        this.parameterErrorMessage = 'Failed to save test report.';
        console.error('Save test report error:', err);
      }
    });
  }

  // ── Report generation ──────────────────────────────────────────────────

  /**
   * Calls the backend ViewReport endpoint which returns a standalone HTML document,
   * then opens it in a new browser tab via a short-lived Blob URL.
   */
  generateTestReportPDF(): void {
    if (!this.selectedPatientTest || !this.selectedTestDetail) return;

    this.isGeneratingReport = true;
    this.errorMessage = '';

    const patientTestId = Number(this.selectedPatientTest.patient_Test_Id);
    const testCode      = this.selectedTestDetail.testCode;

    this.testReportGenerationService
      .generateTestReport(patientTestId, testCode, this.pathBranch || undefined)
      .subscribe({
        next: (htmlContent: string) => {
          this.isGeneratingReport = false;

          if (!htmlContent || !htmlContent.trim()) {
            this.toastr.warning('Report generated but no content was returned.', 'Warning');
            return;
          }

          // Build a tab title from what we already know (the HTML itself
          // may contain the patient name, but parsing the DOM is unnecessary)
          const today   = new Date();
          const dd      = String(today.getDate()).padStart(2, '0');
          const mm      = String(today.getMonth() + 1).padStart(2, '0');
          const yyyy    = today.getFullYear();
          const dateStr = `${dd}-${mm}-${yyyy}`;
          const tabTitle = `${this.patientName || 'Patient'} | ${testCode} | ${dateStr}`;

          // Backend returns a full standalone HTML document — open it directly
          this.openHtmlReportTab(htmlContent, undefined, tabTitle);
        },
        error: (err: unknown) => {
          this.isGeneratingReport = false;
          // Inline banner kept; HTTP error message shown centrally by ErrorInterceptor.
          this.errorMessage = 'Failed to generate test report. Please try again.';
          console.error('generateTestReport error:', err);
        }
      });
  }

  /**
   * PDF button.
   *
   * The backend's `format=pdf` does NOT return PDF bytes for template reports: the
   * hosting plan forbids a headless browser, so it returns a clean A4 HTML page that
   * opens the browser's print dialog on load ("Save as PDF" from there). Saving that
   * HTML under a `.pdf` name is what produced "Failed to load PDF document".
   *
   * So the response is inspected:
   *   • application/pdf (QuestPDF fallback, no template) → downloaded as a real .pdf
   *   • anything else (the print-ready HTML)             → opened in a new tab, where
   *     the print dialog appears and the operator picks "Save as PDF".
   *
   * The tab is opened synchronously inside the click handler (before the request) so
   * pop-up blockers treat it as user-initiated; it is pointed at the report once ready.
   */
  downloadReportPdf(): void {
    if (!this.selectedPatientTest || !this.selectedTestDetail) return;

    const patientTestId = Number(this.selectedPatientTest.patient_Test_Id);
    const testCode      = this.selectedTestDetail.testCode;

    this.isDownloadingPdf = true;
    this.errorMessage = '';

    const tab = window.open('', '_blank');
    if (tab) {
      tab.document.title = 'Preparing report…';
      tab.document.body.innerHTML =
        '<p style="font:15px system-ui,sans-serif;color:#475569;text-align:center;margin-top:20vh">' +
        'Preparing your report…</p>';
    }

    this.testReportGenerationService
      .downloadTestReport(patientTestId, testCode, this.pathBranch || undefined)
      .subscribe({
        next: (blob: Blob) => {
          this.isDownloadingPdf = false;

          if (!blob || blob.size === 0) {
            tab?.close();
            this.toastr.warning('Report generated but no file was returned.', 'Warning');
            return;
          }

          // ── Real PDF (QuestPDF fallback) → save to disk ────────────────────
          if ((blob.type || '').toLowerCase().includes('application/pdf')) {
            tab?.close();
            const safeName = (this.patientName || 'Report').replace(/\s+/g, '_');
            const url    = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href     = url;
            anchor.download = `${safeName}_${testCode}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            return;
          }

          // ── Print-ready HTML → open it; its print dialog offers "Save as PDF" ─
          const htmlBlob = new Blob([blob], { type: 'text/html;charset=utf-8' });
          const url = URL.createObjectURL(htmlBlob);
          if (tab && !tab.closed) {
            tab.location.href = url;
            tab.focus();
          } else if (!window.open(url, '_blank')) {
            this.toastr.warning(
              'Pop-up was blocked. Please allow pop-ups for this site to save the report as PDF.',
              'Pop-up blocked'
            );
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: (err: unknown) => {
          tab?.close();
          this.isDownloadingPdf = false;
          this.errorMessage = 'Failed to prepare the PDF. Please try again.';
          console.error('downloadReportPdf error:', err);
        }
      });
  }

  // ── WhatsApp ───────────────────────────────────────────────────────────

  /**
   * WhatsApp chat number for the patient in international form without "+"
   * (e.g. "919876543210"), or null when there is no usable number.
   * Bare 10-digit numbers are treated as Indian mobiles.
   */
  get patientWhatsAppNumber(): string | null {
    const raw = (this.patientContact || '').trim();
    if (!raw) return null;
    const hasCountryCode = raw.startsWith('+') || raw.startsWith('00');
    let digits = raw.replace(/\D/g, '');
    if (raw.startsWith('00')) digits = digits.slice(2);
    if (!hasCountryCode) {
      digits = digits.replace(/^0+/, '');
      if (digits.length === 10) return '91' + digits;
      if (digits.length === 12 && digits.startsWith('91')) return digits;
      return null;
    }
    return digits.length >= 11 && digits.length <= 15 ? digits : null;
  }

  /**
   * Sends the booking's Smart Health Report on WhatsApp as a link.
   *
   * Same flow as {@link sendReportOnWhatsApp}: the WhatsApp tab is opened inside
   * the click (so pop-up blockers allow it), the backend issues the signed short
   * link, then the tab is pointed at the patient's chat with the message filled
   * in. The operator presses send. The patient's link opens a verification page
   * (name masked) with a button to the full Smart Report — no login needed.
   */
  sendSmartReportOnWhatsApp(test: patientTest, event?: Event): void {
    event?.stopPropagation();

    const phone = this.patientWhatsAppNumber;
    if (!phone) {
      this.toastr.warning(
        'This patient has no valid mobile number. Add one in the patient details and try again.',
        'WhatsApp');
      return;
    }

    const waWindow = window.open('', '_blank');
    if (!waWindow) {
      this.toastr.warning('The WhatsApp window was blocked. Allow pop-ups for this site and try again.',
        'WhatsApp');
      return;
    }
    waWindow.opener = null;
    waWindow.document.title = 'Opening WhatsApp…';
    waWindow.document.body.innerHTML =
      '<p style="font-family:sans-serif;padding:2em;color:#555">Preparing the health report link, then opening WhatsApp…</p>';

    this.sendingSmartWhatsAppFor = test.patient_Test_Id;

    this.testReportGenerationService
      .getSmartReportShareLink(Number(test.patient_Test_Id))
      .subscribe({
        next: (link) => {
          this.sendingSmartWhatsAppFor = null;

          if (!link?.url) {
            waWindow.close();
            this.toastr.error('The health report link could not be created.', 'WhatsApp');
            return;
          }

          // Nothing but a line break after the link, so WhatsApp's link detection
          // never folds trailing punctuation into it.
          const greeting = this.patientName ? `Dear ${this.patientName},` : 'Dear Patient,';
          const message  = `${greeting}\n\n`
                         + `Your Health Insights report is ready. It explains your test results in simple words, `
                         + `with your health score and a personal action plan.\n\n`
                         + `👉 View your report: ${link.url}\n\n`
                         + `Report No: ${link.reportNumber}\n`
                         + `Please discuss your results with your doctor.\n`
                         + `Thank you.`;

          waWindow.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        },
        error: (err: any) => {
          this.sendingSmartWhatsAppFor = null;
          waWindow.close();
          this.toastr.error(err?.error?.error || 'The health report link could not be created. Please try again.',
            'WhatsApp');
          console.error('sendSmartReportOnWhatsApp error:', err);
        }
      });
  }

  /**
   * Sends the current report on WhatsApp as a link.
   *
   * Asks the backend for the report's patient link (the same verified URL the
   * printed QR carries), then opens the patient's WhatsApp chat with a message
   * containing it. The operator only presses send; the patient taps the link to
   * see the verified report and open the full copy. No file changes hands.
   *
   * The WhatsApp tab is opened synchronously inside the click, before the API
   * call, so pop-up blockers do not stop it; it is pointed at the chat once the
   * link arrives, or closed if it cannot be created.
   */
  sendReportOnWhatsApp(): void {
    if (!this.selectedPatientTest || !this.selectedTestDetail) return;

    const phone = this.patientWhatsAppNumber;
    if (!phone) {
      this.toastr.warning(
        'This patient has no valid mobile number. Add one in the patient details and try again.',
        'WhatsApp');
      return;
    }

    const patientTestId = Number(this.selectedPatientTest.patient_Test_Id);
    const testCode      = this.selectedTestDetail.testCode;
    const testName      = this.selectedTestDetail.testName || testCode;

    const waWindow = window.open('', '_blank');
    if (!waWindow) {
      this.toastr.warning('The WhatsApp window was blocked. Allow pop-ups for this site and try again.',
        'WhatsApp');
      return;
    }
    waWindow.opener = null; // WhatsApp page must not be able to reach back into the app
    waWindow.document.title = 'Opening WhatsApp…';
    waWindow.document.body.innerHTML =
      '<p style="font-family:sans-serif;padding:2em;color:#555">Preparing the report link, then opening WhatsApp…</p>';

    this.isSendingWhatsApp = true;

    this.testReportGenerationService
      .getReportShareLink(patientTestId, testCode)
      .subscribe({
        next: (link) => {
          this.isSendingWhatsApp = false;

          if (!link?.url) {
            waWindow.close();
            this.toastr.error('The report link could not be created.', 'WhatsApp');
            return;
          }

          // Nothing but a line break after the link, so WhatsApp's link detection
          // never folds trailing punctuation into it.
          const greeting = this.patientName ? `Dear ${this.patientName},` : 'Dear Patient,';
          const message  = `${greeting}\n\n`
                         + `Your ${testName} test report is ready.\n\n`
                         + `👉 View your report: ${link.url}\n\n`
                         + `Report No: ${link.reportNumber}\n`
                         + `Thank you.`;

          waWindow.location.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        },
        error: (err: any) => {
          this.isSendingWhatsApp = false;
          waWindow.close();
          this.toastr.error(err?.error?.error || 'The report link could not be created. Please try again.',
            'WhatsApp');
          console.error('sendReportOnWhatsApp error:', err);
        }
      });
  }

  /** Numeric "low-high" normal range → flag for an out-of-range result, else ''. */
  resultFlag(param: testParameter): 'H' | 'L' | '' {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(param?.parameterRange ?? '');
    const raw = (param?.resultValue ?? '').toString().trim();
    if (!m || raw === '' || isNaN(Number(raw))) return '';
    const v = Number(raw), lo = Number(m[1]), hi = Number(m[2]);
    if (v > hi) return 'H';
    if (v < lo) return 'L';
    return '';
  }

  /** Parameters whose result has been saved to the server. */
  get savedResultCount(): number {
    return this.testParameters.length - this.missingResultCount;
  }

  /**
   * Opens a backend-generated HTML report in a new browser tab via a short-lived Blob URL.
   *
   * The backend already embeds all CSS and patient data into the HTML, so no
   * additional injection is required. A <title> is stitched in only when absent.
   *
   * @param htmlContent Full standalone HTML document returned by the backend.
   * @param _cssStyles  Ignored — kept for signature compatibility only.
   * @param tabTitle    Browser-tab title to inject if the document lacks one.
   */
  private openHtmlReportTab(htmlContent: string, _cssStyles: string | undefined, tabTitle: string): void {
    let html = htmlContent;

    // ── Inject <title> if absent ─────────────────────────────────────────────
    if (!html.includes('<title>')) {
      html = html.replace(/<head>/i, `<head><title>${tabTitle}</title>`);
    }

    // ── Open in new tab via Blob URL ─────────────────────────────────────────
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const tab  = window.open(url, '_blank');
    if (tab) {
      tab.focus();
    } else {
      this.toastr.warning(
        'Pop-up was blocked. Please allow pop-ups for this site to view the report.',
        'Pop-up blocked'
      );
    }
    // Release the object URL after the browser has had time to load the page
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  closePDFWindow(): void {
    if (this.pdfWindow) {
      this.pdfWindow.close();
      this.pdfWindow = null;
    }
    this.pdfDoc = null;
  }

  // ── Cancel Booking ─────────────────────────────────────────────────────

  showCancelModal    = false;
  cancelTest: patientTest | null = null;   // the single booking being cancelled
  loadingCancelModal = false;
  /** testCode → testDetail (price) for the booking being cancelled. */
  testDetailMap: Map<string, testDetail> = new Map();
  @ViewChild('cancelModal') cancelModalRef?: CancelBookingModalComponent;

  /** Returns true when a booking is already cancelled. */
  isCancelled(test: patientTest): boolean {
    return (test.booking_Status || '').toLowerCase() === 'cancelled';
  }

  openCancelModal(test: patientTest, event: Event): void {
    event.stopPropagation();
    this.cancelTest = test;

    if (!test.test_Id) {
      // No test codes — open immediately with empty price map
      this.testDetailMap      = new Map();
      this.loadingCancelModal = false;
      this.showCancelModal    = true;
      return;
    }

    // Fetch prices only for this single booking's test codes
    this.loadingCancelModal = true;
    this.testReportService.getTestDetails(test.test_Id).subscribe({
      next: (details: testDetail[]) => {
        const map = new Map<string, testDetail>();
        details.forEach(d => map.set(d.testCode, d));
        this.testDetailMap      = map;
        this.loadingCancelModal = false;
        this.showCancelModal    = true;
      },
      error: () => {
        // Open modal without prices — modal falls back to proportional split
        this.testDetailMap      = new Map();
        this.loadingCancelModal = false;
        this.showCancelModal    = true;
      }
    });
  }

  onCancelConfirmed(payload: CancelConfirmPayload): void {
    const { bookingCancels, reason } = payload;

    // ── Step 1: Cancel or partially remove test codes per booking ─────────
    // Full cancel  → all test codes in the booking are selected → use CancelTest
    // Partial remove → only some codes selected → use RemoveTests (keeps booking active)
    //
    // Decided up front rather than inside the request map, so the success toast
    // can say which of the two actually happened.
    const decisions = bookingCancels.map(item => {
      const totalCodesInBooking = (item.booking.test_Id || '')
        .split(',').map(c => c.trim()).filter(Boolean).length;
      return {
        item,
        isFullCancel: item.selectedCodes.length >= totalCodesInBooking
      };
    });

    const fullCancelCount = decisions.filter(d => d.isFullCancel).length;
    const removedTestCount = decisions
      .filter(d => !d.isFullCancel)
      .reduce((sum, d) => sum + d.item.selectedCodes.length, 0);

    const cancelCalls = decisions.map(({ item, isFullCancel }) =>
      isFullCancel
        ? this.patientService.cancelPatientTest(Number(item.booking.patient_Test_Id), reason ?? undefined)
        : this.patientService.removeTestCodes(Number(item.booking.patient_Test_Id), item.selectedCodes, reason ?? undefined)
    );

    forkJoinRxjs(cancelCalls).subscribe({
      next: () => {
        this.showCancelModal = false;
        this.cancelTest      = null;

        // ── Step 2: Issue proportional refunds for bookings with payments ──
        const refundItems = bookingCancels.filter(
          item => item.refundAmount > 0 && (item.booking.bill_Reciept?.receipt_Id ?? 0) > 0
        );

        if (refundItems.length === 0) {
          this.toastr.success(
            this.buildCancelSuccessMessage(fullCancelCount, removedTestCount),
            'Success'
          );
          this.refreshAfterCancellation();
          return;
        }

        const totalRefund = refundItems.reduce((sum, item) => sum + item.refundAmount, 0);

        const refundCalls = refundItems.map(item =>
          this.receiptService.refundReceipt(
            item.booking.bill_Reciept.receipt_Id,
            item.refundAmount,
            reason ?? undefined
          )
        );

        forkJoinRxjs(refundCalls).subscribe({
          next: () => {
            this.toastr.success(
              `${this.buildCancelSuccessMessage(fullCancelCount, removedTestCount)} ` +
              `Refund of ₹${totalRefund.toFixed(2)} issued.`,
              'Success'
            );
            this.refreshAfterCancellation();
          },
          error: () => {
            this.toastr.warning(
              'Booking(s) cancelled but refund failed. Please retry from the Receipts page.',
              'Partial Success'
            );
            this.refreshAfterCancellation();
          }
        });
      },
      error: (err: Error) => {
        this.cancelModalRef?.setError(err.message || 'Failed to cancel. Please try again.');
      }
    });
  }

  /**
   * Wording for the post-cancellation success toast.
   *
   * A confirm can do both things at once: cancel some bookings outright and
   * strip individual test codes from others, so both halves are reported.
   */
  private buildCancelSuccessMessage(fullCancelCount: number, removedTestCount: number): string {
    const parts: string[] = [];

    if (fullCancelCount > 0) {
      parts.push(`${fullCancelCount} booking${fullCancelCount === 1 ? '' : 's'} cancelled`);
    }
    if (removedTestCount > 0) {
      parts.push(`${removedTestCount} test${removedTestCount === 1 ? '' : 's'} removed`);
    }

    return parts.length ? `${parts.join(' and ')} successfully.` : 'Cancellation completed successfully.';
  }

  /**
   * Refreshes the list after a booking cancellation.
   *
   * The patient's status is NOT pushed to the server here. It is derived
   * server-side on every read (PatientService.ComputeTestStatus), which already
   * excludes cancelled bookings — there is no stored status column to update and
   * no api/Patient/UpdatePatientStatus endpoint. The call that used to live here
   * 404'd on every successful cancellation, and the global ErrorInterceptor
   * surfaced it as "The requested resource was not found." on top of a
   * cancellation that had in fact succeeded.
   *
   * Reloading the tests is enough: the next read of the patient returns the
   * recomputed status.
   */
  private refreshAfterCancellation(): void {
    // Reload patient tests to get updated data
    this.testReportService.getAllPatientTests(this.patientId).subscribe({
      next: (updatedTests: patientTest[]) => {
        this.allPatientTests = updatedTests;
        this.filterTests();
      },
      error: (error) => {
        console.error('Failed to reload patient tests:', error);
        this.loadPatientTests();
      }
    });
  }

  onCancelDismissed(): void {
    this.showCancelModal = false;
    this.cancelTest      = null;
  }
}
