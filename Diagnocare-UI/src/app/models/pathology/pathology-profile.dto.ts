/**
 * Lab profile: identity + license summary sourced from the shared PathologyManager
 * API, merged with fields that live only in this lab's own database. Returned by
 * GET Pathology/GetProfile. Deliberately has NO raw license key field — only
 * status/expiry are ever sent here, so nothing sensitive ends up in the client-side
 * cache (see PathologyProfileCacheService).
 */
export interface PathologyProfileDto {
  // ── From the shared PathologyManager API ──────────────────────────────
  path_Name: string;
  path_Code: string;
  path_Category: string;
  path_Branch: string;
  path_Address1: string;
  path_Address2?: string | null;
  path_City: string;
  path_State: string;
  path_Country: string;
  path_Pincode: string;
  path_ContactNo: string;
  path_Email: string;

  license_Type: string;
  /** e.g. "Active" / "Expired", as reported by the shared API. */
  license_Status: string;
  license_IsActive: boolean;
  license_IsExpired: boolean;
  /** ISO yyyy-MM-dd, or null if unknown. */
  license_ExpiryDate?: string | null;
  license_DaysRemaining: number;

  /** False when the shared API was unreachable and these fields are a local fallback. */
  sourcedFromSharedApi: boolean;

  /** Shared profile version — compared against GetProfileVersion to decide re-fetch. */
  version: number;

  // ── Local-only fields (this lab's own database) ────────────────────────
  path_AltContactNo?: string | null;
  path_Website?: string | null;
  path_Motto?: string | null;
  path_Tagline?: string | null;
  path_GSTNo?: string | null;
  path_PANNo?: string | null;
  path_RegNo?: string | null;
  path_NABLNo?: string | null;
  path_DirectorName?: string | null;
  path_LabInCharge?: string | null;
  path_ReportHeader?: string | null;
  path_ReportFooter?: string | null;
  path_SignatoryName?: string | null;
  path_CountryCode?: string | null;
  path_Currency?: string | null;

  graceBufferMinutes: number;
  maxDiscountPercent: number;
  sessionLockoutMinutes: number;
  templateId?: number | null;

  /** Base64-encoded logo image (no data-URI prefix), or null. */
  path_Logo?: string | null;
}
