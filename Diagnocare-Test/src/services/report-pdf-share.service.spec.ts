import { of } from 'rxjs';

// The real converter pulls in jsPDF and html2canvas, which need a real canvas.
// What matters here is when the share service calls it, so it is replaced.
jest.mock('src/app/services/pdfServices/html-to-pdf.service', () => ({
  HtmlToPdfService: class {},
}));

import { ReportPdfShareService } from 'src/app/services/patientTestReportServices/report-pdf-share.service';

describe('ReportPdfShareService', () => {
  let getReportForSharing: jest.Mock;
  let fromHtml: jest.Mock;
  let service: ReportPdfShareService;

  const pdfFile = () => new File(['%PDF-1.4'], 'Ravi_CBC.pdf', { type: 'application/pdf' });

  beforeEach(() => {
    getReportForSharing = jest.fn();
    fromHtml = jest.fn(async () => new Blob(['%PDF-from-html'], { type: 'application/pdf' }));
    service = new ReportPdfShareService({ getReportForSharing } as any, { fromHtml } as any);
  });

  afterEach(() => {
    delete (navigator as any).share;
    delete (navigator as any).canShare;
  });

  describe('preparePdf', () => {
    it('uses a PDF from the server as it is (tests without a lab template)', async () => {
      getReportForSharing.mockReturnValue(of(new Blob(['%PDF-server'], { type: 'application/pdf' })));

      const file = await service.preparePdf(7, 'CBC', 'Ravi Kumar');

      expect(fromHtml).not.toHaveBeenCalled();
      expect(file.type).toBe('application/pdf');
      expect(file.name).toBe('Ravi_Kumar_CBC.pdf');
      expect(getReportForSharing).toHaveBeenCalledWith(7, 'CBC', undefined);
    });

    it('renders a template page to a PDF in the browser', async () => {
      // jsdom's Blob has no text(); real browsers do. A stand-in carries the page.
      const page = { size: 19, type: 'text/html', text: async () => '<html>report</html>' };
      getReportForSharing.mockReturnValue(of(page));

      const file = await service.preparePdf(7, 'LFT', 'Ravi', 'Main Branch');

      expect(fromHtml).toHaveBeenCalledWith('<html>report</html>');
      expect(file.type).toBe('application/pdf');
      expect(getReportForSharing).toHaveBeenCalledWith(7, 'LFT', 'Main Branch');
    });

    it('refuses an empty response rather than sharing an empty file', async () => {
      getReportForSharing.mockReturnValue(of(new Blob([], { type: 'text/html' })));

      await expect(service.preparePdf(7, 'CBC', 'Ravi')).rejects.toThrow('empty');
      expect(fromHtml).not.toHaveBeenCalled();
    });
  });

  describe('share', () => {
    const withShare = (share: jest.Mock, canShare = true) => {
      (navigator as any).share = share;
      (navigator as any).canShare = jest.fn(() => canShare);
    };

    it('reports "unsupported" when the browser has no share sheet', async () => {
      expect(await service.share([pdfFile()], 't', 'x')).toBe('unsupported');
    });

    it('reports "unsupported" when the browser cannot share a file', async () => {
      const share = jest.fn();
      withShare(share, false);

      expect(await service.share([pdfFile()], 't', 'x')).toBe('unsupported');
      expect(share).not.toHaveBeenCalled();
    });

    it('attaches the PDF as a file, not as a link', async () => {
      const share = jest.fn().mockResolvedValue(undefined);
      withShare(share);
      const file = pdfFile();

      expect(await service.share([file], 'CBC report', 'Dear Ravi')).toBe('shared');
      expect(share).toHaveBeenCalledWith({ files: [file], title: 'CBC report', text: 'Dear Ravi' });
      expect(share.mock.calls[0][0].url).toBeUndefined();
    });

    it.each([
      ['AbortError',        'cancelled'],
      ['NotAllowedError',   'needs-tap'],
      ['NotSupportedError', 'unsupported'],
    ])('maps %s to "%s"', async (name, expected) => {
      withShare(jest.fn().mockRejectedValue(Object.assign(new Error(name), { name })));

      expect(await service.share([pdfFile()], 't', 'x')).toBe(expected);
    });

    it('lets an unexpected failure through instead of hiding it', async () => {
      withShare(jest.fn().mockRejectedValue(new Error('boom')));

      await expect(service.share([pdfFile()], 't', 'x')).rejects.toThrow('boom');
    });
  });

  describe('fileName', () => {
    it('keeps letters and digits, joins the rest with underscores', () => {
      expect(service.fileName('Mr. Ravi  Kumar', 'CBC-01')).toBe('Mr_Ravi_Kumar_CBC_01.pdf');
    });

    it('never puts path characters or unicode quirks into the name', () => {
      expect(service.fileName('../..\\evil"name', 'T/1')).toBe('evil_name_T_1.pdf');
    });

    it('falls back when the name or code is empty', () => {
      expect(service.fileName('', '')).toBe('Report_Test.pdf');
    });
  });
});
