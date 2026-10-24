import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  diagnocareApiURL: 'https://diagnocare-prod.runasp.net/',
  // Tenant subdomains hang off this domain; TenantService parses against it (§19).
  baseDomain: 'diagnocare.com',
  // Local/preview hosts carry no tenant subdomain — assume this laboratory there.
  devTenantKey: null,
  loginUIUrl: 'https://diagnocare-ui.vercel.app/',
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'diagnocare-web',
  envName: 'prod',

};
