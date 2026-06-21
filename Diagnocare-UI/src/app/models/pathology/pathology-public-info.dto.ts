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
}
