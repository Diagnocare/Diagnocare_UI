/**
 * Shape every environment file must satisfy.
 *
 * Angular swaps `environment.ts` for `environment.<config>.ts` via the
 * `fileReplacements` entries in angular.json, so a build only ever type-checks the
 * ONE file belonging to the configuration being built. Without a shared contract,
 * adding a property to `environment.ts` compiles locally and then fails the first
 * time some other configuration is built — which is exactly how the uat build broke
 * on `appName` / `envName`.
 *
 * Annotating each file with this interface moves that failure to authoring time:
 * add a field here and every environment file that lacks it stops compiling
 * immediately, in the editor, regardless of which configuration is active.
 */
export interface AppEnvironment {
  production: boolean;

  /** Base URL of the Diagnocare API, including trailing slash. */
  diagnocareApiURL: string;

  /**
   * The registrable domain tenant subdomains hang off, e.g. 'diagnocare.com'.
   *
   * TenantService parses the tenant key against THIS rather than by counting dots. Counting
   * dots is what made the old parser return 'diagnocare-ui' as a tenant key for
   * diagnocare-ui.vercel.app, and 'www' for www.diagnocare.com (§19).
   *
   * Each environment has its own domain, and they are separate registrations rather than
   * sub-subdomains (§16) — a *.diagnocare.com certificate does not cover
   * pankaj.staging.diagnocare.com.
   */
  baseDomain: string;

  /**
   * LOCAL DEVELOPMENT ONLY — the tenant to assume when the host carries no subdomain
   * (localhost, a Vercel preview build). Overridable per tab with ?tenant=.
   *
   * Guarded by `production === false` in TenantService, so the branch is compiled out of a
   * production build rather than merely unreachable. Must be null in every deployed
   * production environment.
   */
  devTenantKey: string | null;

  /** Base URL of the login UI for this environment, including trailing slash. */
  loginUIUrl: string;

  /** Base URL of the feedback / help portal, including trailing slash. */
  helpUrl: string;

  /** Product name sent to the feedback portal as ?product=. */
  appName: string;

  /** Environment slug sent to the feedback portal as ?env= (local | dev | qa | uat | prod). */
  envName: string;

}
