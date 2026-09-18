/**
 * Feature flags for the Simple UI rollout.
 * ─────────────────────────────────────────────────────────────────────────────
 * The new screens are wired in alongside the old markup rather than replacing
 * it, so switching between them is one boolean and a page refresh — no branch
 * juggling, and no risk of losing a working screen to a half-finished one.
 *
 *   USE_NEW_UI = true   →  new test picker and payment panel
 *   USE_NEW_UI = false  →  the screens exactly as they are today
 *
 * Flip it, `ng serve`, and compare with the same patient and the same tests.
 *
 * When the new screens have been used in anger and you are happy with them,
 * delete this file and the `*ngIf="!useNewUi"` blocks that reference it. Until
 * then the old path stays reachable, which is the point.
 */
export const USE_NEW_UI = true;
