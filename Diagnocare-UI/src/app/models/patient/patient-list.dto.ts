/** DTO representing a single row in the Patient list view. */
export interface PatientListDto {
  serial_Number: number;
  patient_Id: string;
  patient_Salutation: string;
  patient_Name: string;
  patient_DOB: string;
  /** Full age string from API, e.g. "36 years 7 months 2 days" */
  patient_Age: string;
  patient_Age_Group: string;
  patient_Gender: string;
  patient_Marital_Status: string;
  patient_Address: string;
  relation: string;
  relative_Name: string;
  patientDialingContact: string;
  patient_Email: string;
  patient_Reg_Date: string;
  lstPatientTests: any;     // nested test summary — kept as any to avoid circular imports
  isUrgent: string;
  /** Mapped from API field testStatus */
  status: string;
}
