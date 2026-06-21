import { InstitutionType } from "src/app/constant/enums";

// Interface representing a contact/address entity (aligned with backend)
export interface ContactAddressModel {
  id?: number | null; // matches nullable Id in backend
  name: string;
  institutionType: InstitutionType;
  contactPerson?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  country?: string | null;
  pathologyId?: string | null;
  isActive?: boolean;
  /** Commission % to pay this referrer per patient (e.g. 10.5 = 10.5%). */
  commissionPercentage?: number | null;
}
