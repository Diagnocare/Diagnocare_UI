import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  diagnocareApiURL: 'https://diagnocare-uat.runasp.net/',
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
