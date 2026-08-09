import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  diagnocareApiURL: 'http://diagnocare-qaapi:83/',
  loginUIUrl: 'http://diagnocare-qa:82/',
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'qa',
  basicAuth: {
    username: 'Admin',
    password: 'ggDgc+q0Y4xNWOadnfALUOEEi/ijWn4I0fd06Keor5Y=',
  },
};
