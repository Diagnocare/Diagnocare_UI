import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TestReportGenerationServices } from './test-report-generation-services';
import { HtmlToPdfService } from '../pdfServices/html-to-pdf.service';

/** How a hand-off to the device's share sheet ended. */
export type PdfShareOutcome =
  /** The share sheet completed. WhatsApp may or may not have been the app chosen. */
  | 'shared'
  /** The person closed the share sheet without choosing anything. */
  | 'cancelled'
  /** The browser wanted a fresh tap: too long passed since the click that started it. */
  | 'needs-tap'
  /** This browser or device cannot share a file. Use download(). */
  | 'unsupported';

/**
 * Sends a report to WhatsApp as a PDF file instead of a public link.
 *
 * A wa.me link can only carry text, never a file. The browser's share sheet
 * (navigator.share with files) is the one route that attaches a real document,
 * and it lets the person choose any chat or group, which the Business API cannot.
 * It is available on Android and iOS, and on Chrome and Edge for Windows. Where it
 * is not, the caller falls back to download().
 */
@Injectable({ providedIn: 'root' })
export class ReportPdfShareService {

  constructor(
    private reports: TestReportGenerationServices,
    private htmlToPdf: HtmlToPdfService,
  ) {}

  /**
   * Builds the report's PDF. Tests without a lab template already come back as a
   * PDF; template reports come back as a page and are rendered to one here.
   */
  async preparePdf(
    patientTestId: number,
    testCode: string,
    patientName: string,
    pathBranch?: string,
  ): Promise<File> {
    const response = await firstValueFrom(this.reports.getReportForSharing(patientTestId, testCode, pathBranch));
    if (!response || response.size === 0) throw new Error('The report came back empty.');

    const pdf = (response.type || '').toLowerCase().includes('application/pdf')
      ? response
      : await this.htmlToPdf.fromHtml(await response.text());

    return new File([pdf], this.fileName(patientName, testCode), { type: 'application/pdf' });
  }

  /** True when this browser can hand these files to the share sheet. */
  canShareFiles(files: File[]): boolean {
    return files.length > 0
        && typeof navigator !== 'undefined'
        && typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files });
  }

  /** Opens the share sheet with the PDFs attached (one per test report). */
  async share(files: File[], title: string, text: string): Promise<PdfShareOutcome> {
    if (!this.canShareFiles(files)) return 'unsupported';

    try {
      await navigator.share({ files, title, text });
      return 'shared';
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'AbortError')        return 'cancelled';
      if (name === 'NotAllowedError')   return 'needs-tap';
      if (name === 'NotSupportedError') return 'unsupported';
      throw err;
    }
  }

  /** Saves the PDFs to the device, for browsers that cannot share a file. */
  download(files: File[]): void {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  }

  /** "Ravi_Kumar_CBC.pdf": letters, digits, dash and underscore only. */
  fileName(patientName: string, testCode: string): string {
    const clean = (s: string) => (s ?? '').trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return `${clean(patientName) || 'Report'}_${clean(testCode) || 'Test'}.pdf`;
  }
}
