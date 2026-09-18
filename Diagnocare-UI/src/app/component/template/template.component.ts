import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, forkJoin, of } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';

import { LoadingSpinnerComponent } from 'src/app/shared/loading-spinner/loading-spinner.component';
import { TemplateService } from 'src/app/services/templateServices/template.service';
import { TemplateListDTO } from 'src/app/models/template/template-list.dto';
import { TemplateDetailDTO } from 'src/app/models/template/template-detail.dto';

export type DownloadFormat = 'pdf' | 'docx';

// ── CDN libraries (loaded on demand, not bundled) ────────────────────────────
const CDN_HTML2CANVAS = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const CDN_JSPDF       = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const CDN_JSZIP       = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

// ── A4 page constants ────────────────────────────────────────────────────────
const A4_W_PX   = 794;        // A4 width  in CSS pixels at 96 dpi
const A4_H_PX   = 1123;       // A4 height in CSS pixels at 96 dpi
const RENDER_SCALE = 2;       // html2canvas oversampling (retina quality)
const A4_W_EMU  = 7_560_000;  // 210 mm in EMU  (OOXML image extent)
const A4_H_EMU  = 10_692_000; // 297 mm in EMU
const A4_W_TWIP = 11_906;     // 210 mm in twips (Word page size)
const A4_H_TWIP = 16_838;     // 297 mm in twips

@Component({
  selector: 'app-template',
  templateUrl: './template.component.html',
  styleUrls: ['./template.component.scss'],
  standalone: true,
  imports: [CommonModule, LoadingSpinnerComponent]
})
export class TemplateComponent implements OnInit, OnDestroy {

  // ── Gallery ──────────────────────────────────────────────────────────────
  templates: TemplateListDTO[] = [];
  isLoading      = false;
  spinnerMessage = 'Loading Templates...';
  hoveredTemplateId: number | null = null;

  // ── Pathology default template ────────────────────────────────────────────
  defaultTemplateId: number | null = null;
  defaultLoaded     = false;   // true once the active-template call has resolved
  isSettingDefault  = false;

  get hasNoDefault(): boolean {
    return this.defaultLoaded && !this.isLoading && this.defaultTemplateId === null && this.templates.length > 0;
  }

  // ── Preview modal ────────────────────────────────────────────────────────
  showPreview    = false;
  previewLoading = false;
  previewTitle   = '';
  previewSrcdoc: SafeHtml | null = null;
  activeDetail:  TemplateDetailDTO | null = null;

  // ── Download progress ────────────────────────────────────────────────────
  isDownloading   = false;
  downloadMessage = '';

  // ── Internal ─────────────────────────────────────────────────────────────
  private detailCache = new Map<number, TemplateDetailDTO>();
  private scriptCache = new Set<string>();
  private destroy$    = new Subject<void>();

  constructor(
    private templateService: TemplateService,
    private sanitizer: DomSanitizer,
    private toastr: ToastrService
  ) {}

  ngOnInit(): void {
    this.loadTemplates();
  }

  // ── Data ─────────────────────────────────────────────────────────────────

  /**
   * Loads templates and the active (default) template in parallel via forkJoin
   * so the default badge is guaranteed to be visible on first render.
   */
  loadTemplates(): void {
    this.spinnerMessage = 'Loading Templates...';
    this.isLoading      = true;
    this.defaultLoaded  = false;

    forkJoin({
      templates: this.templateService.getTemplates(),
      // 404 = no default assigned yet — treat as null, don't fail the whole join
      active: this.templateService.getPathologyDefault().pipe(
        catchError(() => of({ templateId: null }))
      ),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ templates, active }) => {
          this.templates = (Array.isArray(templates) ? templates : []).map(t => ({
            ...t, format: (t.format as any) || 'pdf',
          }));
          this.defaultTemplateId = active?.templateId ?? null;
          this.defaultLoaded     = true;
          this.isLoading         = false;
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.defaultLoaded = true;
          this.isLoading     = false;
        },
      });
  }

  setAsDefault(template: TemplateListDTO): void {
    if (this.isSettingDefault) return;

    // Toggle: clicking the current default clears it
    const newDefault = this.defaultTemplateId === template.templateId ? null : template.templateId;

    this.isSettingDefault = true;
    this.templateService.setPathologyDefault(newDefault)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.defaultTemplateId = newDefault;
          this.isSettingDefault  = false;
        },
        error: () => {
          // Message shown centrally by ErrorInterceptor.
          this.isSettingDefault = false;
        },
      });
  }

  private fetchDetail(templateId: number): Promise<TemplateDetailDTO> {
    if (this.detailCache.has(templateId)) {
      return Promise.resolve(this.detailCache.get(templateId)!);
    }
    return new Promise((resolve, reject) => {
      this.templateService.getTemplateById(templateId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: d => { this.detailCache.set(templateId, d); resolve(d); },
          error: reject
        });
    });
  }

  private buildFullHtml(detail: TemplateDetailDTO): string {
    return detail.htmlBody.replace('{{CSS_STYLES}}', detail.cssStyles);
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  openPreview(template: TemplateListDTO): void {
    this.previewTitle   = template.templateName;
    this.previewSrcdoc  = null;
    this.activeDetail   = null;
    this.previewLoading = true;
    this.showPreview    = true;

    this.fetchDetail(template.templateId).then(detail => {
      this.activeDetail  = detail;
      this.previewSrcdoc = this.sanitizer.bypassSecurityTrustHtml(this.buildFullHtml(detail));
      this.previewLoading = false;
    }).catch(() => {
      // Message shown centrally by ErrorInterceptor.
      this.previewLoading = false;
      this.showPreview    = false;
    });
  }

  closePreview(): void {
    this.showPreview   = false;
    this.previewSrcdoc = null;
    this.previewTitle  = '';
    this.activeDetail  = null;
  }

  // ── Download entry points ────────────────────────────────────────────────

  downloadFromModal(format: DownloadFormat): void {
    if (!this.activeDetail || this.isDownloading) return;
    this.triggerDownload(this.activeDetail, format);
  }

  downloadDirect(template: TemplateListDTO, format: DownloadFormat, event: Event): void {
    event.stopPropagation();
    if (this.isDownloading) return;
    this.fetchDetail(template.templateId)
      .then(detail => this.triggerDownload(detail, format))
      .catch(() => { /* HTTP error shown centrally by ErrorInterceptor */ });
  }

  private async triggerDownload(detail: TemplateDetailDTO, format: DownloadFormat): Promise<void> {
    try {
      if (format === 'pdf') {
        await this.downloadAsPdf(detail);
      } else {
        await this.downloadAsDocx(detail);
      }
    } catch (err: any) {
      console.error('[TemplateComponent] download error', err);
      this.toastr.error('Download failed. Please try again.', 'Error');
    } finally {
      this.isDownloading   = false;
      this.downloadMessage = '';
    }
  }

  // ── Shared: render HTML → canvas ─────────────────────────────────────────

  /**
   * Loads html2canvas from CDN, renders the full HTML document in a hidden
   * off-screen iframe at A4 width, and returns the captured canvas.
   * Used by both PDF and DOCX pipelines.
   */
  private async renderHtmlToCanvas(fullHtml: string): Promise<HTMLCanvasElement> {
    await this.loadScript(CDN_HTML2CANVAS);

    return new Promise<HTMLCanvasElement>((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText =
        `position:fixed;left:-9999px;top:0;width:${A4_W_PX}px;height:1px;border:none;overflow:hidden;`;
      document.body.appendChild(iframe);

      const cleanup = () => { try { document.body.removeChild(iframe); } catch (_) {} };

      iframe.onload = () => {
        // Allow fonts and images to settle
        setTimeout(async () => {
          try {
            const h2c   = (window as any).html2canvas;
            if (!h2c) throw new Error('html2canvas not loaded');

            const iDoc  = iframe.contentDocument;
            const docEl = iDoc?.documentElement;
            if (!docEl) throw new Error('Cannot access iframe document');

            // Expand iframe to full content height before capture
            const scrollH = iDoc!.body.scrollHeight;
            iframe.style.height = `${scrollH}px`;

            this.downloadMessage = 'Capturing content…';

            const canvas = await h2c(docEl, {
              scale:        RENDER_SCALE,
              useCORS:      true,
              logging:      false,
              width:        A4_W_PX,
              windowWidth:  A4_W_PX,
              height:       scrollH,
              windowHeight: scrollH,
              backgroundColor: '#ffffff',
            });

            cleanup();
            resolve(canvas);
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 900);
      };

      iframe.onerror = () => { cleanup(); reject(new Error('iframe failed to load')); };
      iframe.srcdoc  = fullHtml;
    });
  }

  /**
   * Slices a full-height canvas into A4-sized page strips.
   * Each strip is padded to a full A4 height (white background) so every
   * page in the output document is the same size.
   */
  private sliceCanvasToA4Pages(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
    const pageW  = canvas.width;                       // A4_W_PX × RENDER_SCALE
    const pageH  = A4_H_PX * RENDER_SCALE;             // one A4 page height at scale
    const pages: HTMLCanvasElement[] = [];

    let srcY = 0;
    while (srcY < canvas.height) {
      const srcH       = Math.min(pageH, canvas.height - srcY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width  = pageW;
      pageCanvas.height = pageH;                       // always full A4 (pad last page)

      const ctx = pageCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageW, pageH);
      ctx.drawImage(canvas, 0, srcY, pageW, srcH, 0, 0, pageW, srcH);

      pages.push(pageCanvas);
      srcY += pageH;
    }

    return pages;
  }

  // ── PDF download ─────────────────────────────────────────────────────────

  private async downloadAsPdf(detail: TemplateDetailDTO): Promise<void> {
    this.isDownloading   = true;
    this.downloadMessage = 'Loading PDF engine…';

    await this.loadScript(CDN_JSPDF);

    this.downloadMessage = 'Rendering template…';
    const canvas = await this.renderHtmlToCanvas(this.buildFullHtml(detail));

    this.downloadMessage = 'Building PDF…';

    const jsPDF   = (window as any).jspdf?.jsPDF;
    if (!jsPDF) throw new Error('jsPDF not loaded');

    const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgW    = pageW;
    const imgH    = (canvas.height / canvas.width) * imgW;

    let yOffset   = 0;
    let remaining = imgH;

    while (remaining > 0) {
      if (yOffset > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -yOffset, imgW, imgH);
      yOffset   += pageH;
      remaining -= pageH;
    }

    pdf.save(`${detail.templateName}.pdf`);
  }

  // ── DOCX download ─────────────────────────────────────────────────────────
  //
  // Strategy: render the HTML exactly as the preview/PDF does (iframe +
  // html2canvas), slice the result into A4-page images, then package them
  // into a proper OOXML .docx ZIP using JSZip.  The Word document contains
  // one full-page PNG image per page — identical visually to the PDF and the
  // in-app preview, no CSS translation required.

  private async downloadAsDocx(detail: TemplateDetailDTO): Promise<void> {
    this.isDownloading   = true;
    this.downloadMessage = 'Loading Word engine…';

    await this.loadScript(CDN_JSZIP);

    this.downloadMessage = 'Rendering template…';
    const canvas = await this.renderHtmlToCanvas(this.buildFullHtml(detail));

    this.downloadMessage = 'Building Word document…';
    const pages  = this.sliceCanvasToA4Pages(canvas);
    const blob   = await this.buildDocxBlob(pages, detail.templateName);

    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href     = url;
    anchor.download = `${detail.templateName}.docx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  // ── OOXML / ZIP helpers ───────────────────────────────────────────────────

  private async buildDocxBlob(pages: HTMLCanvasElement[], name: string): Promise<Blob> {
    const JSZip = (window as any).JSZip;
    if (!JSZip) throw new Error('JSZip not loaded');

    const zip = new JSZip();
    const n   = pages.length;

    zip.file('[Content_Types].xml', this.xmlContentTypes());
    zip.file('_rels/.rels',         this.xmlRootRels());
    zip.file('word/settings.xml',   this.xmlSettings());
    zip.file('word/_rels/document.xml.rels', this.xmlDocumentRels(n));
    zip.file('word/document.xml',            this.xmlDocument(n));

    // Embed each A4-page canvas as a PNG
    for (let i = 0; i < n; i++) {
      const dataUrl = pages[i].toDataURL('image/png');
      const base64  = dataUrl.split(',')[1];
      zip.file(`word/media/page${i + 1}.png`, base64, { base64: true });
    }

    return zip.generateAsync({
      type:     'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  }

  private xmlContentTypes(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Default Extension="png"  ContentType="image/png"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/settings.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
</Types>`;
  }

  private xmlRootRels(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`;
  }

  private xmlSettings(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:compat>
    <w:compatSetting w:name="compatibilityMode"
      w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>
  </w:compat>
</w:settings>`;
  }

  private xmlDocumentRels(pageCount: number): string {
    const imgRels = Array.from({ length: pageCount }, (_, i) =>
      `  <Relationship Id="rId${i + 1}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
    Target="media/page${i + 1}.png"/>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${imgRels}
  <Relationship Id="rId${pageCount + 1}"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings"
    Target="settings.xml"/>
</Relationships>`;
  }

  /** Builds word/document.xml: one full-page inline image per A4 canvas slice. */
  private xmlDocument(pageCount: number): string {
    const paragraphs = Array.from({ length: pageCount }, (_, i) => {
      const idx     = i + 1;
      const isLast  = i === pageCount - 1;

      const imgPara = `    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="0" w:after="0"/>
      </w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
            <wp:extent cx="${A4_W_EMU}" cy="${A4_H_EMU}"/>
            <wp:effectExtent l="0" t="0" r="0" b="0"/>
            <wp:docPr id="${idx}" name="Page${idx}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:nvPicPr>
                    <pic:cNvPr id="${idx}" name="Page${idx}"/>
                    <pic:cNvPicPr>
                      <a:picLocks noChangeAspect="1" noChangeArrowheads="1"/>
                    </pic:cNvPicPr>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="rId${idx}"
                      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr bwMode="auto">
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${A4_W_EMU}" cy="${A4_H_EMU}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                    <a:noFill/>
                    <a:ln><a:noFill/></a:ln>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;

      const pageBreak = isLast ? '' : `
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

      return imgPara + pageBreak;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  mc:Ignorable="w14">
  <w:body>
${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="${A4_W_TWIP}" w:h="${A4_H_TWIP}"/>
      <w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0"
               w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  }

  // ── CDN loader ────────────────────────────────────────────────────────────

  private loadScript(src: string): Promise<void> {
    if (this.scriptCache.has(src)) return Promise.resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) { this.scriptCache.add(src); return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s   = document.createElement('script');
      s.src     = src;
      s.async   = true;
      s.onload  = () => { this.scriptCache.add(src); resolve(); };
      s.onerror = () => reject(new Error(`Failed to load: ${src}`));
      document.head.appendChild(s);
    });
  }


  // ── Helpers ───────────────────────────────────────────────────────────────

  thumbnailSrc(b64: string): string {
    return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
  }

  formatClass(format?: 'pdf' | 'docx'): string {
    return format === 'pdf' ? 'pdf' : 'docx';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.detailCache.clear();
  }
}
