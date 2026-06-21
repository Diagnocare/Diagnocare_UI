import { Auth0Client  } from '@auth0/auth0-spa-js';

export const auth0  = new Auth0Client({
  domain: 'https://dev-56eqv1583l7ct1gl.us.auth0.com', // your Okta domain
  clientId: 'KMzHTkmuB2gS3pgvyvyYWsslLxqOixNj',
  authorizationParams:{redirect_uri: window.location.origin + '/login'}
});
