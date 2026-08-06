export const environment = {
  production: true,
  diagnocareApiURL: 'https://your-prod-api/',
  loginUIUrl: 'http://diagnocareprod/',
  helpUrl: 'https://feedback-system-rosy.vercel.app/',
  // Identifies this app + environment to the feedback portal (sent as
  // ?product=&env= on the help URL, so reports can be routed/filtered).
  appName: 'Diagnocare',
  envName: 'prod',
  basicAuth: {
    username: 'Admin',
    password: 'OwJ3dA38hJuNHsEBTxXju6JB5qAZNNiTvWDrnZOBSXY=',
  },
};
