import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  diagnocareApiURL: 'https://diagnocare-uat.runasp.net/',
  // Tenant subdomains hang off this domain; TenantService parses against it (§19).
  baseDomain: 'diagnocare-staging.com',
  // Hosts with no tenant subdomain (preview builds) assume this laboratory.
  devTenantKey: 'pankaj',
  loginUIUrl: 'https://diagnocare-ui.vercel.app/',
  // Help / feedback system (issue + suggestion submission portal).
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'uat',
  // Never enabled outside local development.
  devSkipSecondFactor: false,

  basicAuth: {
    username: 'Admin_Uat',
    password: 'JYWZFCEHZeQmz+3HNQaOeLMJApJdCC4aPLB6iFNySBbGQmp+/HCe8NRpj9SL5CCO',
  },
};
