import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: true,
  diagnocareApiURL: 'https://diagnocare-prod.runasp.net/',
  loginUIUrl: 'https://diagnocare-ui.vercel.app/',
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'prod',
  // Never enabled outside local development.
  devSkipSecondFactor: false,

  basicAuth: {
    username: 'Admin',
    password: 'ggDgc+q0Y4xNWOadnfALUOEEi/ijWn4I0fd06Keor5Y=',
  },
};
