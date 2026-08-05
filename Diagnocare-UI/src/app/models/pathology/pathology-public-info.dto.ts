/** Returned by the public (no-auth) endpoint to check registration status */
export interface PathologyPublicInfoDto {
  isRegistered: boolean;
  path_Id?: string;
  path_Name?: string;
  path_Branch?: string;
  path_Address1?: string;
  path_Address2?: string;
  path_City?: string;
  path_State?: string;
  path_Country?: string;
  path_Pincode?: string;
  path_ContactNo?: string;
  path_Email?: string;
  license_Type?: string;
  date_of_Expiry?: string;   // ISO date string yyyy-MM-dd

  // ── Live licence details (shared PathologyManager API) ──────────────────────
  // Present when the shared API could be reached (live or via the server-side cache).
  date_of_Registration?: string;   // ISO date string yyyy-MM-dd
  license_Status?: string;         // e.g. "Active" / "Expired"
  license_IsExpired?: boolean;
  license_IsActive?: boolean;
  license_DaysRemaining?: number;

  // ── Provenance / throttling ────────────────────────────────────────────────
  /** True when the licence details came from the shared API rather than local DB fallback. */
  sourcedFromSharedApi?: boolean;
  /** True when the shared data was served from the server-side cache, not a live call. */
  isFromCache?: boolean;
  /** True when a refresh was requested but the hourly quota was exhausted — cached values returned. */
  rateLimited?: boolean;
  /** Forced refreshes still available in the current hour window (max 5). */
  refreshesRemaining?: number;
}
