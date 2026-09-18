import { TestBed } from '@angular/core/testing';
import { TokenService } from './token.service';
import { Role } from 'src/app/constant/enums';

/**
 * Test JWTs — the TokenService uses jwtDecode which only base64-decodes the payload,
 * so the signature is irrelevant for unit tests.
 *
 * Payload contents:
 *   VALID_TOKEN:   sub=testuser, role=Admin,      exp=9999999999 (far future)
 *   EXPIRED_TOKEN: sub=olduser,  role=User,        exp=1000000000 (Sept 2001)
 *   NUMERIC_ROLE:  sub=user2,    role="3" (Admin), exp=9999999999
 *   LABEL_ROLE:    sub=user3,    role="Super Admin",exp=9999999999
 */
const VALID_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJ0ZXN0dXNlciIsInJvbGUiOiJBZG1pbiIsImV4cCI6OTk5OTk5OTk5OSwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIn0.' +
  'fakesig';

const EXPIRED_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJvbGR1c2VyIiwicm9sZSI6IlVzZXIiLCJleHAiOjEwMDAwMDAwMDB9.' +
  'fakesig';

const NUMERIC_ROLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJ1c2VyMiIsInJvbGUiOiIzIiwiZXhwIjo5OTk5OTk5OTk5fQ.' +
  'fakesig';

const SUPER_ADMIN_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  'eyJzdWIiOiJzdXBlciIsInJvbGUiOiJTdXBlcl9BZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.' +
  'fakesig';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TokenService);
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── Token storage ────────────────────────────────────────────────────────

  describe('setToken / getToken / hasToken / removeToken', () => {
    it('stores and retrieves a token', () => {
      service.setToken('mytoken');
      expect(service.getToken()).toBe('mytoken');
    });

    it('returns null when no token is stored', () => {
      expect(service.getToken()).toBeNull();
    });

    it('hasToken returns true when token is present', () => {
      service.setToken('mytoken');
      expect(service.hasToken()).toBeTrue();
    });

    it('hasToken returns false when no token is stored', () => {
      expect(service.hasToken()).toBeFalse();
    });

    it('removeToken clears the stored token', () => {
      service.setToken('mytoken');
      service.removeToken();
      expect(service.getToken()).toBeNull();
    });

    it('clearAuth removes the token', () => {
      service.setToken('mytoken');
      service.clearAuth();
      expect(service.hasToken()).toBeFalse();
    });

    it('removeToken does NOT clear cached pathology policy settings (survives logout)', () => {
      service.setGraceBufferMinutes(15);
      service.setMaxDiscountPercent(40);
      service.setSessionLockoutMinutes(20);

      service.removeToken();

      expect(service.hasCachedPolicies()).toBeTrue();
      expect(service.getGraceBufferMinutes()).toBe(15);
      expect(service.getMaxDiscountPercent()).toBe(40);
      expect(service.getSessionLockoutMinutes()).toBe(20);
    });
  });

  // ── Pathology policy cache ──────────────────────────────────────────────────

  describe('hasCachedPolicies', () => {
    it('returns false when nothing has been cached yet', () => {
      expect(service.hasCachedPolicies()).toBeFalse();
    });

    it('returns true once the grace buffer has been cached', () => {
      service.setGraceBufferMinutes(10);
      expect(service.hasCachedPolicies()).toBeTrue();
    });

    it('clearCachedPolicies resets all three cached values', () => {
      service.setGraceBufferMinutes(10);
      service.setMaxDiscountPercent(30);
      service.setSessionLockoutMinutes(15);

      service.clearCachedPolicies();

      expect(service.hasCachedPolicies()).toBeFalse();
      expect(service.getGraceBufferMinutes()).toBe(0);
      expect(service.getMaxDiscountPercent()).toBe(50);
      expect(service.getSessionLockoutMinutes()).toBe(30);
    });
  });

  // ── decodeToken ──────────────────────────────────────────────────────────

  describe('decodeToken', () => {
    it('decodes the stored token when no argument supplied', () => {
      service.setToken(VALID_TOKEN);
      const payload = service.decodeToken();
      expect(payload?.sub).toBe('testuser');
      expect(payload?.email).toBe('test@example.com');
    });

    it('decodes a token passed directly as argument', () => {
      const payload = service.decodeToken(VALID_TOKEN);
      expect(payload?.sub).toBe('testuser');
    });

    it('returns null when no token is stored and no argument given', () => {
      expect(service.decodeToken()).toBeNull();
    });

    it('returns null for a malformed token', () => {
      expect(service.decodeToken('not.a.valid.jwt')).toBeNull();
    });
  });

  // ── getUserId ────────────────────────────────────────────────────────────

  describe('getUserId', () => {
    it('returns the sub claim', () => {
      service.setToken(VALID_TOKEN);
      expect(service.getUserId()).toBe('testuser');
    });

    it('returns null when no token is stored', () => {
      expect(service.getUserId()).toBeNull();
    });
  });

  // ── getEmail ─────────────────────────────────────────────────────────────

  describe('getEmail', () => {
    it('returns the email claim', () => {
      service.setToken(VALID_TOKEN);
      expect(service.getEmail()).toBe('test@example.com');
    });

    it('returns null when no token is stored', () => {
      expect(service.getEmail()).toBeNull();
    });
  });

  // ── getUserRole ──────────────────────────────────────────────────────────

  describe('getUserRole', () => {
    it('resolves role from key name string (Admin)', () => {
      service.setToken(VALID_TOKEN); // role = "Admin"
      expect(service.getUserRole()).toBe(Role.Admin.id);
    });

    it('resolves role from numeric string ("3" → Admin)', () => {
      service.setToken(NUMERIC_ROLE_TOKEN); // role = "3"
      expect(service.getUserRole()).toBe(Role.Admin.id);
    });

    it('resolves role from key name Super_Admin', () => {
      service.setToken(SUPER_ADMIN_TOKEN); // role = "Super_Admin"
      expect(service.getUserRole()).toBe(Role.Super_Admin.id);
    });

    it('returns null when no token is stored', () => {
      expect(service.getUserRole()).toBeNull();
    });
  });

  // ── hasRole ──────────────────────────────────────────────────────────────

  describe('hasRole', () => {
    it('returns true when user has the specified role', () => {
      service.setToken(VALID_TOKEN); // Admin
      expect(service.hasRole(Role.Admin.id)).toBeTrue();
    });

    it('returns false when user does not have the specified role', () => {
      service.setToken(VALID_TOKEN); // Admin
      expect(service.hasRole(Role.Super_Admin.id)).toBeFalse();
    });

    it('returns true when user matches any of multiple supplied roles', () => {
      service.setToken(VALID_TOKEN); // Admin
      expect(service.hasRole(Role.Super_Admin.id, Role.Admin.id)).toBeTrue();
    });

    it('returns false when no token stored', () => {
      expect(service.hasRole(Role.Admin.id)).toBeFalse();
    });
  });

  // ── isAdmin / isSuperAdmin ────────────────────────────────────────────────

  describe('isAdmin / isSuperAdmin', () => {
    it('isAdmin returns true for Admin role', () => {
      service.setToken(VALID_TOKEN);
      expect(service.isAdmin()).toBeTrue();
    });

    it('isAdmin returns true for Super_Admin role', () => {
      service.setToken(SUPER_ADMIN_TOKEN);
      expect(service.isAdmin()).toBeTrue();
    });

    it('isSuperAdmin returns false for Admin role', () => {
      service.setToken(VALID_TOKEN);
      expect(service.isSuperAdmin()).toBeFalse();
    });

    it('isSuperAdmin returns true for Super_Admin role', () => {
      service.setToken(SUPER_ADMIN_TOKEN);
      expect(service.isSuperAdmin()).toBeTrue();
    });
  });

  // ── isTokenExpired ────────────────────────────────────────────────────────

  describe('isTokenExpired', () => {
    it('returns false for a valid non-expired token', () => {
      service.setToken(VALID_TOKEN);
      expect(service.isTokenExpired()).toBeFalse();
    });

    it('returns true for an expired token', () => {
      service.setToken(EXPIRED_TOKEN);
      expect(service.isTokenExpired()).toBeTrue();
    });

    it('returns true when no token is stored', () => {
      expect(service.isTokenExpired()).toBeTrue();
    });
  });

  // ── getTokenExpirationTime ────────────────────────────────────────────────

  describe('getTokenExpirationTime', () => {
    it('returns a positive value for a valid token', () => {
      service.setToken(VALID_TOKEN);
      expect(service.getTokenExpirationTime()).toBeGreaterThan(0);
    });

    it('returns 0 for an expired token', () => {
      service.setToken(EXPIRED_TOKEN);
      expect(service.getTokenExpirationTime()).toBe(0);
    });

    it('returns -1 when no token is stored', () => {
      expect(service.getTokenExpirationTime()).toBe(-1);
    });
  });
});
