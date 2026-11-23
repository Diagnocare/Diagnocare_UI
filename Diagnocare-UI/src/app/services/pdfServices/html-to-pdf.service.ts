import { Injectable } from '@angular/core';

/** A4 at 96 dpi, in CSS pixels. The report is laid out at this width. */
export const A4_WIDTH_PX  = 794;
export const A4_HEIGHT_PX = 1123;

/** Ceilings that keep the capture inside what mobile browsers can allocate. */
const MAX_CANVAS_SIDE_PX = 16_000;
const MAX_CANVAS_AREA_PX = 16_000_000;
const PREFERRED_SCALE    = 2;
const JPEG_QUALITY       = 0.88;

/**
 * Turns a finished report page (a complete HTML document) into a PDF file, in the
 * browser.
 *
 * Why here and not on the server: the API cannot render HTML to PDF. The hosting
 * plan forbids a headless browser (it suspended the site twice), so for lab
 * templates it only returns print-ready HTML. The operator's own browser is the
 * one engine that is allowed to lay the page out, so the PDF is made from what it
 * draws, which is why it matches the printed report.
 *
 * The page is drawn into a hidden, script-free iframe, captured with html2canvas
 * and cut into A4 pages for jsPDF. Both libraries are imported on demand, so
 * they are only downloaded the first time someone shares a PDF.
 *
 * The pages are images: the text in the PDF cannot be selected or searched.
 */
@Injectable({ providedIn: 'root' })
export class HtmlToPdfService {

  async fromHtml(fullHtml: string): Promise<Blob> {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await this.capture(fullHtml, html2canvas);
    const pageHeightPx = Math.round(canvas.width * (A4_HEIGHT_PX / A4_WIDTH_PX));

    const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let top = 0, page = 0; top < canvas.height; top += pageHeightPx, page++) {
      const strip = document.createElement('canvas');
      strip.width  = canvas.width;
      strip.height = pageHeightPx;                     // every page full A4; the last is padded white

      const ctx = strip.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available in this browser.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, strip.width, strip.height);
      ctx.drawImage(canvas, 0, top, canvas.width, Math.min(pageHeightPx, canvas.height - top),
                            0, 0,   canvas.width, Math.min(pageHeightPx, canvas.height - top));

      if (page > 0) pdf.addPage();
      pdf.addImage(strip.toDataURL('image/jpeg', JPEG_QUALITY), 'JPEG', 0, 0, pageW, pageH);
    }

    return pdf.output('blob');
  }

  /** Draws the page in an off-screen iframe at A4 width and captures all of it. */
  private async capture(
    fullHtml: string,
    html2canvas: typeof import('html2canvas').default,
  ): Promise<HTMLCanvasElement> {
    const iframe = document.createElement('iframe');
    // allow-same-origin lets us read the finished layout; with no allow-scripts,
    // nothing inside the page can run.
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      `position:fixed;left:-10000px;top:0;width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;border:0;visibility:hidden;`;

    try {
      const loaded = new Promise<void>((resolve, reject) => {
        iframe.onload  = () => resolve();
        iframe.onerror = () => reject(new Error('The report page could not be loaded.'));
      });
      iframe.srcdoc = fullHtml;
      document.body.appendChild(iframe);
      await loaded;

      const doc = iframe.contentDocument;
      if (!doc?.documentElement) throw new Error('The report page could not be read.');

      await this.settle(doc);

      const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0, A4_HEIGHT_PX);
      iframe.style.height = `${height}px`;

      const scale = this.pickScale(A4_WIDTH_PX, height);
      return await html2canvas(doc.documentElement, {
        scale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: A4_WIDTH_PX,
        height,
        windowWidth: A4_WIDTH_PX,
        windowHeight: height,
      });
    } finally {
      iframe.remove();
    }
  }

  /** Waits for fonts and images, so the capture is not taken half-drawn. */
  private async settle(doc: Document): Promise<void> {
    const waits: Promise<unknown>[] = [];

    const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) waits.push(fonts.ready);

    for (const img of Array.from(doc.images)) {
      if (img.complete) continue;
      waits.push(new Promise<void>(resolve => {
        img.addEventListener('load',  () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true }); // a broken logo must not block the report
      }));
    }

    // Never wait forever on a slow image host.
    await Promise.race([Promise.all(waits), new Promise(resolve => setTimeout(resolve, 8000))]);
  }

  /** Sharpest scale that still fits the browser's canvas limits (long reports get less). */
  private pickScale(widthPx: number, heightPx: number): number {
    const bySide = MAX_CANVAS_SIDE_PX / heightPx;
    const byArea = Math.sqrt(MAX_CANVAS_AREA_PX / (widthPx * heightPx));
    return Math.max(1, Math.min(PREFERRED_SCALE, bySide, byArea));
  }
}
