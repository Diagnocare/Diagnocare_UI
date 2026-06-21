import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef,
  AfterViewInit, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

import { TemplateService } from 'src/app/services/templateServices/template.service';
import { TemplateDetailDTO } from 'src/app/models/template/template-detail.dto';
import { TemplateListDTO } from 'src/app/models/template/template-list.dto';
import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';

/** One entry in the placeholder reference panel. */
interface PlaceholderRef {
  token: string;
  description: string;
  category: string;
}

@Component({
  selector: 'app-report-template-designer',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingSpinnerComponent],
  templateUrl: './report-template-designer.component.html',
  styleUrls: ['./report-template-designer.component.scss'],
})
export class ReportTemplateDesignerComponent implements OnInit, OnDestroy, AfterViewInit {

  // ── ViewChildren ─────────────────────────────────────────────────────────
  @ViewChild('previewFrame') previewFrame!: ElementRef<HTMLIFrameElement>;
  @ViewChild('htmlTextarea')  htmlTextarea!:  ElementRef<HTMLTextAreaElement>;
  @ViewChild('cssTextarea')   cssTextarea!:   ElementRef<HTMLTextAreaElement>;

  // ── Template metadata ────────────────────────────────────────────────────
  templateId: number | null = null;
  templateName  = '';
  description   = '';
  category      = '';

  // ── Editor content ───────────────────────────────────────────────────────
  htmlBody   = this.defaultHtmlBody();
  cssStyles  = this.defaultCssStyles();

  // ── UI state ─────────────────────────────────────────────────────────────
  activeTab: 'html' | 'css' = 'html';
  isLoading    = false;
  isSaving     = false;
  isSaved      = false;
  isDirty      = false;
  autoPreview  = true;   // toggle: live preview on / off

  /** List of existing templates to load for editing. */
  existingTemplates: TemplateListDTO[] = [];
  loadingTemplates  = false;
  selectedLoadId: number | null = null;

  showPlaceholders = false;

  /** Available {{PLACEHOLDER}} tokens and their meaning. */
  readonly placeholders: PlaceholderRef[] = [
    // Pathology
    { category: 'Pathology', token: '{{PATHOLOGY_NAME}}',        description: 'Lab / pathology centre name' },
    { category: 'Pathology', token: '{{PATHOLOGY_BRANCH}}',      description: 'Branch name' },
    { category: 'Pathology', token: '{{PATHOLOGY_ADDRESS}}',     description: 'Full address line' },
    { category: 'Pathology', token: '{{PATHOLOGY_CONTACT}}',     description: 'Phone number' },
    { category: 'Pathology', token: '{{PATHOLOGY_EMAIL}}',       description: 'Email address' },
    { category: 'Pathology', token: '{{PATHOLOGY_LOGO}}',        description: '<img> tag with base-64 logo' },
    // Patient
    { category: 'Patient',   token: '{{PATIENT_NAME}}',          description: 'Full name with salutation' },
    { category: 'Patient',   token: '{{PATIENT_ID}}',            description: 'Patient registration ID' },
    { category: 'Patient',   token: '{{PATIENT_AGE}}',           description: 'Age (years)' },
    { category: 'Patient',   token: '{{PATIENT_GENDER}}',        description: 'Gender' },
    { category: 'Patient',   token: '{{PATIENT_CONTACT}}',       description: 'Mobile / phone number' },
    { category: 'Patient',   token: '{{REGISTRATION_DATE}}',     description: 'Registration date (DD-MM-YYYY)' },
    { category: 'Patient',   token: '{{REPORT_DATE}}',           description: 'Report generation date' },
    // Test
    { category: 'Test',      token: '{{TEST_CODE}}',             description: 'Short test code, e.g. CBC' },
    { category: 'Test',      token: '{{TEST_NAME}}',             description: 'Full test name' },
    { category: 'Test',      token: '{{TEST_PARAMETERS_TABLE}}', description: 'Auto-generated HTML table of parameters + results' },
    // Doctor
    { category: 'Doctor',    token: '{{DOCTOR_NAME}}',           description: 'Reporting doctor name' },
    { category: 'Doctor',    token: '{{DOCTOR_QUALIFICATION}}',  description: 'Qualifications, e.g. MBBS, MD' },
    { category: 'Doctor',    token: '{{DOCTOR_SIGNATURE}}',      description: '<img> tag with doctor signature' },
    // CSS
    { category: 'CSS',       token: '{{CSS_STYLES}}',            description: 'Injected CSS — must appear inside a <style> tag in <head>' },
  ];

  /** Unique categories for the placeholder panel headers. */
  get placeholderCategories(): string[] {
    return [...new Set(this.placeholders.map(p => p.category))];
  }
  placeholdersByCategory(cat: string): PlaceholderRef[] {
    return this.placeholders.filter(p => p.category === cat);
  }

  // ── Subjects ─────────────────────────────────────────────────────────────
  private destroy$       = new Subject<void>();
  /**
   * Emitted every time HTML or CSS content changes.
   * Piped through debounceTime so the iframe only updates 800 ms after
   * the user stops typing — not on every keystroke.
   */
  private previewRefresh$ = new Subject<void>();

  constructor(
    private templateService: TemplateService,
    private route: ActivatedRoute,
    private router: Router,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Auto-preview pipe: debounce 800 ms after last content change
    this.previewRefresh$
      .pipe(debounceTime(800), takeUntil(this.destroy$))
      .subscribe(() => this.refreshPreview());

    // Check if editing an existing template (route: /template-designer/:id)
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadTemplateForEditing(Number(id));
      }
    });

    // Load dropdown of existing templates
    this.loadExistingTemplates();
  }

  ngAfterViewInit(): void {
    // Initial render after view is ready
    setTimeout(() => this.refreshPreview(), 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  loadExistingTemplates(): void {
    this.loadingTemplates = true;
    this.templateService.getTemplates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (list) => { this.existingTemplates = list; this.loadingTemplates = false; },
        error: ()    => { this.loadingTemplates = false; }
      });
  }

  onLoadSelected(): void {
    if (!this.selectedLoadId) return;
    this.loadTemplateForEditing(this.selectedLoadId);
  }

  loadTemplateForEditing(id: number): void {
    this.isLoading = true;
    this.templateService.getTemplateById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (detail: TemplateDetailDTO) => {
          this.templateId   = detail.templateId;
          this.templateName = detail.templateName;
          this.description  = detail.description  || '';
          this.category     = detail.category     || '';
          this.htmlBody     = detail.htmlBody;
          this.cssStyles    = detail.cssStyles;
          this.isLoading    = false;
          this.isDirty      = false;
          setTimeout(() => this.refreshPreview(), 0);
          this.toastr.success(`Loaded: ${detail.templateName}`, 'Template Loaded');
        },
        error: () => {
          this.isLoading = false;
          this.toastr.error('Failed to load template.', 'Error');
        }
      });
  }

  // ── Editing helpers ──────────────────────────────────────────────────────

  onContentChange(): void {
    this.isDirty = true;
    this.isSaved = false;
    if (this.autoPreview) {
      this.previewRefresh$.next();   // triggers debounced auto-refresh
    }
  }

  /**
   * Inserts a placeholder token at the current cursor position of the
   * active textarea (htmlTextarea or cssTextarea).
   * Falls back to appending at the end if the ref is unavailable.
   */
  insertPlaceholder(token: string): void {
    const ref = this.activeTab === 'html' ? this.htmlTextarea : this.cssTextarea;
    const field: 'htmlBody' | 'cssStyles' =
      this.activeTab === 'html' ? 'htmlBody' : 'cssStyles';

    if (ref?.nativeElement) {
      const el    = ref.nativeElement;
      const start = el.selectionStart ?? el.value.length;
      const end   = el.selectionEnd   ?? el.value.length;
      const before = el.value.substring(0, start);
      const after  = el.value.substring(end);
      (this as any)[field] = before + token + after;
      // Restore cursor position after Angular updates the textarea value
      setTimeout(() => {
        el.selectionStart = el.selectionEnd = start + token.length;
        el.focus();
      }, 0);
    } else {
      (this as any)[field] += token;
    }

    this.onContentChange();
  }

  /**
   * Builds the full HTML document to render inside the preview iframe.
   *
   * Three injection strategies (tried in order):
   *  1. `{{CSS_STYLES}}` token present → replace it (standard path).
   *  2. Token absent but `</head>` present → inject a `<style>` block
   *     immediately before `</head>`.
   *  3. Bare HTML fragment with no `<head>` at all → wrap in a minimal
   *     full document that includes the CSS in a `<style>` tag.
   *
   * This ensures CSS is **always** applied regardless of whether the
   * designer remembers to include the token.
   */
  private buildPreviewDoc(): string {
    const CSS_TOKEN = '{{CSS_STYLES}}';
    const styleBlock = `<style>\n${this.cssStyles}\n</style>`;

    // Strategy 1: token present
    if (this.htmlBody.includes(CSS_TOKEN)) {
      return this.htmlBody.replace(CSS_TOKEN, this.cssStyles);
    }

    // Strategy 2: full HTML doc without token — inject before </head>
    if (/<\/head>/i.test(this.htmlBody)) {
      return this.htmlBody.replace(/<\/head>/i, `${styleBlock}\n</head>`);
    }

    // Strategy 3: bare fragment — wrap in minimal document
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${styleBlock}
</head>
<body>
${this.htmlBody}
</body>
</html>`;
  }

  refreshPreview(): void {
    if (!this.previewFrame?.nativeElement) return;
    this.previewFrame.nativeElement.srcdoc = this.buildPreviewDoc();
  }

  // ── Persist ──────────────────────────────────────────────────────────────

  save(): void {
    if (!this.templateName.trim()) {
      this.toastr.warning('Please enter a template name before saving.', 'Required');
      return;
    }

    this.isSaving = true;

    const payload = {
      templateName: this.templateName.trim(),
      description:  this.description.trim(),
      category:     this.category.trim(),
      htmlBody:     this.htmlBody,
      cssStyles:    this.cssStyles,
    };

    const request$ = this.templateId
      ? this.templateService.updateTemplate({ templateId: this.templateId, ...payload })
      : this.templateService.saveTemplate(payload);

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (saved) => {
        this.isSaving   = false;
        this.isSaved    = true;
        this.isDirty    = false;
        this.templateId = saved.templateId;
        this.toastr.success(
          `Template "${saved.templateName}" saved successfully.`,
          this.templateId ? 'Updated' : 'Created'
        );
        this.loadExistingTemplates();
      },
      error: () => {
        this.isSaving = false;
        this.toastr.error('Failed to save template. Please try again.', 'Error');
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/template']);
  }

  // ── Defaults ─────────────────────────────────────────────────────────────

  private defaultHtmlBody(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{TEST_NAME}} Report</title>
  <style>
    {{CSS_STYLES}}
  </style>
</head>
<body>
  <div class="report-wrapper">

    <!-- Header -->
    <div class="report-header">
      <div class="lab-logo">{{PATHOLOGY_LOGO}}</div>
      <div class="lab-info">
        <h1 class="lab-name">{{PATHOLOGY_NAME}}</h1>
        <p class="lab-branch">{{PATHOLOGY_BRANCH}}</p>
        <p class="lab-address">{{PATHOLOGY_ADDRESS}}</p>
        <p class="lab-contact">&#128222; {{PATHOLOGY_CONTACT}} &nbsp;|&nbsp; &#9993; {{PATHOLOGY_EMAIL}}</p>
      </div>
    </div>
    <hr class="divider" />

    <!-- Patient Info -->
    <div class="patient-section">
      <div class="patient-row">
        <span class="label">Patient Name:</span>
        <span class="value">{{PATIENT_NAME}}</span>
        <span class="label">Patient ID:</span>
        <span class="value">{{PATIENT_ID}}</span>
      </div>
      <div class="patient-row">
        <span class="label">Age:</span>
        <span class="value">{{PATIENT_AGE}}</span>
        <span class="label">Gender:</span>
        <span class="value">{{PATIENT_GENDER}}</span>
      </div>
      <div class="patient-row">
        <span class="label">Registration Date:</span>
        <span class="value">{{REGISTRATION_DATE}}</span>
        <span class="label">Report Date:</span>
        <span class="value">{{REPORT_DATE}}</span>
      </div>
    </div>
    <hr class="divider" />

    <!-- Test Info -->
    <div class="test-title">
      <h2>{{TEST_NAME}} <span class="test-code">({{TEST_CODE}})</span></h2>
    </div>

    <!-- Parameters Table -->
    <div class="params-section">
      {{TEST_PARAMETERS_TABLE}}
    </div>

    <!-- Footer / Signature -->
    <div class="report-footer">
      <div class="signature-block">
        <div class="sig-image">{{DOCTOR_SIGNATURE}}</div>
        <p class="doctor-name">{{DOCTOR_NAME}}</p>
        <p class="doctor-qual">{{DOCTOR_QUALIFICATION}}</p>
        <p class="sig-label">Reporting Doctor</p>
      </div>
    </div>

  </div>
</body>
</html>`;
  }

  private defaultCssStyles(): string {
    return `/* ── Global Reset ──────────────────────────────────── */
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; }

/* ── Wrapper ────────────────────────────────────────── */
.report-wrapper { max-width: 800px; margin: 0 auto; padding: 24px; }

/* ── Header ─────────────────────────────────────────── */
.report-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
.lab-logo img  { width: 72px; height: 72px; object-fit: contain; }
.lab-name      { font-size: 1.4em; font-weight: 700; color: #1d4ed8; }
.lab-branch    { font-size: 0.95em; font-weight: 600; color: #374151; }
.lab-address, .lab-contact { font-size: 0.82em; color: #6b7280; margin-top: 2px; }

/* ── Divider ─────────────────────────────────────────── */
.divider { border: none; border-top: 2px solid #1d4ed8; margin: 10px 0; }

/* ── Patient section ─────────────────────────────────── */
.patient-section { margin: 12px 0; }
.patient-row { display: flex; gap: 8px; margin-bottom: 4px; }
.label { font-weight: 600; min-width: 130px; color: #374151; }
.value { color: #1e293b; flex: 1; }

/* ── Test title ──────────────────────────────────────── */
.test-title { margin: 14px 0 8px; }
.test-title h2 { font-size: 1.1em; font-weight: 700; color: #1d4ed8; }
.test-code { font-size: 0.85em; color: #6b7280; }

/* ── Parameters table ────────────────────────────────── */
.params-section table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.params-section th { background: #eff6ff; color: #1d4ed8; font-weight: 600;
  padding: 8px 10px; border: 1px solid #bfdbfe; text-align: left; font-size: 0.85em; }
.params-section td { padding: 7px 10px; border: 1px solid #e2e8f0; font-size: 0.85em; }
.params-section tr:nth-child(even) td { background: #f8fafc; }
.out-of-range { color: #dc2626; font-weight: 700; }

/* ── Footer / Signature ──────────────────────────────── */
.report-footer { margin-top: 32px; display: flex; justify-content: flex-end; }
.signature-block { text-align: center; }
.sig-image img  { width: 80px; height: 40px; object-fit: contain; margin-bottom: 4px; }
.doctor-name    { font-weight: 700; font-size: 0.9em; }
.doctor-qual    { font-size: 0.78em; color: #6b7280; }
.sig-label      { font-size: 0.75em; color: #94a3b8; margin-top: 2px; }`;
  }
}
