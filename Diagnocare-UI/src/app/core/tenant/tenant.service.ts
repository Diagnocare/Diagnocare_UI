import { Injectable, signal } from '@angular/core';
import { environment } from 'src/environments/environment';
import { isReservedSubdomain } from './reserved-subdomains';

/**
 * Resolves which laboratory this browser tab is for (§19).
 *
 * ── What was wrong before ────────────────────────────────────────────────────
 * The original parser counted dots:
 *
 *     return parts.length >= 3 ? parts[0] : '';
 *
 * That breaks on hosts this project actually uses. `diagnocare-ui.vercel.app` has three parts,
 * so it returned `diagnocare-ui` as a tenant key — and that host is live in appsettings under
 * App:SignInUrl. Every Vercel preview URL had the same problem. `www.diagnocare.com` returned
 * `www`. `localhost:4200` returned empty, so local development had no tenant at all.
 *
 * ── What it does now ─────────────────────────────────────────────────────────
 * Parses against a CONFIGURED base domain. A host that is not `<label>.<baseDomain>` has no
 * tenant, full stop.
 *
 * ── What this value is, and is not ───────────────────────────────────────────
 * It is a UI convenience. It selects branding and populates the `X-Tenant-Key` header. It
 * authorises NOTHING: the API independently resolves the tenant and asserts it against the
 * signed token (§6). A user who edits it sees a different login screen and gets 403 on
 * anything that matters.
 *
 * A null key means "no tenant" — render the tenant picker or redirect to marketing. Never fall
 * back to a default laboratory.
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly baseDomain = (environment.baseDomain ?? '').trim().toLowerCase();

  /** Resolved once at construction: the host cannot change without a page load. */
  private readonly _tenantKey = signal<string | null>(this.resolve());

  readonly tenantKey = this._tenantKey.asReadonly();

  /** True when this tab is serving a laboratory rather than the marketing site or a preview build. */
  get hasTenant(): boolean {
    return this._tenantKey() !== null;
  }

  getTenantKey(): string | null {
    return this._tenantKey();
  }

  private resolve(): string | null {
    const host = window.location.hostname.toLowerCase();

    // ── Non-production escape hatch ──────────────────────────────────────────
    // localhost and Vercel preview builds have no tenant subdomain, so allow an explicit
    // override via ?tenant= or environment.devTenantKey. Compiled out of production by the
    // `production` guard, which is a build-time constant — so the branch is removed entirely
    // rather than merely unreachable.
    if (!environment.production) {
      const override =
        new URLSearchParams(window.location.search).get('tenant') ??
        environment.devTenantKey;

      if (override) return override.trim().toLowerCase();
    }

    if (!this.baseDomain) return null;
    if (host === this.baseDomain) return null;
    if (!host.endsWith(`.${this.baseDomain}`)) return null;

    const label = host.slice(0, -(this.baseDomain.length + 1));

    // No nested subdomains: `pankaj.staging.diagnocare.com` is an environment host, not a
    // tenant of the production base domain (§16).
    if (label.includes('.')) return null;
    if (isReservedSubdomain(label)) return null;

    return label;
  }
}
