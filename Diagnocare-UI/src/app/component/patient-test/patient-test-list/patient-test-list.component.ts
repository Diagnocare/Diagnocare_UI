import { Component, OnInit, ViewChild } from '@angular/core';
import { forkJoin, of } from 'rxjs';
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
import { RefundModalComponent } from 'src/app/shared/refund-modal/refund-modal.component';
import { PatientService } from 'src/app/services/patientServices/patient.service';
import { ReceiptService } from 'src/app/services/receiptServices/receipt.service';
import { forkJoin as forkJoinRxjs } from 'rxjs';
import {
  calculatePatientStatus,
  hasPendingTests,
  resolvePaymentStatus,
  getPaymentBadgeLabel as paymentBadgeLabel,
  getPaymentStatusClass as paymentStatusClass
} from 'src/app/utilities/patient-status.util';

@Component({
  selector: 'app-patient-test-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PaymentModalComponent, AddTestModalComponent, CancelBookingModalComponent],
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

  activeCardIndex: number = 0;
  activeDetailIndex: number = 0;
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

  showPatientIdInput: boolean = false;
  enteredPatientId: string = '';
  private navigatedViaQueryParam: boolean = false;

  // ── Filter state ───────────────────────────────────────────────────────
  /** When true the full history is shown; false = only last 15 days / pending reports. */
  showAllTests: boolean = false;
  readonly RECENT_DAYS = 15;


  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private testReportService: TestReportService,
    private testReportGenerationService: TestReportGenerationServices,
    private pathologyService: PathologyService,
    private patientService: PatientService,
    private receiptService: ReceiptService,
    private location: Location,
    private toastr: ToastrService
  ) {}

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

  loadPatientTests(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.testReportService.getAllPatientTests(this.patientId).subscribe({
      next: (data: patientTest[]) => {
        this.allPatientTests = data;
        this.filterTests();
        this.isLoading = false;
      },
      error: (error: Error) => {
        this.errorMessage = 'Failed to load patient tests. Please try again.';
        this.isLoading = false;
        console.error('Error loading patient tests:', error);
      }
    });
  }

  refreshList(): void {
    this.loadPatientTests();
  }

  // ── Filtering ──────────────────────────────────────────────────────────

  /**
   * Applies the current filter mode to `allPatientTests` and writes the
   * result into `patientTests` (which drives the template).
   *
   * Default filter keeps only:
   *  • Tests registered in the last `RECENT_DAYS` days, OR
   *  • Tests whose report has not yet been generated.
   *
   * When `showAllTests` is true the entire history is shown.
   */
  private filterTests(): void {
    let filtered: patientTest[];

    if (this.showAllTests) {
      filtered = [...this.allPatientTests];
    } else {
      // Default view shows only outstanding work: Pending / Partial reports
      // (plus just-cancelled bookings so their settled payment status is visible).
      // Completed reports are hidden here and reached via the "All Reports" toggle.
      filtered = this.allPatientTests.filter(test => {
        const status = (test.is_Report_Generated || 'Pending').trim();
        return status !== 'Completed';
      });
    }

    this.patientTests = this.sortTests(filtered);
  }

  /**
   * Sort order:
   *  1. Report status — Pending first, then Partial, Completed, Cancelled
   *  2. Within the same status — descending by patient_Test_Id (higher id = more recent)
   */
  private sortTests(tests: patientTest[]): patientTest[] {
    const statusRank = (t: patientTest): number => {
      if (this.isCancelled(t))                                        return 3;
      switch ((t.is_Report_Generated || 'Pending').trim()) {
        case 'Pending':   return 0;
        case 'Partial':   return 1;
        case 'Completed': return 2;
        default:          return 2;
      }
    };

    return [...tests].sort((a, b) => {
      const rankDiff = statusRank(a) - statusRank(b);
      if (rankDiff !== 0) return rankDiff;
      // Same status → most-recently registered first (higher numeric ID = newer)
      return Number(b.patient_Test_Id) - Number(a.patient_Test_Id);
    });
  }

  /** Shows the full history (all tests regardless of age or report status). */
  showOldReports(): void {
    this.showAllTests = true;
    this.filterTests();
    this.activeCardIndex = 0;
  }

  /** Returns to the default "recent + pending" view. */
  showRecentOnly(): void {
    this.showAllTests = false;
    this.filterTests();
    this.activeCardIndex = 0;
  }

  // ── Add Test Modal ─────────────────────────────────────────────────────

  showAddTestModal = false;

  /** Opens the "Add New Test" slide-over modal for the current patient. */
  addNewTest(): void {
    this.showAddTestModal = true;
  }

  onAddTestSaved(): void {
    this.showAddTestModal = false;
    this.toastr.success('Test added successfully.', 'Test Added');
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

  /** True when the full list has tests older than 15 days that are currently hidden. */
  get hasOldTests(): boolean {
    if (this.showAllTests) return false;
    return this.allPatientTests.length > this.patientTests.length;
  }

  /** Count of tests hidden by the recency filter. */
  get oldTestCount(): number {
    return this.allPatientTests.length - this.patientTests.length;
  }

  /** True when there is genuinely no data for this patient at all. */
  get noTestsAtAll(): boolean {
    return !this.isLoading && this.allPatientTests.length === 0;
  }

  /** True when there IS history but nothing passes the recency filter. */
  get noRecentTests(): boolean {
    return (
      !this.isLoading &&
      !this.showAllTests &&
      this.allPatientTests.length > 0 &&
      this.patientTests.length === 0
    );
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

  /** Returns true when a test was registered within the last RECENT_DAYS days. */
  isRecentTest(test: patientTest): boolean {
    if (!test.registration_Date) return false;
    const d = new Date(test.registration_Date);
    if (isNaN(d.getTime())) return false;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.RECENT_DAYS);
    return d >= cutoff;
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
      this.patientTests = [];
      this.patientId = '';
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
    this.toastr.success('Payment recorded successfully.', 'Payment Saved');
    this.loadPatientTests();
  }

  onPaymentCancelled(): void {
    this.showPaymentModal  = false;
    this.activePaymentTest = null;
  }

  // ── Card stack helpers ─────────────────────────────────────────────────

  selectCard(index: number): void { this.activeCardIndex = index; }
  isActiveCard(index: number): boolean { return this.activeCardIndex === index; }
  getCardZIndex(index: number): number {
    if (index === this.activeCardIndex) return this.patientTests.length + 1;
    return this.patientTests.length - Math.abs(index - this.activeCardIndex);
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
    this.activeDetailIndex = 0;
    this.loadTestDetails(test.test_Id);
  }

  loadTestDetails(patientTestId: string): void {
    this.isLoadingDetails = true;
    this.detailErrorMessage = '';
    this.testDetails = [];

    this.testReportService.getTestDetails(patientTestId).subscribe({
      next: (data: testDetail[]) => {
        this.testDetails = data;
        this.isLoadingDetails = false;
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
    this.activeDetailIndex = 0;
  }

  selectDetailCard(index: number): void { this.activeDetailIndex = index; }
  isActiveDetailCard(index: number): boolean { return this.activeDetailIndex === index; }
  getDetailCardZIndex(index: number): number {
    if (index === this.activeDetailIndex) return this.testDetails.length + 1;
    return this.testDetails.length - Math.abs(index - this.activeDetailIndex);
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
      next: () => {
        this.loadPatientTests();
        // Re-read from the server so savedResults (and reportId) reflect what was
        // actually persisted — this is what unlocks the View / PDF buttons.
        this.loadTestParameters();
      },
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
   * Downloads the current report as a real, full-A4 PDF (rendered server-side).
   * Requests the file as a Blob from the backend and saves it via an anchor click.
   */
  downloadReportPdf(): void {
    if (!this.selectedPatientTest || !this.selectedTestDetail) return;

    const patientTestId = Number(this.selectedPatientTest.patient_Test_Id);
    const testCode      = this.selectedTestDetail.testCode;

    this.isDownloadingPdf = true;
    this.errorMessage = '';

    this.testReportGenerationService
      .downloadTestReport(patientTestId, testCode, this.pathBranch || undefined)
      .subscribe({
        next: (blob: Blob) => {
          this.isDownloadingPdf = false;

          if (!blob || blob.size === 0) {
            this.toastr.warning('Report generated but no file was returned.', 'Warning');
            return;
          }

          const safeName = (this.patientName || 'Report').replace(/\s+/g, '_');
          const filename = `${safeName}_${testCode}.pdf`;

          const url    = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href     = url;
          anchor.download = filename;
          document.body.appendChild(anchor);
          anchor.click();
          document.body.removeChild(anchor);
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        },
        error: (err: unknown) => {
          this.isDownloadingPdf = false;
          this.errorMessage = 'Failed to download PDF. Please try again.';
          console.error('downloadReportPdf error:', err);
        }
      });
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
    const { bookingCancels, reason, totalEligibleRefund } = payload;

    // ── Step 1: Cancel or partially remove test codes per booking ─────────
    // Full cancel  → all test codes in the booking are selected → use CancelTest
    // Partial remove → only some codes selected → use RemoveTests (keeps booking active)
    const cancelCalls = bookingCancels.map(item => {
      const totalCodesInBooking = (item.booking.test_Id || '')
        .split(',').map(c => c.trim()).filter(Boolean).length;
      const isFullCancel = item.selectedCodes.length >= totalCodesInBooking;

      return isFullCancel
        ? this.patientService.cancelPatientTest(Number(item.booking.patient_Test_Id), reason ?? undefined)
        : this.patientService.removeTestCodes(Number(item.booking.patient_Test_Id), item.selectedCodes, reason ?? undefined);
    });

    forkJoinRxjs(cancelCalls).subscribe({
      next: () => {
        this.showCancelModal = false;
        this.cancelTest      = null;

        // ── Step 2: Issue proportional refunds for bookings with payments ──
        const refundItems = bookingCancels.filter(
          item => item.refundAmount > 0 && (item.booking.bill_Reciept?.receipt_Id ?? 0) > 0
        );

        if (refundItems.length === 0) {
          const n = bookingCancels.length;
          this.toastr.success(`${n} booking${n > 1 ? 's' : ''} cancelled.`, 'Cancelled');
          this.updatePatientStatusAfterCancellation();
          return;
        }

        const refundCalls = refundItems.map(item =>
          this.receiptService.refundReceipt(
            item.booking.bill_Reciept.receipt_Id,
            item.refundAmount,
            reason ?? undefined
          )
        );

        forkJoinRxjs(refundCalls).subscribe({
          next: () => {
            const n = bookingCancels.length;
            this.toastr.success(
              `${n} booking${n > 1 ? 's' : ''} cancelled. ₹${totalEligibleRefund.toFixed(2)} refunded.`,
              'Cancelled & Refunded'
            );
            this.updatePatientStatusAfterCancellation();
          },
          error: () => {
            this.toastr.warning(
              'Booking(s) cancelled but refund failed. Please retry from the Receipts page.',
              'Partial Success'
            );
            this.updatePatientStatusAfterCancellation();
          }
        });
      },
      error: (err: Error) => {
        this.cancelModalRef?.setError(err.message || 'Failed to cancel. Please try again.');
      }
    });
  }

  /**
   * Updates the patient status after booking cancellation.
   * If there are no pending tests remaining, automatically updates patient status to "Completed".
   * Refreshes the UI without requiring a manual page reload.
   */
  private updatePatientStatusAfterCancellation(): void {
    // Reload patient tests to get updated data
    this.testReportService.getAllPatientTests(this.patientId).subscribe({
      next: (updatedTests: patientTest[]) => {
        this.allPatientTests = updatedTests;

        // Calculate new patient status based on updated tests
        const newStatus = calculatePatientStatus(updatedTests);

        // Only update if there are no pending tests (status should be Completed)
        if (newStatus === 'Completed' && hasPendingTests(updatedTests) === false) {
          this.patientService.updatePatientStatus(this.patientId, newStatus).subscribe({
            next: () => {
              // Status updated successfully
              this.filterTests();
              this.toastr.info('Patient status updated to Completed', 'Status Update');
            },
            error: (err) => {
              // Log error but continue (status update is non-critical)
              console.warn('Failed to update patient status:', err);
              this.filterTests();
            }
          });
        } else {
          // Just refresh the view without updating status
          this.filterTests();
        }
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
