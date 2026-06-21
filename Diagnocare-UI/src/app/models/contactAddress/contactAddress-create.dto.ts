/** DTO used when creating a new contact/address */
export interface ContactAddressCreateDto {
  name: string;
  institutionType: number;
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
  commissionPercentage?: number | null;
}
