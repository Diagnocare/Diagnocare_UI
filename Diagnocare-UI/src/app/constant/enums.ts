export enum AuthType {
    Mobile = 1,
    Email = 2,
    AuthenticationApp = 3,
    Fingerprint = 4
}

// ─── Single unified role definition ───────────────────────────────────────────
export const Role = {
  User:           { id: 1 as const, label: 'User'           as const },
  Assistant:      { id: 2 as const, label: 'Assistant'      as const },
  Admin:          { id: 3 as const, label: 'Admin'          as const },
  Super_Admin:     { id: 4 as const, label: 'Super Admin'     as const },
  Collection_Boy: { id: 5 as const, label: 'Collection Boy' as const },
  Doctor:         { id: 6 as const, label: 'Doctor'         as const },
} as const;

/** Union of all numeric role IDs: 1 | 2 | 3 | 4 | 5 | 6 */
export type RoleId    = typeof Role[keyof typeof Role]['id'];
/** Union of all role label strings */
export type RoleLabel = typeof Role[keyof typeof Role]['label'];

export enum salutation{
    Mr='Mr.',
    Miss='Miss.',
    Mrs='Mrs.'
};

export enum gender { 
    Male = 'Male',
    Female = 'Female',
    Other = 'Other'
};
export enum maritalStatus { 
    Married = 'Married',
    Unmarried = 'Unmarried'
};

export enum relations {
  Son = 'S/O',
  Wife = 'W/O',
  Daughter='D/O',
  Other="Other"
};

export enum ageGroup {
  Infant="Infant",
  Minor = 'Minor',
  Adult = 'Adult',
  Senior='Senior'
};

export enum paymentType
{
  Full='Full',
  Partial='Partial',
  NoPayment='No Payment',
};

export enum paymentMode
{
  Cash='Cash',
  UPI='UPI',
  CreditCard='Credit Card',
  DebitCard='Debit Card',
  NetBanking='Net Banking',
  TPA='TPA'
};

export enum referredByType
{
  Lab='Lab',
  Doctor='Doctor',
  Self='Self',
  Other='Other'
};

export enum licenceFilter{
    Trial="Trial",
    License="License"
}

// Enum matching backend InstitutionType
export enum InstitutionType {
  Clinic = 1,
  Hospital = 2,
  Laboratory = 3,
  DiagnosticCenter = 4,
  Pharmacy = 5,
  Other = 6,
  Doctor = 7
}