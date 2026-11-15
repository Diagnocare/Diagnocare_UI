/**
 * Subdomains that are never a tenant (§18).
 *
 * The authoritative list lives in the registry (`ReservedSubdomains` in Diagnocare_Master), so
 * it can be extended without a deploy. This copy exists only so the browser can decide, before
 * any network call, that `www.diagnocare.com` is not a laboratory — otherwise the marketing
 * site would spend a request discovering it is not a tenant, and would flash a login screen
 * while doing it.
 *
 * Keep it in sync with the seed in scripts/master-database.sql. Divergence is safe in one
 * direction only: a label missing here is caught by the API; a label wrongly listed here makes
 * a real laboratory unreachable from the browser.
 */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'admin', 'api', 'app', 'assets', 'billing', 'blog',
  'cdn', 'dashboard', 'demo', 'dev', 'docs', 'files',
  'help', 'login', 'mail', 'media', 'portal', 'reports',
  'report', 'smtp', 'ssl', 'staging', 'static', 'status',
  'support', 'test', 'uat', 'webmail', 'www',
]);

/** Reserved by rule rather than by name: anything ending "-api", and any single character. */
export function isReservedSubdomain(label: string): boolean {
  const normalised = label.trim().toLowerCase();
  if (normalised.length <= 1) return true;
  if (normalised.endsWith('-api')) return true;
  return RESERVED_SUBDOMAINS.has(normalised);
}
