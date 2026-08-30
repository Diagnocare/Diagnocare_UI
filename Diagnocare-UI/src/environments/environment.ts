import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  // Default/base environment. Same latent localhost bug as environment.development.ts
  // was fixed here too so any build that falls back to this file (no fileReplacement)
  // points at a reachable API rather than the developer's localhost.
  // diagnocareApiURL: 'http://diagnocareDevAPI:81/',
  // For local development against a locally-running API, temporarily switch to:
  diagnocareApiURL: 'https://localhost:44346/',
  loginUIUrl: 'http://diagnocaredev/',
  // Help / feedback system (issue + suggestion submission portal).
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'local',
  // Local `ng serve` — skip the OTP step (localhost only; see environment.model.ts).
  devSkipSecondFactor: true,

  basicAuth: {
    username: 'Admin',
    password: 'ggDgc+q0Y4xNWOadnfALUOEEi/ijWn4I0fd06Keor5Y=',
  },
};
