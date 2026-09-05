import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { TenantService } from './tenant.service';

/**
 * What the API is willing to tell an unauthenticated visitor about a laboratory (§9).
 * Deliberately small: name, logo, colours, timezone, status. Nothing a competitor could
 * harvest by walking the subdomain space.
 */
export interface TenantConfig {
  tenantId: string;
  tenantKey: string;
  status: TenantStatus;
  labName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  timezone?: string | null;
  features: Record<string, boolean>;
}

export type TenantStatus =
  | 'Provisioning'
  | 'Active'
  | 'PastDue'
  | 'Suspended'
  | 'Expired'
  | 'Offboarding';

export interface TenantStatusInfo {
  tenantKey: string;
  status: TenantStatus;
  isUsable: boolean;
  validUntil?: string | null;
  gracePeriodEndsAt?: string | null;
}

/**
 * Loads the current laboratory's branding before the login screen renders, and applies it.
 *
 * Called from an APP_INITIALIZER so the login page never flashes generic branding and then
 * repaints. A failure here is not fatal: the application falls back to neutral branding and
 * lets the user log in, because a branding endpoint being down is not a reason nobody can work.
 */
@Injectable({ providedIn: 'root' })
export class TenantConfigService {
  private readonly http = inject(HttpClient);
  private readonly tenant = inject(TenantService);

  private readonly _config = signal<TenantConfig | null>(null);

  readonly config = this._config.asReadonly();
  readonly labName = computed(() => this._config()?.labName ?? 'Diagnocare');
  readonly logoUrl = computed(() => this._config()?.logoUrl ?? null);

  /** Feature flags come from the server; an unknown flag is false, never assumed on. */
  isEnabled(feature: string): boolean {
    return this._config()?.features?.[feature] === true;
  }

  load(): Observable<TenantConfig | null> {
    if (!this.tenant.hasTenant) {
      // No tenant on this host — the marketing site or a preview build. Nothing to load.
      return of(null);
    }

    return this.http
      .get<TenantConfig>(`${environment.diagnocareApiURL}api/v1/tenant/config`)
      .pipe(
        tap(config => {
          this._config.set(config);
          this.applyBranding(config);
        }),
        catchError(() => of(null)),
      );
  }

  status(): Observable<TenantStatusInfo | null> {
    if (!this.tenant.hasTenant) return of(null);

    return this.http
      .get<TenantStatusInfo>(`${environment.diagnocareApiURL}api/v1/tenant/status`)
      .pipe(catchError(() => of(null)));
  }

  private applyBranding(config: TenantConfig): void {
    if (config.primaryColor) {
      document.documentElement.style.setProperty('--dg-primary', config.primaryColor);
    }

    if (config.labName) {
      document.title = config.labName;
    }

    if (config.logoUrl) {
      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (favicon) favicon.href = config.logoUrl;
    }
  }
}
