/** Request DTO for extending an existing pathology licence */
export interface PathologyExtendLicenseDto {
  license_Type: 'Trial' | 'License';
  newExpiryDate: string;   // ISO date string yyyy-MM-dd
}

/** Response DTO after a successful licence extension */
export interface PathologyExtendLicenseResponseDto {
  success: boolean;
  message?: string;
  licenseKey?: string;
  date_of_Expiry?: string;
}
