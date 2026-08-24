import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  // Dev SERVER API — must be reachable from client browsers on the dev network.
  // (Was 'https://localhost:44346/', which only works on a machine running the
  // API locally, so the deployed dev-server build hung on every other browser.)
  // diagnocareApiURL: 'https://localhost:44346/',
  // For local development against a locally-running API, temporarily switch to:
  diagnocareApiURL: 'http:diagnocareDevAPI:81/',
  loginUIUrl: 'http://diagnocaredev/',
  // Help / feedback system (issue + suggestion submission portal).
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'dev',
  // Local `ng serve` — skip the OTP step (localhost only; see environment.model.ts).
  // The deployed dev server is not localhost, so it still requires the second factor.
  devSkipSecondFactor: true,

  basicAuth: {
    username: 'Admin',
    password: 'ggDgc+q0Y4xNWOadnfALUOEEi/ijWn4I0fd06Keor5Y=',
  },
};
