import { TestBed } from '@angular/core/testing';
import { HtmlToPdfService } from './html-to-pdf.service';

/**
 * Runs the real html2canvas + jsPDF pipeline in the browser (Karma), because
 * jsdom has no canvas and a mocked converter proves nothing about the PDF.
 */
describe('HtmlToPdfService', () => {
  let service: HtmlToPdfService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HtmlToPdfService);
  });

  const page = (body: string) =>
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<style>body{margin:0;font:16px Arial}</style></head><body>${body}</body></html>`;

  /** Pages in a jsPDF file: one "/Type /Page" object each ("/Pages" is the tree). */
  const pageCount = async (pdf: Blob) =>
    (new TextDecoder('latin1').decode(await pdf.arrayBuffer()).match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;

  it('turns a report page into a real PDF file', async () => {
    const pdf = await service.fromHtml(page('<h1>Complete Blood Count</h1><p>Hemoglobin 13.5 g/dL</p>'));

    expect(pdf.type).toBe('application/pdf');
    expect(pdf.size).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(await pdf.slice(0, 5).arrayBuffer())).toBe('%PDF-');
    expect(await pageCount(pdf)).toBe(1);
  }, 30_000);

  it('adds a page for every A4 of content', async () => {
    // Three A4 pages' worth of height.
    const pdf = await service.fromHtml(page('<div style="height:3000px;background:#eef">long report</div>'));

    expect(await pageCount(pdf)).toBe(3);
  }, 30_000);

  it('does not run scripts in the page it renders', async () => {
    (window as any).__reportScriptRan = false;
    await service.fromHtml(page('<p>x</p><script>parent.__reportScriptRan = true;</script>'));

    expect((window as any).__reportScriptRan).toBeFalse();
  }, 30_000);

  it('leaves nothing behind in the document', async () => {
    const before = document.querySelectorAll('iframe').length;
    await service.fromHtml(page('<p>x</p>'));

    expect(document.querySelectorAll('iframe').length).toBe(before);
  }, 30_000);
});
