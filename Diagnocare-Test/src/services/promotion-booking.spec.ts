import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { PromotionService } from 'src/app/services/promotionServices/promotion.service';
import { BookingSelectionState } from 'src/app/shared/booking/booking-selection.state';
import { PricingPlan } from 'src/app/models/promotion/promotion.model';

const BASE = 'http://localhost:5000/api/Promotion/';

/** A plan as the API would return it: group LFT (4 tests, 1500) at the offer price 999. */
function plan(over: Partial<PricingPlan> = {}): PricingPlan {
  return {
    success: true, lines: [], notices: [],
    tests: [
      { code: 'SGOT', name: 'SGOT', price: 300 }, { code: 'SGPT', name: 'SGPT', price: 300 },
      { code: 'TBIL', name: 'Total Bilirubin', price: 450 }, { code: 'DBIL', name: 'Direct Bilirubin', price: 450 },
    ],
    totalTests: 4, regularTotal: 1500, promotionDiscount: 501, payableAfterPromotion: 999,
    ...over,
  };
}

describe('PromotionService', () => {
  let service: PromotionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [PromotionService] });
    service = TestBed.inject(PromotionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('asks the API for a quote and sends only WHAT was picked, never a price', () => {
    service.quote([{ type: 'Group', id: 'LFT' }, { type: 'Test', id: 'CBC' }]).subscribe();

    const req = http.expectOne(`${BASE}Quote`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ selections: [{ type: 'Group', id: 'LFT' }, { type: 'Test', id: 'CBC' }] });
    req.flush(plan());
  });

  it('reads the active offers from GET Active', () => {
    service.getActive().subscribe(list => expect(list.length).toBe(1));
    const req = http.expectOne(`${BASE}Active`);
    expect(req.request.method).toBe('GET');
    req.flush([{ promotionId: 1 }]);
  });

  it('admin calls use the right verbs', () => {
    const body = {
      title: 'x', targetType: 'Group' as const, targetId: 'LFT', fixedPrice: 999, percentOff: null,
      startDate: '2026-11-01', endDate: '2026-11-30', isActive: true,
    };
    service.create(body).subscribe();
    expect(http.expectOne(BASE).request.method).toBe('POST');

    service.update(7, body).subscribe();
    expect(http.expectOne(`${BASE}7`).request.method).toBe('PUT');

    service.remove(7).subscribe();
    expect(http.expectOne(`${BASE}7`).request.method).toBe('DELETE');
  });
});

describe('BookingSelectionState', () => {
  let state: BookingSelectionState;
  let http: HttpTestingController;
  let changes: number;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [PromotionService] });
    http = TestBed.inject(HttpTestingController);
    changes = 0;
    state = new BookingSelectionState(TestBed.inject(PromotionService), () => changes++);
  });
  afterEach(() => http.verify());

  it('adds a package on the first tap and removes it on the second', () => {
    const lft = { type: 'Group' as const, id: 'LFT', name: 'Liver Function Profile' };

    expect(state.togglePackage(lft)).toBe(true);
    expect(state.isPackageSelected('Group', 'LFT')).toBe(true);
    expect(state.hasPackages).toBe(true);

    expect(state.togglePackage(lft)).toBe(false);
    expect(state.hasPackages).toBe(false);
  });

  it('a group and a sub-group with the same id are different selections', () => {
    state.togglePackage({ type: 'Group', id: 'X', name: 'G' });
    state.togglePackage({ type: 'SubGroup', id: 'X', name: 'S' });
    expect(state.packages.length).toBe(2);
  });

  it('sends packages first, then individually chosen tests, in one quote', () => {
    state.togglePackage({ type: 'Group', id: 'LFT', name: 'LFT' });
    state.refresh(['SGOT', 'CBC']);

    const req = http.expectOne(`${BASE}Quote`);
    expect(req.request.body.selections).toEqual([
      { type: 'Group', id: 'LFT' }, { type: 'Test', id: 'SGOT' }, { type: 'Test', id: 'CBC' },
    ]);
    expect(state.quoting).toBe(true);
    expect(state.ready).toBe(false);
    req.flush(plan());

    expect(state.ready).toBe(true);
    expect(state.plan!.payableAfterPromotion).toBe(999);
    expect(state.bookedCodes).toEqual(['SGOT', 'SGPT', 'TBIL', 'DBIL']);
    expect(changes).toBeGreaterThan(0);
  });

  it('only the latest answer counts when choices change quickly', () => {
    state.refresh(['CBC']);
    const first = http.expectOne(`${BASE}Quote`);

    state.refresh(['CBC', 'SGOT']);
    expect(first.cancelled).toBe(true);
    const second = http.expectOne(`${BASE}Quote`);
    second.flush(plan({ totalTests: 2, regularTotal: 500, promotionDiscount: 0, payableAfterPromotion: 500 }));

    expect(state.plan!.payableAfterPromotion).toBe(500);
  });

  it('clears the plan when nothing is chosen, without calling the API', () => {
    state.refresh(['CBC']);
    http.expectOne(`${BASE}Quote`).flush(plan());

    state.refresh([]);
    http.expectNone(`${BASE}Quote`);
    expect(state.plan).toBeNull();
    expect(state.ready).toBe(false);
  });

  it('is not ready, and says why, when the API refuses the selection', () => {
    state.refresh(['NOPE']);
    http.expectOne(`${BASE}Quote`).flush(
      { success: false, error: "Test 'NOPE' was not found in the test catalogue.", lines: [], tests: [], notices: [] },
      { status: 400, statusText: 'Bad Request' });

    expect(state.ready).toBe(false);
    expect(state.error).toContain('not found');
    expect(state.bookedCodes).toEqual([]);
  });

  it('is not ready when the request fails outright', () => {
    state.refresh(['CBC']);
    http.expectOne(`${BASE}Quote`).error(new ProgressEvent('error'));

    expect(state.ready).toBe(false);
    expect(state.error).toBeTruthy();
  });

  it('clear() forgets packages and plan, and ignores an answer still on its way', () => {
    state.togglePackage({ type: 'Group', id: 'LFT', name: 'LFT' });
    state.refresh([]);
    const inFlight = http.expectOne(`${BASE}Quote`);

    state.clear();

    expect(inFlight.cancelled).toBe(true);
    expect(state.packages).toEqual([]);
    expect(state.plan).toBeNull();
    expect(state.quoting).toBe(false);
  });

  it('loads the offers, and a failure just means no badges', () => {
    state.loadPromos();
    http.expectOne(`${BASE}Active`).flush([{ promotionId: 1, targetType: 'Group', targetId: 'LFT' }]);
    expect(state.promos.length).toBe(1);

    state.loadPromos();
    http.expectOne(`${BASE}Active`).error(new ProgressEvent('error'));
    expect(state.promos).toEqual([]);
  });
});
