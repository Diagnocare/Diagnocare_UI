'use strict';

/**
 * Mints the demo session JWT used for recording.
 *
 * The frontend never verifies a JWT signature — only the API does, and during recording
 * the API is the local mock. So this signs with a throwaway secret purely to produce a
 * structurally valid token. It is a demo credential for a local recording and grants
 * nothing anywhere: it is not accepted by any real DiagnoCare environment.
 *
 * Claims are the ones the application actually reads:
 *   role → role, which roleGuard checks via TokenService.getUserRole(). Accepts a
 *          numeric id, a Role key or a Role label; the label is used here.
 *   sub  → username   (ProfileComponent, ChangePasswordComponent)
 *   aud  → role label (post-login landing route)
 *   typ  → pathologyId (ManageTestsComponent and most list calls)
 *
 * `role` is the one that is easy to miss: without it getUserRole() returns null and
 * every role-guarded route bounces to /access-denied.
 */

const crypto = require('node:crypto');

const DEMO_SECRET = 'tutorial-recording-only-not-a-real-key';

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mintDemoToken({ userName = 'demo.admin', role = 'Admin', pathologyId = 'PATH-001',
                         ttlSeconds = 8 * 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    role,
    sub: userName,
    aud: role,
    typ: pathologyId,
    name: 'Demo Admin',
    email: 'demo.admin@example.com',
    iss: 'diagnocare-tutorial-mock',
    iat: now,
    nbf: now,
    exp: now + ttlSeconds,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', DEMO_SECRET).update(signingInput).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${signingInput}.${signature}`;
}

module.exports = { mintDemoToken, DEMO_SECRET };
