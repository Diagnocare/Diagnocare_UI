/**
 * Authentication feature flags.
 * ─────────────────────────────────────────────────────────────────────────────
 * One place to turn an auth mechanism off without unpicking the code that
 * implements it. Everything behind a `false` flag must be inert: no HTTP calls,
 * no modals, no navigation, no changes to auth state.
 *
 * A mutable object rather than separate `const` booleans so that specs can flip
 * a flag for the duration of a test (`authFeatures.pinGatedRefresh = true`) and
 * keep covering the code paths that ship disabled. Application code only ever
 * reads these.
 */
export const authFeatures = {
  /**
   * Fingerprint / WebAuthn sign-in (registration, assertion, the Settings
   * enrolment panel, and "Fingerprint" as a preferred login method).
   *
   * OFF for now: the feature is built but not in use. While it is off,
   * FingerprintService is never called — so it cannot fire requests, raise
   * errors, navigate, or touch the session — and a user whose stored
   * `loginType` is still Fingerprint (4) falls back to the OTP dialog instead
   * of being stranded on a WebAuthn prompt that will not come.
   *
   * To re-enable: set this to true. Nothing else needs changing.
   */
  fingerprint: false,

  /**
   * PIN gate on token refresh in AuthInterceptor.
   *
   * ON  — an expired token (or a 401) opens the PIN modal, and the token is
   *       only refreshed once the PIN is verified; with no PIN set, the
   *       "Set Up a PIN" modal appears and "Go to Settings" sends the user to
   *       PIN setup.
   * OFF — the interceptor refreshes and retries directly, and a refused
   *       refresh redirects to /login. The plain, expected behaviour.
   *
   * OFF for now: with no PIN configured, every expired token turned into the
   * setup modal and the error "PIN not set up yet — navigated to Settings,
   * session kept", which masked the real cause — the API declines to refresh a
   * token expired past the lab's grace buffer (Pathology.GraceBufferMinutes,
   * Lab Setup → "PIN Grace Buffer").
   *
   * Before switching this back on: that setting is the server-side half of the
   * same switch, and the interceptor does not read it. At 0 it means "no PIN
   * re-authentication, redirect to login on expiry" and RefreshToken returns
   * 401 for any expired token — so a PIN prompt there asks the user for
   * something that cannot help. Gate the modal on
   * `tokenSvc.getGraceBufferMinutes() > 0` for an expired token, or the same
   * dead-end prompt comes back for every lab that leaves the buffer at 0.
   *
   * This covers the interceptor only. The idle screen lock (SessionLockService)
   * and PIN expiry guard are separate deliberate prompts and still work, as do
   * the Session PIN controls in Settings.
   */
  pinGatedRefresh: false,
};
