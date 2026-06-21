import { TestBed, fakeAsync, tick }  from '@angular/core/testing';
import { ActivatedRoute, Router }     from '@angular/router';
import { Location }                   from '@angular/common';
import { of, throwError, Subject }    from 'rxjs';

import { BillReceipt }         from 'src/app/component/receipt/bill-receipt';
import { ReceiptService }      from 'src/app/services/receiptServices/receipt.service';
import { ReceiptPdfService }   from 'src/app/services/receiptServices/receipt-pdf.service';
import { ToastrService }       from 'ngx-toastr';
import {
  MOCK_RECEIPTS_SAME_TEST,
  MOCK_RECEIPT_FULLY_PAID,
  MOCK_RECEIPT_NULL_NET,
  MOCK_RECEIPTS_TWO_TESTS,
} from '../mocks/mock-data';
import { Receipt } from 'src/app/models/receipt/receiptModel';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockReceiptService() {
  return {
    getReceiptList:  jest.fn().mockReturnValue(of([])),
    getReceiptCount: jest.fn().mockReturnValue(of({})),
    getReceiptById:  jest.fn().mockReturnValue(of({})),
    addReceipt:      jest.fn().mockReturnValue(of({})),
  };
}

function mockReceiptPdfService() {
  return {
    fetchReceiptData: jest.fn().mockReturnValue(of({})),
    openReceiptPdf:   jest.fn(),
  };
}

function mockToastr() {
  return { success: jest.fn(), error: jest.fn() };
}

function mockLocation() {
  return { back: jest.fn() };
}

function mockRouter() {
  return { navigate: jest.fn() };
}

function buildActivatedRoute(patientId: string | null = null) {
  const paramMap = {
    get: (key: string) => key === 'patientId' ? patientId : null,
  };
  return {
    queryParamMap: of(paramMap),
  };
}

/** Set up TestBed and return the component instance */
function createComponent(patientId: string | null = null) {
  const receiptSvc    = mockReceiptService();
  const receiptPdfSvc = mockReceiptPdfService();
  const toastr        = mockToastr();
  const location      = mockLocation();
  const router        = mockRouter();
  const route         = buildActivatedRoute(patientId);

  TestBed.configureTestingModule({
    providers: [
      BillReceipt,
      { provide: ReceiptService,    useValue: receiptSvc },
      { provide: ReceiptPdfService, useValue: receiptPdfSvc },
      { provide: ToastrService,     useValue: toastr },
      { provide: Location,          useValue: location },
      { provide: Router,            useValue: router },
      { provide: ActivatedRoute,    useValue: route },
    ],
  });

  const component = TestBed.inject(BillReceipt);
  return { component, receiptSvc, receiptPdfSvc, toastr, location, router };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('BillReceipt', () => {

  afterEach(() => TestBed.resetTestingModule());

  // ── groupedReceipts getter ─────────────────────────────────────────────────

  describe('groupedReceipts getter', () => {

    it('returns an empty array when no receipts are loaded', () => {
      const { component } = createComponent();
      component.receipts = [];
      expect(component.groupedReceipts).toEqual([]);
    });

    it('groups receipts by patientTestId', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_TWO_TESTS;
      const groups = component.groupedReceipts;
      expect(groups.length).toBe(2);
      expect(groups.map(g => g.patientTestId).sort()).toEqual([401, 402]);
    });

    it('sorts receipts within a group by receiptId ascending', () => {
      const { component } = createComponent();
      // MOCK_RECEIPTS_SAME_TEST has receiptId 2 before 1 intentionally
      component.receipts = MOCK_RECEIPTS_SAME_TEST;
      const [group] = component.groupedReceipts;
      expect(group.receipts[0].receiptId).toBe(1);
      expect(group.receipts[1].receiptId).toBe(2);
    });

    it('uses the API netAmount when it is present and positive', () => {
      const { component } = createComponent();
      component.receipts = [MOCK_RECEIPT_FULLY_PAID];
      const [group] = component.groupedReceipts;
      expect(group.netAmount).toBe(750);
    });

    it('derives net from firstRec.amountPaid + firstRec.amountPending when netAmount is null', () => {
      const { component } = createComponent();
      // MOCK_RECEIPT_NULL_NET: amountPaid=400, amountPending=600 → net=1000
      component.receipts = [MOCK_RECEIPT_NULL_NET];
      const [group] = component.groupedReceipts;
      expect(group.netAmount).toBe(1000);
    });

    it('sums all amountPaid values for totalPaid', () => {
      const { component } = createComponent();
      // MOCK_RECEIPTS_SAME_TEST: 500 + 300 = 800
      component.receipts = MOCK_RECEIPTS_SAME_TEST;
      const [group] = component.groupedReceipts;
      expect(group.totalPaid).toBe(800);
    });

    it('computes remaining = netAmount − totalPaid', () => {
      const { component } = createComponent();
      // net=1000, paid=800 → remaining=200
      component.receipts = MOCK_RECEIPTS_SAME_TEST;
      const [group] = component.groupedReceipts;
      expect(group.remaining).toBe(200);
    });

    it('remaining is never negative when overpaid', () => {
      const { component } = createComponent();
      const overpaid: Receipt[] = [{
        receiptId: 1, patientTestId: 999,
        netAmount: 100, amountPaid: 150, amountPending: 0,
        paymentType: 'Full', paymentMode: 'Cash', createdDate: '2024-01-01',
      }];
      component.receipts = overpaid;
      const [group] = component.groupedReceipts;
      expect(group.remaining).toBe(0);
    });

    it('sets paymentStatus to "Paid" when remaining === 0', () => {
      const { component } = createComponent();
      component.receipts = [MOCK_RECEIPT_FULLY_PAID];
      const [group] = component.groupedReceipts;
      expect(group.paymentStatus).toBe('Paid');
    });

    it('sets paymentStatus to "Partial" when some amount is paid but some remains', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_SAME_TEST;
      const [group] = component.groupedReceipts;
      expect(group.paymentStatus).toBe('Partial');
    });

    it('sets paymentStatus to "Pending" when nothing has been paid', () => {
      const { component } = createComponent();
      const pending: Receipt[] = [{
        receiptId: 1, patientTestId: 555,
        netAmount: 500, amountPaid: 0, amountPending: 500,
        paymentType: 'Pending', paymentMode: '', createdDate: '2024-01-01',
      }];
      component.receipts = pending;
      const [group] = component.groupedReceipts;
      expect(group.paymentStatus).toBe('Pending');
    });

    it('handles multiple groups correctly — each gets its own net/paid/remaining', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_TWO_TESTS;
      const groups = component.groupedReceipts;
      const g401 = groups.find(g => g.patientTestId === 401)!;
      const g402 = groups.find(g => g.patientTestId === 402)!;

      expect(g401.netAmount).toBe(500);
      expect(g401.totalPaid).toBe(500);
      expect(g401.remaining).toBe(0);
      expect(g401.paymentStatus).toBe('Paid');

      expect(g402.netAmount).toBe(800);
      expect(g402.totalPaid).toBe(200);
      expect(g402.remaining).toBe(600);
      expect(g402.paymentStatus).toBe('Partial');
    });
  });

  // ── Patient-level summary getters ──────────────────────────────────────────

  describe('totalNetAmount', () => {
    it('sums netAmount across all groups', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_TWO_TESTS; // 500 + 800
      expect(component.totalNetAmount).toBe(1300);
    });

    it('returns 0 when no receipts', () => {
      const { component } = createComponent();
      component.receipts = [];
      expect(component.totalNetAmount).toBe(0);
    });
  });

  describe('totalPaidOverall', () => {
    it('sums every amountPaid across all receipts', () => {
      const { component } = createComponent();
      // MOCK_RECEIPTS_SAME_TEST: 500 + 300 = 800
      component.receipts = MOCK_RECEIPTS_SAME_TEST;
      expect(component.totalPaidOverall).toBe(800);
    });
  });

  describe('totalRemainingOverall', () => {
    it('equals totalNetAmount − totalPaidOverall', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_SAME_TEST; // net=1000, paid=800 → rem=200
      expect(component.totalRemainingOverall).toBe(200);
    });

    it('is never negative', () => {
      const { component } = createComponent();
      const overpaid: Receipt[] = [{
        receiptId: 1, patientTestId: 1,
        netAmount: 100, amountPaid: 200, amountPending: 0,
        paymentType: 'Full', paymentMode: 'Cash', createdDate: '2024-01-01',
      }];
      component.receipts = overpaid;
      expect(component.totalRemainingOverall).toBe(0);
    });
  });

  describe('hasAnyPendingBalance', () => {
    it('returns true when totalRemainingOverall > 0', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_SAME_TEST;
      expect(component.hasAnyPendingBalance).toBe(true);
    });

    it('returns false when all receipts are fully paid', () => {
      const { component } = createComponent();
      component.receipts = [MOCK_RECEIPT_FULLY_PAID];
      expect(component.hasAnyPendingBalance).toBe(false);
    });

    it('returns false when receipts array is empty', () => {
      const { component } = createComponent();
      component.receipts = [];
      expect(component.hasAnyPendingBalance).toBe(false);
    });
  });

  // ── getPaymentStatusClass ──────────────────────────────────────────────────

  describe('getPaymentStatusClass()', () => {
    it('returns "status-paid" for "Paid"', () => {
      const { component } = createComponent();
      expect(component.getPaymentStatusClass('Paid')).toBe('status-paid');
    });

    it('returns "status-paid" for case-insensitive "paid"', () => {
      const { component } = createComponent();
      expect(component.getPaymentStatusClass('paid')).toBe('status-paid');
    });

    it('returns "status-partial" for "Partial"', () => {
      const { component } = createComponent();
      expect(component.getPaymentStatusClass('Partial')).toBe('status-partial');
    });

    it('returns "status-pending" for "Pending"', () => {
      const { component } = createComponent();
      expect(component.getPaymentStatusClass('Pending')).toBe('status-pending');
    });

    it('returns "status-pending" for an unknown status', () => {
      const { component } = createComponent();
      expect(component.getPaymentStatusClass('Unknown')).toBe('status-pending');
    });

    it('returns "status-pending" for an empty string', () => {
      const { component } = createComponent();
      expect(component.getPaymentStatusClass('')).toBe('status-pending');
    });
  });

  // ── getCardZIndex ──────────────────────────────────────────────────────────

  describe('getCardZIndex()', () => {
    it('gives the active card the highest z-index (groupCount + 1)', () => {
      const { component } = createComponent();
      component.receipts       = MOCK_RECEIPTS_TWO_TESTS; // 2 groups
      component.activeCardIndex = 0;
      // groupCount = 2 → active gets z-index = 3
      expect(component.getCardZIndex(0)).toBe(3);
    });

    it('gives adjacent cards lower z-index', () => {
      const { component } = createComponent();
      component.receipts        = MOCK_RECEIPTS_TWO_TESTS;
      component.activeCardIndex = 0;
      expect(component.getCardZIndex(1)).toBeLessThan(component.getCardZIndex(0));
    });

    it('adjusts when a non-first card is active', () => {
      const { component } = createComponent();
      component.receipts        = MOCK_RECEIPTS_TWO_TESTS;
      component.activeCardIndex = 1;
      expect(component.getCardZIndex(1)).toBeGreaterThan(component.getCardZIndex(0));
    });
  });

  // ── selectCard / isActiveCard ──────────────────────────────────────────────

  describe('selectCard() / isActiveCard()', () => {
    it('sets activeCardIndex on selectCard()', () => {
      const { component } = createComponent();
      component.activeCardIndex = 0;
      component.selectCard(2);
      expect(component.activeCardIndex).toBe(2);
    });

    it('isActiveCard returns true for the active index', () => {
      const { component } = createComponent();
      component.activeCardIndex = 1;
      expect(component.isActiveCard(1)).toBe(true);
      expect(component.isActiveCard(0)).toBe(false);
    });
  });

  // ── formatDate ─────────────────────────────────────────────────────────────

  describe('formatDate()', () => {
    it('returns an empty string for a falsy value', () => {
      const { component } = createComponent();
      expect(component.formatDate('')).toBe('');
      expect(component.formatDate(null as any)).toBe('');
    });

    it('returns a non-empty formatted string for a valid date', () => {
      const { component } = createComponent();
      const result = component.formatDate('2024-01-15T09:00:00');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      // Should contain the year
      expect(result).toContain('2024');
    });
  });

  // ── ngOnInit ───────────────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('pre-fills inputSearchValue from queryParam patientId', () => {
      const { component, receiptSvc } = createComponent('P-001');
      receiptSvc.getReceiptList.mockReturnValue(of([]));

      component.ngOnInit();

      expect(component.inputSearchValue).toBe('P-001');
    });

    it('hides the search input when navigated via queryParam', () => {
      const { component, receiptSvc } = createComponent('P-001');
      receiptSvc.getReceiptList.mockReturnValue(of([]));

      component.ngOnInit();

      expect(component.showSearchInput).toBe(false);
    });

    it('shows the search input when no queryParam is present', () => {
      const { component } = createComponent(null);
      component.ngOnInit();
      expect(component.showSearchInput).toBe(true);
    });

    it('calls loadReceipts when a patientId queryParam is present', () => {
      const { component, receiptSvc } = createComponent('P-001');
      receiptSvc.getReceiptList.mockReturnValue(of(MOCK_RECEIPTS_SAME_TEST));

      component.ngOnInit();

      expect(receiptSvc.getReceiptList).toHaveBeenCalledWith('P-001');
    });
  });

  // ── onSearchSubmit ─────────────────────────────────────────────────────────

  describe('onSearchSubmit()', () => {
    it('trims leading/trailing whitespace from inputSearchValue', () => {
      const { component, receiptSvc } = createComponent();
      receiptSvc.getReceiptList.mockReturnValue(of([]));
      component.inputSearchValue = '  P-001  ';

      component.onSearchSubmit();

      expect(component.inputSearchValue).toBe('P-001');
    });

    it('calls loadReceipts after a valid search input', () => {
      const { component, receiptSvc } = createComponent();
      receiptSvc.getReceiptList.mockReturnValue(of([]));
      component.inputSearchValue = 'P-001';

      component.onSearchSubmit();

      expect(receiptSvc.getReceiptList).toHaveBeenCalledWith('P-001');
    });

    it('does not call loadReceipts when inputSearchValue is blank', () => {
      const { component, receiptSvc } = createComponent();
      component.inputSearchValue = '   ';

      component.onSearchSubmit();

      expect(receiptSvc.getReceiptList).not.toHaveBeenCalled();
    });

    it('does not call loadReceipts when inputSearchValue is empty', () => {
      const { component, receiptSvc } = createComponent();
      component.inputSearchValue = '';

      component.onSearchSubmit();

      expect(receiptSvc.getReceiptList).not.toHaveBeenCalled();
    });
  });

  // ── loadReceipts ───────────────────────────────────────────────────────────

  describe('loadReceipts()', () => {
    it('sets isLoading to true while the request is in flight', () => {
      const { component, receiptSvc } = createComponent();
      const subject = new Subject<Receipt[]>();
      receiptSvc.getReceiptList.mockReturnValue(subject.asObservable());

      component.inputSearchValue = 'P-001';
      component.loadReceipts();

      expect(component.isLoading).toBe(true);
    });

    it('populates receipts and clears loading on success', () => {
      const { component, receiptSvc } = createComponent();
      receiptSvc.getReceiptList.mockReturnValue(of(MOCK_RECEIPTS_SAME_TEST));

      component.inputSearchValue = 'P-001';
      component.loadReceipts();

      expect(component.receipts.length).toBe(2);
      expect(component.isLoading).toBe(false);
    });

    it('resets activeCardIndex to 0 on each load', () => {
      const { component, receiptSvc } = createComponent();
      receiptSvc.getReceiptList.mockReturnValue(of([]));
      component.activeCardIndex = 3;

      component.inputSearchValue = 'P-001';
      component.loadReceipts();

      expect(component.activeCardIndex).toBe(0);
    });

    it('sets notFound when the API returns an empty array', () => {
      const { component, receiptSvc } = createComponent();
      receiptSvc.getReceiptList.mockReturnValue(of([]));

      component.inputSearchValue = 'UNKNOWN';
      component.loadReceipts();

      expect(component.notFound).toBe(true);
    });

    it('sets notFound on 404 error', () => {
      const { component, receiptSvc } = createComponent();
      const err = new Error('API error 404: Not Found');
      receiptSvc.getReceiptList.mockReturnValue(throwError(() => err));

      component.inputSearchValue = 'UNKNOWN';
      component.loadReceipts();

      expect(component.notFound).toBe(true);
      expect(component.isLoading).toBe(false);
    });

    it('sets errorMessage on non-404 errors', () => {
      const { component, receiptSvc } = createComponent();
      const err = new Error('API error 500: Internal Server Error');
      receiptSvc.getReceiptList.mockReturnValue(throwError(() => err));

      component.inputSearchValue = 'P-001';
      component.loadReceipts();

      expect(component.errorMessage).toBeTruthy();
      expect(component.notFound).toBe(false);
    });

    it('treats null API response as empty array', () => {
      const { component, receiptSvc } = createComponent();
      receiptSvc.getReceiptList.mockReturnValue(of(null as any));

      component.inputSearchValue = 'P-001';
      component.loadReceipts();

      expect(component.receipts).toEqual([]);
      expect(component.notFound).toBe(true);
    });
  });

  // ── Payment modal ──────────────────────────────────────────────────────────

  describe('openGroupPaymentModal()', () => {
    it('sets showPaymentModal to true', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_TWO_TESTS;
      const [group] = component.groupedReceipts;

      component.openGroupPaymentModal(group, new MouseEvent('click'));

      expect(component.showPaymentModal).toBe(true);
    });

    it('stores the group as activeGroup', () => {
      const { component } = createComponent();
      component.receipts = MOCK_RECEIPTS_TWO_TESTS;
      const [group] = component.groupedReceipts;

      component.openGroupPaymentModal(group, new MouseEvent('click'));

      expect(component.activeGroup).toBe(group);
    });
  });

  describe('onPaymentSaved()', () => {
    it('hides the modal and reloads receipts', () => {
      const { component, receiptSvc, toastr } = createComponent();
      receiptSvc.getReceiptList.mockReturnValue(of([]));
      component.showPaymentModal = true;
      component.inputSearchValue = 'P-001';

      component.onPaymentSaved();

      expect(component.showPaymentModal).toBe(false);
      expect(component.activeGroup).toBeNull();
      expect(toastr.success).toHaveBeenCalled();
      expect(receiptSvc.getReceiptList).toHaveBeenCalled();
    });
  });

  describe('onPaymentCancelled()', () => {
    it('hides the modal and clears activeGroup', () => {
      const { component } = createComponent();
      component.showPaymentModal = true;
      component.activeGroup = {} as any;

      component.onPaymentCancelled();

      expect(component.showPaymentModal).toBe(false);
      expect(component.activeGroup).toBeNull();
    });
  });

  // ── groupPaymentTestId / groupNetAmount / groupPrefillAmount ───────────────

  describe('modal pass-through getters', () => {
    it('groupPaymentTestId returns empty string when activeGroup is null', () => {
      const { component } = createComponent();
      component.activeGroup = null;
      expect(component.groupPaymentTestId).toBe('');
    });

    it('groupPaymentTestId returns string of patientTestId', () => {
      const { component } = createComponent();
      component.receipts    = MOCK_RECEIPTS_TWO_TESTS;
      const [group]         = component.groupedReceipts;
      component.activeGroup = group;
      expect(component.groupPaymentTestId).toBe(String(group.patientTestId));
    });

    it('groupNetAmount returns 0 when activeGroup is null', () => {
      const { component } = createComponent();
      component.activeGroup = null;
      expect(component.groupNetAmount).toBe(0);
    });

    it('groupNetAmount returns the group netAmount', () => {
      const { component } = createComponent();
      component.receipts    = [MOCK_RECEIPT_FULLY_PAID];
      const [group]         = component.groupedReceipts;
      component.activeGroup = group;
      expect(component.groupNetAmount).toBe(750);
    });

    it('groupPrefillAmount returns the group remaining', () => {
      const { component } = createComponent();
      component.receipts    = MOCK_RECEIPTS_SAME_TEST;
      const [group]         = component.groupedReceipts;
      component.activeGroup = group;
      expect(component.groupPrefillAmount).toBe(group.remaining);
    });
  });

  // ── goBack ─────────────────────────────────────────────────────────────────

  describe('goBack()', () => {
    it('calls location.back() when navigatedViaQueryParam is true', () => {
      const { component, location, receiptSvc } = createComponent('P-001');
      receiptSvc.getReceiptList.mockReturnValue(of([]));
      component.ngOnInit(); // sets navigatedViaQueryParam = true

      component.goBack();

      expect(location.back).toHaveBeenCalled();
    });

    it('resets state when there are receipts loaded (no queryParam)', () => {
      const { component } = createComponent(null);
      component.ngOnInit(); // navigatedViaQueryParam stays false
      component.receipts = MOCK_RECEIPTS_SAME_TEST;

      component.goBack();

      expect(component.receipts).toEqual([]);
      expect(component.showSearchInput).toBe(true);
      expect(component.inputSearchValue).toBe('');
    });

    it('calls location.back() when no receipts and no queryParam (nothing to show)', () => {
      const { component, location } = createComponent(null);
      component.ngOnInit(); // navigatedViaQueryParam = false
      // receipts stays [], notFound stays false, errorMessage stays ''
      component.receipts       = [];
      component.notFound       = false;
      component.errorMessage   = '';

      component.goBack();

      expect(location.back).toHaveBeenCalled();
    });

    it('resets state when notFound is true', () => {
      const { component } = createComponent(null);
      component.ngOnInit();
      component.notFound = true;

      component.goBack();

      expect(component.notFound).toBe(false);
      expect(component.showSearchInput).toBe(true);
    });
  });
});
