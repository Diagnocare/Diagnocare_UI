/** DTO used when updating pathology details */
export interface PathologyEditDto {
  // ── Core identity ──────────────────────────────────────────────────
  id?: number;
  path_Name?: string;
  path_Branch?: string;
  path_Motto?: string;         // Tagline / motto shown on reports and portal
  path_Tagline?: string;       // Short marketing tagline (optional alt field)
  path_Logo?: string | File | null;

  // ── Address ────────────────────────────────────────────────────────
  path_Address1?: string;
  path_Address2?: string;
  path_City?: string;
  path_State?: string;
  path_Country?: string;
  path_Pincode?: string;

  // ── Contact ────────────────────────────────────────────────────────
  path_ContactNo?: string;
  path_AltContactNo?: string;  // Secondary / landline number
  path_Email?: string;
  path_Website?: string;

  // ── Legal & compliance ─────────────────────────────────────────────
  path_GSTNo?: string;         // GST registration number
  path_PANNo?: string;         // PAN number
  path_RegNo?: string;         // Lab registration / PCPNDT number
  path_NABLNo?: string;        // NABL accreditation number

  // ── People ─────────────────────────────────────────────────────────
  path_DirectorName?: string;  // Lab owner / director name
  path_LabInCharge?: string;   // Lab in-charge / manager

  // ── Report branding ────────────────────────────────────────────────
  path_ReportHeader?: string;  // Custom text printed at top of every report
  path_ReportFooter?: string;  // Custom text printed at bottom of every report
  path_SignatoryName?: string; // Default signatory printed on reports

  // ── Regional settings ─────────────────────────────────────────────
  path_CountryCode?: string;   // Dialling code, e.g. +91
  path_Currency?: string;      // Currency symbol / code, e.g. INR, ₹

  // ── Misc ───────────────────────────────────────────────────────────
  date_of_Registration?: string;
}
