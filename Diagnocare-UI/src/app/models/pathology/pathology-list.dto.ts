/** DTO representing pathology details returned by APIs */
export interface PathologyListDto {
  path_Id: string;
  path_Name: string;
  path_Branch:string;
  path_Address1:string;
  path_Address2?:string;
  path_City:string;
  path_State:string;
  path_Country:string;
  path_Pincode:string;
  path_ContactNo: string;
  path_Email:string;
  path_CountryCode?:string;
  path_Currency?:string;
  date_of_Registration: string;
  path_Logo?:string | File | null;
  date_of_Expiry: string;
  license_Type: string;
  total_Amount: string;
  amount_Paid: string;
  pending_Amount:string;
  paymentStatus?:string;
  pending_Amount_SMS_Sent?:boolean;
  id: number;
  createdBy: string;
  created:string;
  LastModifiedBy: string;
  LastModified:string;
  /** Grace buffer (minutes) stored as token_expiry_in_minutes in the DB.
   *  Within this window after JWT expiry, PIN re-authentication is offered
   *  instead of a full redirect to /login. */
  graceBufferMinutes?: number;
  licenseKey?: string;
}
