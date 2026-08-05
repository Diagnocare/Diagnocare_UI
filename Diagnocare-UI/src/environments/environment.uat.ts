export const environment = {
  production: false,
  diagnocareApiURL: 'https://diagnocare-uat.runasp.net/',
  loginUIUrl: 'https://diagnocare-ui.vercel.app/',
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'uat',
  basicAuth: {
    username: 'Admin_Uat',
    password: 'JYWZFCEHZeQmz+3HNQaOeLMJApJdCC4aPLB6iFNySBbGQmp+/HCe8NRpj9SL5CCO',
  },
};
