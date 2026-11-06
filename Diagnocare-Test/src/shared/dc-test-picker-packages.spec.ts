import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DcTestPickerComponent } from 'src/app/shared/simple/dc-test-picker.component';
import { BookingSummaryComponent } from 'src/app/shared/booking/booking-summary.component';
import { ActivePromotion, PricingPlan } from 'src/app/models/promotion/promotion.model';
import { DcTestGroup } from 'src/app/models/common/dc-primitives.model';

const t = (code: string, name: string, price: number, bookable = true) => ({ code, name, price, bookable });

/** Liver Function Profile (1500) = Enzymes (600) + Bilirubin (900); Haematology = CBC 200. */
const GROUPS: DcTestGroup[] = [
  {
    id: 'LFT', name: 'Liver Function Profile',
    subGroups: [
      { id: 'LFT-ENZ', name: 'Liver Enzymes', tests: [t('SGOT', 'SGOT', 300), t('SGPT', 'SGPT', 300)] },
      { id: 'LFT-BIL', name: 'Bilirubin', tests: [t('TBIL', 'Total Bilirubin', 450), t('DBIL', 'Direct Bilirubin', 450)] },
    ],
  },
  {
    id: 'HAEM', name: 'Haematology',
    subGroups: [{ id: 'HAEM-S', name: 'Blood Count', tests: [t('CBC', 'Complete Blood Count', 200)] }],
  },
];

const PROMO: ActivePromotion = {
  promotionId: 1, title: 'Monsoon offer', targetType: 'Group', targetId: 'LFT',
  regularPrice: 1500, promoPrice: 999, savings: 501, endDate: '2026-11-30T00:00:00',
};

function planFor(over: Partial<PricingPlan> = {}): PricingPlan {
  return {
    success: true, notices: [],
    lines: [{
      type: 'Group', id: 'LFT', name: 'Liver Function Profile',
      tests: [t('SGOT', 'SGOT', 300), t('SGPT', 'SGPT', 300), t('TBIL', 'Total Bilirubin', 450), t('DBIL', 'Direct Bilirubin', 450)],
      regularPrice: 1500, chargedPrice: 999, savings: 501, promotionId: 1, promotionTitle: 'Monsoon offer', alreadyIncluded: false,
    }],
    tests: [t('SGOT', 'SGOT', 300), t('SGPT', 'SGPT', 300), t('TBIL', 'Total Bilirubin', 450), t('DBIL', 'Direct Bilirubin', 450)],
    totalTests: 4, regularTotal: 1500, promotionDiscount: 501, payableAfterPromotion: 999,
    ...over,
  };
}

describe('DcTestPickerComponent: group and sub-group checkboxes', () => {
  let fixture: ComponentFixture<DcTestPickerComponent>;
  let picker: DcTestPickerComponent;
  let el: HTMLElement;
  let pkgEvents: any[];
  let testEvents: string[];

  function render(inputs: Partial<DcTestPickerComponent> = {}) {
    Object.assign(picker, { groups: GROUPS, planRequired: true }, inputs);
    picker.ngOnChanges({
      groups: { currentValue: GROUPS, previousValue: [], firstChange: true, isFirstChange: () => true },
      promos: { currentValue: picker.promos, previousValue: [], firstChange: true, isFirstChange: () => true },
    });
    fixture.detectChanges();
  }
  const text = () => el.textContent!.replace(/\s+/g, ' ');
  /** Group checkboxes first (LFT, HAEM), then the open group's sub-groups (ENZ, BIL). */
  const checks = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.dcp__check'));
  const [GROUP_LFT, GROUP_HAEM, SUB_ENZ, SUB_BIL] = [0, 1, 2, 3];
  const state = (i: number) => checks()[i].getAttribute('aria-checked');
  const pkg = (type: 'Group' | 'SubGroup', id: string, name: string) => ({ type, id, name });

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DcTestPickerComponent] });
    fixture = TestBed.createComponent(DcTestPickerComponent);
    picker = fixture.componentInstance;
    el = fixture.nativeElement;
    pkgEvents = []; testEvents = [];
    picker.packageToggled.subscribe(e => pkgEvents.push(e));
    picker.toggled.subscribe(t => testEvents.push(t.code));
  });

  it('has a checkbox beside every group and sub-group, and no "Select whole" buttons', () => {
    render();
    expect(checks().length).toBe(4);
    expect(text()).not.toContain('Select whole');
    expect(el.querySelector('.dcp__pkg')).toBeNull();
  });

  it('the checkbox uses the same box as a test row', () => {
    render();
    expect(checks()[0].querySelector('.dcp__box')).not.toBeNull();
  });

  it('shows the regular price beside every group and sub-group, even with no offer', () => {
    render();
    const prices = Array.from(el.querySelectorAll('.dcp__node .dcp__price')).map(e => e.textContent!.trim());
    expect(prices).toEqual(['₹1,500', '₹200', '₹600', '₹900']);    // LFT, HAEM, then LFT's two sub-groups
    expect(el.querySelector('.dcp__nodeoffer')).toBeNull();          // nothing extra without an offer
  });

  it('a group price uses the same class as a test price', () => {
    render();
    expect(el.querySelector('.dcp__node .dcp__price')).not.toBeNull();
    expect(el.querySelector('.dcp__row .dcp__price')).not.toBeNull();
  });

  it('shows the offer under the group name: "Promotional price: ₹999 (Save ₹501)"', () => {
    render({ promos: [PROMO] });
    const offer = el.querySelector('.dcp__nodeoffer')!.textContent!.replace(/\s+/g, ' ');
    expect(offer).toContain('Promotional price: ₹999 (Save ₹501)');
    expect(offer).toContain('Monsoon offer');
    // the regular price stays beside the name
    expect(el.querySelector('.dcp__node .dcp__price')!.textContent).toContain('₹1,500');
  });

  it('shows a sub-group offer the same way', () => {
    render({ promos: [{ ...PROMO, targetType: 'SubGroup', targetId: 'LFT-ENZ', regularPrice: 600, promoPrice: 450, savings: 150 }] });
    const offers = el.querySelectorAll('.dcp__nodeoffer');
    expect(offers.length).toBe(1);
    expect(offers[0].textContent).toContain('Promotional price: ₹450 (Save ₹150)');
  });

  it('ticking a group that has an offer chooses the group as a whole', () => {
    render({ promos: [PROMO] });
    checks()[GROUP_LFT].click();
    expect(pkgEvents).toEqual([pkg('Group', 'LFT', 'Liver Function Profile')]);
    expect(testEvents).toEqual([]);
  });

  it('ticking a sub-group does not need its parent group', () => {
    render();
    checks()[SUB_ENZ].click();
    expect(pkgEvents).toEqual([pkg('SubGroup', 'LFT-ENZ', 'Liver Enzymes')]);
  });

  it('a group with no offer of its own is split so each sub-group keeps its own offer', () => {
    render({ promos: [{ ...PROMO, targetType: 'SubGroup', targetId: 'LFT-ENZ', title: 'Enzyme week' }] });
    checks()[GROUP_LFT].click();
    expect(pkgEvents.map(e => e.id)).toEqual(['LFT-ENZ', 'LFT-BIL']);
  });

  it('tapping a group or sub-group NAME opens it and never changes the selection', () => {
    render();
    el.querySelectorAll<HTMLButtonElement>('.dcp__node')[1].click();   // Haematology
    expect(pkgEvents).toEqual([]);
    expect(testEvents).toEqual([]);
    expect(picker.openGroupId).toBe('HAEM');
  });

  describe('states', () => {
    it('unticked when nothing is chosen', () => {
      render();
      expect([GROUP_LFT, GROUP_HAEM, SUB_ENZ, SUB_BIL].map(state)).toEqual(['false', 'false', 'false', 'false']);
    });

    it('some tests chosen: the sub-group and the group show the indeterminate state', () => {
      render({ selectedCodes: ['SGOT'] });
      expect(state(SUB_ENZ)).toBe('mixed');
      expect(state(GROUP_LFT)).toBe('mixed');
      expect(state(SUB_BIL)).toBe('false');
      expect(checks()[SUB_ENZ].querySelector('.dcp__box--some')).not.toBeNull();
    });

    it('every test in a sub-group chosen one by one: the sub-group becomes ticked, the group stays mixed', () => {
      render({ selectedCodes: ['SGOT', 'SGPT'] });
      expect(state(SUB_ENZ)).toBe('true');
      expect(state(GROUP_LFT)).toBe('mixed');
    });

    it('every sub-group chosen: the group becomes ticked', () => {
      render({ packages: [pkg('SubGroup', 'LFT-ENZ', 'Liver Enzymes'), pkg('SubGroup', 'LFT-BIL', 'Bilirubin')] });
      expect(state(GROUP_LFT)).toBe('true');
    });

    it('a chosen group ticks its sub-groups and every test beneath it', () => {
      render({ packages: [pkg('Group', 'LFT', 'Liver Function Profile')] });
      expect([GROUP_LFT, SUB_ENZ, SUB_BIL].map(state)).toEqual(['true', 'true', 'true']);
      expect(state(GROUP_HAEM)).toBe('false');
      el.querySelectorAll<HTMLButtonElement>('.dcp__node')[2].click();   // open Liver Enzymes
      fixture.detectChanges();
      expect(el.querySelectorAll('.dcp__row--on').length).toBe(2);
    });
  });

  describe('unticking', () => {
    it('unticking a chosen group removes it', () => {
      render({ packages: [pkg('Group', 'LFT', 'Liver Function Profile')] });
      checks()[GROUP_LFT].click();
      expect(pkgEvents).toEqual([pkg('Group', 'LFT', 'Liver Function Profile')]);
      expect(testEvents).toEqual([]);
    });

    it('clicking a mixed group ticks all of it, folding the lone test in', () => {
      render({ selectedCodes: ['SGOT'] });
      checks()[GROUP_LFT].click();
      // the lone test is folded into the group, then the group is chosen as a whole
      expect(testEvents).toEqual(['SGOT']);
      expect(pkgEvents.map(e => e.id)).toEqual(['LFT']);
    });

    it('unticking a sub-group inside a chosen group keeps the other sub-group chosen', () => {
      render({ packages: [pkg('Group', 'LFT', 'Liver Function Profile')] });
      checks()[SUB_ENZ].click();
      expect(pkgEvents.map(e => e.id)).toEqual(['LFT', 'LFT-BIL']);   // group out, Bilirubin in
      expect(testEvents).toEqual([]);
    });

    it('unticking one test inside a chosen group breaks the group up instead of adding the test twice', () => {
      render({ packages: [pkg('Group', 'LFT', 'Liver Function Profile')] });
      el.querySelectorAll<HTMLButtonElement>('.dcp__node')[2].click();   // open Liver Enzymes
      fixture.detectChanges();
      el.querySelectorAll<HTMLButtonElement>('.dcp__row')[0].click();    // SGOT

      expect(pkgEvents.map(e => e.id)).toEqual(['LFT', 'LFT-BIL']);
      expect(testEvents).toEqual(['SGPT']);                              // the rest of Liver Enzymes, one by one
    });

    it('unticking a sub-group clears the tests chosen one by one inside it', () => {
      render({ selectedCodes: ['SGOT', 'SGPT'] });
      checks()[SUB_ENZ].click();
      expect(testEvents).toEqual(['SGOT', 'SGPT']);
      expect(pkgEvents).toEqual([]);
    });
  });

  it('a test is added by its own checkbox exactly as before', () => {
    render();
    el.querySelectorAll<HTMLButtonElement>('.dcp__node')[2].click();
    fixture.detectChanges();
    el.querySelectorAll<HTMLButtonElement>('.dcp__row')[0].click();
    expect(testEvents).toEqual(['SGOT']);
    expect(pkgEvents).toEqual([]);
  });

  it('a group with a test that cannot be booked: the checkbox covers only the bookable tests', () => {
    const blocked: DcTestGroup[] = [{
      id: 'G', name: 'Thyroid',
      subGroups: [{ id: 'G-S', name: 'Hormones', tests: [t('TSH', 'TSH', 300), t('T3', 'T3', 200, false)] }],
    }];
    render({ groups: blocked });
    checks()[0].click();
    expect(pkgEvents).toEqual([]);              // never a package: the API would refuse the unbookable test
    expect(testEvents).toEqual(['TSH']);
  });

  it('a group with nothing bookable has a disabled checkbox', () => {
    const none: DcTestGroup[] = [{
      id: 'G', name: 'Thyroid', subGroups: [{ id: 'G-S', name: 'Hormones', tests: [t('T3', 'T3', 200, false)] }],
    }];
    render({ groups: none });
    expect(checks()[0].disabled).toBe(true);
  });

  it('shows the server\'s breakdown: regular price, discount, final price and savings', () => {
    render({ promos: [PROMO], packages: [{ type: 'Group', id: 'LFT', name: 'Liver Function Profile' }], plan: planFor() });
    const bill = el.querySelector('.dcp__bill')!.textContent!.replace(/\s+/g, '');
    expect(bill).toContain('Regularprice₹1,500');
    expect(bill).toContain('Promotionaldiscount−₹501');
    expect(bill).toContain('Finalprice₹999');
    expect(bill).toContain('Yousave₹501');
    expect(bill).toContain('Includes4:SGOT,SGPT,TotalBilirubin,DirectBilirubin');
    expect(text()).toContain('4 tests · you pay ₹999');
  });

  it('explains an overlap in words', () => {
    const overlap = planFor({
      notices: ['SGOT is already included in Liver Function Profile, so you are not charged for it again.'],
      lines: [
        ...planFor().lines,
        { type: 'Test', id: 'SGOT', name: 'SGOT', tests: [], regularPrice: 0, chargedPrice: 0, savings: 0, alreadyIncluded: true },
      ],
    });
    render({ packages: [{ type: 'Group', id: 'LFT', name: 'Liver Function Profile' }], plan: overlap });
    expect(el.querySelector('.dcp__notes')!.textContent).toContain('SGOT is already included in Liver Function Profile');
    expect(el.querySelector('.dcp__billline--inc')!.textContent).toContain('Already included above');
    expect(picker.coveredBy('SGOT')).toBe('Liver Function Profile');
    expect(picker.coveredBy('CBC')).toBe('');
  });

  it('Done stays disabled until the server has priced the choice', () => {
    const done = () => el.querySelector<HTMLButtonElement>('.dc-btn--save')!;

    render();
    expect(done().disabled).toBe(true);
    render({ packages: [{ type: 'Group', id: 'LFT', name: 'x' }], plan: null, quoting: true });
    expect(done().disabled).toBe(true);
    render({ packages: [{ type: 'Group', id: 'LFT', name: 'x' }], plan: planFor(), quoting: false });
    expect(done().disabled).toBe(false);
    render({ plan: { ...planFor(), success: false, error: 'Group \'Z\' was not found.' } });
    expect(done().disabled).toBe(true);
  });

  it('a removable tag per chosen group, and removing it emits that group', () => {
    const p = pkg('Group', 'LFT', 'Liver Function Profile');
    render({ packages: [p], plan: planFor() });
    el.querySelector<HTMLButtonElement>('.dcp__tag--pkg button')!.click();
    expect(pkgEvents).toEqual([p]);
  });

  it('a test with its own offer shows the offer price on its row', () => {
    render({
      promos: [{ ...PROMO, promotionId: 2, title: 'Haem week', targetType: 'Test', targetId: 'CBC', regularPrice: 200, promoPrice: 150, savings: 50 }],
      openGroupId: 'HAEM', openSubGroupId: 'HAEM-S',
    });
    const row = el.querySelector('.dcp__row')!;
    expect(row.querySelector('s')!.textContent).toContain('₹200');
    expect(row.textContent).toContain('₹150');
    expect(row.textContent).toContain('Haem week');
  });
});

describe('BookingSummaryComponent', () => {
  let fixture: ComponentFixture<BookingSummaryComponent>;
  // Label and value sit in separate cells, so compare with all whitespace removed.
  const text = () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, '');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [BookingSummaryComponent] });
    fixture = TestBed.createComponent(BookingSummaryComponent);
  });

  it('renders nothing until a successful plan exists', () => {
    fixture.detectChanges();
    expect(text().trim()).toBe('');
  });

  it('shows what is being booked, the totals and the final amount', () => {
    fixture.componentInstance.plan = planFor();
    fixture.detectChanges();
    expect(text()).toContain('LiverFunctionProfile');
    expect(text()).toContain('Wholegroup');
    expect(text()).toContain('Totaltests4');
    expect(text()).toContain('Regularprice₹1,500');
    expect(text()).toContain('Promotionaldiscount−₹501');
    expect(text()).toContain('Finalamountpayable₹999');
    expect(text()).toContain('Totalsavings₹501');
  });

  it('applies the manual discount % to the price AFTER the offer', () => {
    fixture.componentInstance.plan = planFor();
    fixture.componentInstance.discountPercent = 10;
    fixture.detectChanges();
    // 10% of 999 = 99.9; 999 - 99.9 = 899.1  (not 10% of 1500)
    expect(fixture.componentInstance.manualAmount).toBeCloseTo(99.9, 2);
    expect(fixture.componentInstance.final).toBeCloseTo(899.1, 2);
    expect(fixture.componentInstance.totalSavings).toBeCloseTo(600.9, 2);
    expect(text()).toContain('Extradiscount(10%)−₹99.9');
    expect(text()).toContain('Finalamountpayable₹899.1');
  });

  it('shows no discount lines when there is no offer', () => {
    fixture.componentInstance.plan = planFor({ promotionDiscount: 0, payableAfterPromotion: 1500, lines: [] });
    fixture.detectChanges();
    expect(text()).not.toContain('Promotionaldiscount');
    expect(text()).not.toContain('Totalsavings');
    expect(text()).toContain('Finalamountpayable₹1,500');
  });
});
