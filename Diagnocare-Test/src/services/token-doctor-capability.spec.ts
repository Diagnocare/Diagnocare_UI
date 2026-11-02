import { TestBed } from '@angular/core/testing';

import { Role } from 'src/app/constant/enums';
import { TokenService } from 'src/app/core/interceptors/token.service';

/**
 * Reading the Doctor capability out of the JWT.
 *
 * The API issues the capability as a SECOND `role` claim, so that its existing
 * `RequireRole(..., Doctor)` policies keep working untouched. That means the `role`
 * claim is a string for most users and an ARRAY for a doctor-capable Super Admin —
 * and `parseInt(['Super_Admin','Doctor'], 10)` is NaN, `Role[array]` is undefined.
 * Before this was handled, such a user resolved to NO role at all: DEFAULT_ACCESS,
 * an empty sidebar, and every route guard refusing them. The owner locked out of
 * their own lab by ticking a checkbox.
 *
 * These build real tokens rather than stubbing decodeToken, because the shape of the
 * claim is the thing being tested.
 */
describe('TokenService — the Doctor capability', () => {

  let service: TokenService;

  /** An unsigned JWT with the given payload. Nothing here verifies signatures. */
  function tokenWith(payload: Record<string, unknown>): string {
    const b64 = (o: unknown) =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.sig`;
  }

  /** Signs the given principal in, as TokenProvider would have described them. */
  function signIn(roles: string | string[], isDoctor?: boolean): void {
    const payload: Record<string, unknown> = {
      sub: 'dr.kumar',
      role: roles,
      aud: Array.isArray(roles) ? roles[0] : roles,
      uid: '7',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    if (isDoctor) payload['isdoc'] = 'true';
    service.setToken(tokenWith(payload));
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [TokenService] });
    service = TestBed.inject(TokenService);
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  // ── Case 1: Super Admin, not a doctor ──────────────────────────────────────

  it('reads a plain Super Admin unchanged', () => {
    signIn('Super_Admin');

    expect(service.getUserRole()).toBe(Role.Super_Admin.id);
    expect(service.isSuperAdmin()).toBe(true);
    expect(service.isAdmin()).toBe(true);
    expect(service.isDoctor()).toBe(false);
    expect(service.getUserRoles()).toEqual([Role.Super_Admin.id]);
  });

  // ── Case 2: plain Doctor ───────────────────────────────────────────────────

  it('reads a Doctor by role', () => {
    signIn('Doctor', true);

    expect(service.getUserRole()).toBe(Role.Doctor.id);
    expect(service.isDoctor()).toBe(true);
    expect(service.isSuperAdmin()).toBe(false);
    expect(service.isAdmin()).toBe(false);
  });

  // ── Case 3: Super Admin + Doctor ───────────────────────────────────────────

  it('resolves the PRIMARY role from an array claim', () => {
    signIn(['Super_Admin', 'Doctor'], true);

    // Not Doctor. The primary role decides the landing route and the role badge; a
    // Super Admin who also practises still lands and reads as a Super Admin.
    expect(service.getUserRole()).toBe(Role.Super_Admin.id);
  });

  it('keeps every Super Admin check true for a doctor-capable Super Admin', () => {
    signIn(['Super_Admin', 'Doctor'], true);

    expect(service.isSuperAdmin()).toBe(true);
    expect(service.isAdmin()).toBe(true);
    expect(service.hasRole(Role.Super_Admin.id)).toBe(true);
  });

  it('reports the Doctor capability', () => {
    signIn(['Super_Admin', 'Doctor'], true);

    expect(service.isDoctor()).toBe(true);
    expect(service.getUserRoles()).toEqual([Role.Super_Admin.id, Role.Doctor.id]);
  });

  it('does not widen hasRole() to the Doctor role', () => {
    signIn(['Super_Admin', 'Doctor'], true);

    // Deliberate: several callers use hasRole(Doctor) to mean "a plain Doctor, so skip
    // something doctors cannot reach" — patient-test-list skips loading the patient's
    // contact number because the API denies Doctors patient records. A doctor-capable
    // Super Admin CAN read them, so widening this would take a working feature away.
    expect(service.hasRole(Role.Doctor.id)).toBe(false);
    // The capability is asked for by name instead.
    expect(service.isDoctor()).toBe(true);
  });

  // ── The capability is the server's answer, not the client's ────────────────

  it('ignores a role claim that merely mentions Doctor without the capability claim', () => {
    // isDoctor() reads only `isdoc`, which the server sets. There is no client-side
    // derivation to disagree with it.
    signIn(['Super_Admin', 'Doctor']);

    expect(service.isDoctor()).toBe(false);
  });

  it('reports no role and no capability when there is no token', () => {
    expect(service.getUserRole()).toBeNull();
    expect(service.getUserRoles()).toEqual([]);
    expect(service.isDoctor()).toBe(false);
    expect(service.isSuperAdmin()).toBe(false);
  });

  // ── Legacy claim shapes ────────────────────────────────────────────────────

  it('still accepts a numeric role claim', () => {
    signIn(String(Role.Super_Admin.id));

    expect(service.getUserRole()).toBe(Role.Super_Admin.id);
  });

  it('still accepts a role claim given as a display label', () => {
    signIn(Role.Collection_Boy.label);

    expect(service.getUserRole()).toBe(Role.Collection_Boy.id);
  });
});
