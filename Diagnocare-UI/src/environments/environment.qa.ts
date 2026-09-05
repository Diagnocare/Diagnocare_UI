import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  diagnocareApiURL: 'http://diagnocare-qaapi:83/',
  // Tenant subdomains hang off this domain; TenantService parses against it (§19).
  baseDomain: 'diagnocare-qa.com',
  // Hosts with no tenant subdomain (preview builds) assume this laboratory.
  devTenantKey: 'pankaj',
  loginUIUrl: 'http://diagnocare-qa:82/',
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'qa',
  // Never enabled outside local development.
  devSkipSecondFactor: false,

  basicAuth: {
    username: 'Admin',
    password: 'ggDgc+q0Y4xNWOadnfALUOEEi/ijWn4I0fd06Keor5Y=',
  },
};
