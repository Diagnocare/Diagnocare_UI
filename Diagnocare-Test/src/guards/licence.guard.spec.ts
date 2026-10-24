import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { Subject, of } from 'rxjs';

import { licenceGuard } from 'src/app/core/guards/licence.guard';
import { LicenceService } from 'src/app/core/services/licence.service';

/**
 * PERF-014: the guard must never hold a navigation waiting for the licence
 * endpoint (p90 6.25 s), and must still redirect an expired licence.
 */
describe('licenceGuard', () => {
  let licence: {
    isResolved: boolean;
    isExpired: boolean;
    load: jest.Mock;
  };
  let router: { url: string; createUrlTree: jest.Mock; navigateByUrl: jest.Mock };

  beforeEach(() => {
    licence = { isResolved: false, isExpired: false, load: jest.fn(() => of(undefined)) };
    router = {
      url: '/patients',
      createUrlTree: jest.fn((commands: string[]) => ({ tree: commands.join('/') })),
      navigateByUrl: jest.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: LicenceService, useValue: licence },
        { provide: Router, useValue: router },
      ],
    });
  });

  const run = (url: string) =>
    TestBed.runInInjectionContext(() =>
      licenceGuard({} as any, { url } as RouterStateSnapshot),
    );

  it('lets an exempt path through without touching the service', () => {
    expect(run('/settings')).toBe(true);
    expect(licence.load).not.toHaveBeenCalled();
  });

  it('treats a path with query params as its first segment', () => {
    expect(run('/licence-expired?from=login')).toBe(true);
    expect(licence.load).not.toHaveBeenCalled();
  });

  it('does not block the first navigation — returns true, not an observable', () => {
    const pending = new Subject<void>();
    licence.load.mockReturnValue(pending);

    expect(run('/patients')).toBe(true);
    expect(licence.load).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('redirects once a late answer says the licence has expired', () => {
    const pending = new Subject<void>();
    licence.load.mockReturnValue(pending);
    run('/patients');

    licence.isExpired = true;
    pending.next();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/licence-expired');
  });

  it('does not redirect if the user has moved to an exempt page meanwhile', () => {
    const pending = new Subject<void>();
    licence.load.mockReturnValue(pending);
    run('/patients');

    licence.isExpired = true;
    router.url = '/settings/theme';
    pending.next();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('does not redirect when the answer says the licence is live', () => {
    const pending = new Subject<void>();
    licence.load.mockReturnValue(pending);
    run('/patients');

    pending.next();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('decides synchronously once the licence is resolved — expired', () => {
    licence.isResolved = true;
    licence.isExpired = true;

    expect(run('/patients')).toEqual({ tree: '/licence-expired' });
    expect(licence.load).not.toHaveBeenCalled();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/licence-expired']);
  });

  it('decides synchronously once the licence is resolved — live', () => {
    licence.isResolved = true;

    expect(run('/patients')).toBe(true);
    expect(licence.load).not.toHaveBeenCalled();
  });
});
