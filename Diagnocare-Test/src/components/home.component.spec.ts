import { TestBed }  from '@angular/core/testing';
import { NEVER, of, throwError } from 'rxjs';
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

  // The component now seeds itself from a localStorage snapshot, so each test has to
  // start from a known-empty cache — otherwise one test's response leaks into the next.
  beforeEach(() => localStorage.clear());
  afterEach(() => TestBed.resetTestingModule());

  it('starts in "registered" state so the Login link renders on the first frame', () => {
    const pathSvc = { getPublicInfo: jest.fn().mockReturnValue(of(null)) };
    const component = createComponent(pathSvc);
    // Before ngOnInit — and therefore before any HTTP call — the navbar already has a CTA.
    expect(component.navState).toBe('registered');
  });

  // ── first-paint behaviour ──────────────────────────────────────────────────

  describe('registration snapshot cache', () => {
    it('applies the cached snapshot before the server responds', () => {
      // Response never arrives, so whatever state is set must have come from the cache.
      const pathSvc = { getPublicInfo: jest.fn().mockReturnValue(NEVER) };
      localStorage.setItem(
        'diagnocare_pathology_registration_cache',
        JSON.stringify({ data: { isRegistered: false }, fetchedAt: Date.now() }));

      const component = createComponent(pathSvc);
      component.ngOnInit();

      expect(component.navState).toBe('unregistered');
    });

    it('caches the server response for the next load', () => {
      const info = { isRegistered: true, date_of_Expiry: isoDateOffsetDays(30) };
      const component = createComponent(mockPathologyService(info));

      component.ngOnInit();

      const raw = localStorage.getItem('diagnocare_pathology_registration_cache');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).data).toEqual(
        { isRegistered: true, date_of_Expiry: info.date_of_Expiry });
    });

    it('recomputes daysLeft from the cached expiry date rather than reusing a stored count', () => {
      const expiry = isoDateOffsetDays(3);
      const pathSvc = { getPublicInfo: jest.fn().mockReturnValue(NEVER) };
      localStorage.setItem(
        'diagnocare_pathology_registration_cache',
        JSON.stringify({ data: { isRegistered: true, date_of_Expiry: expiry }, fetchedAt: Date.now() }));

      const component = createComponent(pathSvc);
      component.ngOnInit();

      expect(component.navState).toBe('extend');
      expect(component.daysLeft).toBeLessThanOrEqual(3);
    });
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
    it('defaults to "unregistered" on error when nothing is cached', () => {
      const pathSvc = { getPublicInfo: jest.fn().mockReturnValue(throwError(() => new Error('Network error'))) };
      const component = createComponent(pathSvc);

      component.ngOnInit();

      expect(component.navState).toBe('unregistered');
    });

    it('keeps the cached state on error rather than offering to register again', () => {
      const pathSvc = { getPublicInfo: jest.fn().mockReturnValue(throwError(() => new Error('Network error'))) };
      localStorage.setItem(
        'diagnocare_pathology_registration_cache',
        JSON.stringify({ data: { isRegistered: true }, fetchedAt: Date.now() }));

      const component = createComponent(pathSvc);
      component.ngOnInit();

      expect(component.navState).toBe('registered');
    });
  });

  // ── currentYear ────────────────────────────────────────────────────────────

  it('sets currentYear to the current year', () => {
    const pathSvc = mockPathologyService({ isRegistered: false });
    const component = createComponent(pathSvc);

    expect(component.currentYear).toBe(new Date().getFullYear());
  });
});
