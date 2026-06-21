import { TestBed }  from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RouterModule }   from '@angular/router';

import { HomeComponent }   from 'src/app/component/login/home.component';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';

// ── Helpers ────────────────────────────────────────────────────────────────────

function mockPathologyService(info: object | null = null) {
  return {
    getPublicInfo: jest.fn().mockReturnValue(of(info)),
  };
}

function isoDateOffsetDays(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function createComponent(pathSvc: ReturnType<typeof mockPathologyService>) {
  TestBed.configureTestingModule({
    providers: [
      HomeComponent,
      { provide: PathologyService, useValue: pathSvc },
      { provide: RouterModule,     useValue: {} },
    ],
  });

  return TestBed.inject(HomeComponent);
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('HomeComponent', () => {

  afterEach(() => TestBed.resetTestingModule());

  it('starts in "loading" state', () => {
    const pathSvc = { getPublicInfo: jest.fn().mockReturnValue(of(null)) };
    const component = createComponent(pathSvc);
    // Before ngOnInit, state is loading
    expect(component.navState).toBe('loading');
  });

  // ── unregistered state ─────────────────────────────────────────────────────

  describe('when pathology is not registered', () => {
    it('sets navState to "unregistered"', () => {
      const pathSvc = mockPathologyService({ isRegistered: false });
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('unregistered');
    });

    it('sets navState to "unregistered" when info is null', () => {
      const pathSvc = mockPathologyService(null);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('unregistered');
    });
  });

  // ── registered state (no expiry concern) ──────────────────────────────────

  describe('when registered with expiry > 15 days', () => {
    it('sets navState to "registered"', () => {
      const info = { isRegistered: true, date_of_Expiry: isoDateOffsetDays(30) };
      const pathSvc = mockPathologyService(info);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('registered');
    });

    it('sets daysLeft to a value > 15', () => {
      const info = { isRegistered: true, date_of_Expiry: isoDateOffsetDays(30) };
      const pathSvc = mockPathologyService(info);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.daysLeft).toBeGreaterThan(15);
    });
  });

  // ── extend state (expiry ≤ 15 days) ───────────────────────────────────────

  describe('when registered with expiry ≤ 15 days', () => {
    it('sets navState to "extend" when 10 days left', () => {
      const info = { isRegistered: true, date_of_Expiry: isoDateOffsetDays(10) };
      const pathSvc = mockPathologyService(info);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('extend');
    });

    it('sets navState to "extend" when exactly 15 days left', () => {
      const info = { isRegistered: true, date_of_Expiry: isoDateOffsetDays(15) };
      const pathSvc = mockPathologyService(info);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('extend');
    });

    it('sets navState to "extend" when 0 days left (expired)', () => {
      const info = { isRegistered: true, date_of_Expiry: isoDateOffsetDays(0) };
      const pathSvc = mockPathologyService(info);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('extend');
    });

    it('populates expiryDisplay with a non-empty string', () => {
      const info = { isRegistered: true, date_of_Expiry: isoDateOffsetDays(5) };
      const pathSvc = mockPathologyService(info);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.expiryDisplay).toBeTruthy();
      expect(component.expiryDisplay.length).toBeGreaterThan(0);
    });
  });

  // ── registered with no expiry date ────────────────────────────────────────

  describe('when registered but no date_of_Expiry', () => {
    it('sets navState to "registered"', () => {
      const info = { isRegistered: true, date_of_Expiry: null };
      const pathSvc = mockPathologyService(info);
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('registered');
    });
  });

  // ── error handling ─────────────────────────────────────────────────────────

  describe('when API call fails', () => {
    it('defaults to "unregistered" on error', () => {
      const pathSvc = { getPublicInfo: jest.fn().mockReturnValue(throwError(() => new Error('Network error'))) };
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('unregistered');
    });
  });

  // ── currentYear ────────────────────────────────────────────────────────────

  it('sets currentYear to the current year', () => {
    const pathSvc = mockPathologyService({ isRegistered: false });
    const component = createComponent(pathSvc);

    expect(component.currentYear).toBe(new Date().getFullYear());
  });
});
