export type HomeNavState =
  | 'unregistered'  // no pathology in DB → show Register
  | 'extend'        // registered, expiry ≤ 15 days → show Extend
  | 'registered';
