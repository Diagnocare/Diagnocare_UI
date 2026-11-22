import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';

import { pinSetupGuard } from 'src/app/core/guards/pin-setup.guard';
import { routes } from 'src/app/app-routing.module';
import { PinService } from 'src/app/services/pinServices/pin.service';
import { PinModalService } from 'src/app/shared/pin-modal/pin-modal.service';
import { TokenService } from 'src/app/core/interceptors/token.service';

/**
 * A user sent to PIN setup must not be able to leave it by navigating elsewhere.
 * Settings is the only page open to them until a PIN is saved.
 */
describe('pinSetupGuard', () => {
  let hasPin: boolean;
  let userId: string | null;
  let screenLockConfigured: boolean;
  let router: { createUrlTree: jest.Mock };
  let pinModal: PinModalService;

  beforeEach(() => {
    sessionStorage.clear();
    hasPin = false;
    userId = 'reception1';
    screenLockConfigured = false;
    router = { createUrlTree: jest.fn((commands: string[], extras?: any) => ({ commands, extras })) };

    TestBed.configureTestingModule({
      providers: [
        PinModalService,
        { provide: PinService, useValue: { hasPin: () => hasPin } },
        { provide: TokenService, useValue: {
            getUserId: () => userId,
            isScreenLockConfigured: () => screenLockConfigured,
          } },
        { provide: Router, useValue: router },
      ],
    });
    pinModal = TestBed.inject(PinModalService);
  });

  afterEach(() => sessionStorage.clear());

  const run = (url: string) =>
    TestBed.runInInjectionContext(() => pinSetupGuard({} as any, { url } as RouterStateSnapshot));

  it('allows every route when no PIN setup is pending', () => {
    expect(run('/patients')).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('sends every other route back to PIN setup while setup is pending', () => {
    pinModal.beginPinSetup();

    for (const url of ['/patients', '/work?queue=to-collect', '/pathology', '/users/edit/7', '/change-pin']) {
      const result: any = run(url);
      expect(result).not.toBe(true);
      expect(result.commands).toEqual(['/settings']);
      expect(result.extras).toEqual({ queryParams: { setupPin: '1' } });
    }
  });

  it('allows the Settings page itself while setup is pending', () => {
    pinModal.beginPinSetup();
    expect(run('/settings?setupPin=1')).toBe(true);
    expect(run('/settings')).toBe(true);
  });

  it('does not treat a look-alike path as Settings', () => {
    pinModal.beginPinSetup();
    expect(run('/settings-export')).not.toBe(true);
  });

  it('survives a page refresh: the pending state is kept for the browser session', () => {
    pinModal.beginPinSetup();
    // A fresh service instance stands in for the app reloading.
    const reloaded = new PinModalService();
    expect(reloaded.isPinSetupPending).toBe(true);
  });

  it('restores normal navigation once a PIN is saved, and clears the pending state', () => {
    pinModal.beginPinSetup();
    hasPin = true;

    expect(run('/patients')).toBe(true);
    expect(pinModal.isPinSetupPending).toBe(false);
  });

  it('leaves the signed-out case to authGuard', () => {
    pinModal.beginPinSetup();
    userId = null;
    expect(run('/patients')).toBe(true);
  });

  describe('when the lab has a Screen Lock Timeout above 0', () => {
    beforeEach(() => { screenLockConfigured = true; });

    it('requires a user without a PIN to set one before opening any other page', () => {
      const result: any = run('/patients');
      expect(result.commands).toEqual(['/settings']);
      expect(result.extras).toEqual({ queryParams: { setupPin: '1' } });
      expect(pinModal.isPinSetupPending).toBe(true);
    });

    it('lets them reach the PIN setup page', () => {
      expect(run('/settings?setupPin=1')).toBe(true);
    });

    it('lets a user who already has a PIN go anywhere', () => {
      hasPin = true;
      expect(run('/patients')).toBe(true);
      expect(router.createUrlTree).not.toHaveBeenCalled();
    });
  });

  it('does not require a PIN when the lab has no Screen Lock Timeout (0 or not loaded)', () => {
    screenLockConfigured = false;
    expect(run('/patients')).toBe(true);
    expect(pinModal.isPinSetupPending).toBe(false);
  });

  it('is checked on navigation between pages, not only on entering the app', () => {
    const shell = routes.find(r => r.path === '' && r.children?.length);
    expect(shell?.canActivate).toContain(pinSetupGuard);
    expect(shell?.canActivateChild).toContain(pinSetupGuard);
  });
});
