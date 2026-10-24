/** DTO used when editing an existing patient — matches backend camelCase response. */
export interface PatientEditDto {
  patientId: string;
  patientName: string;
  patientDOB: string;
  patientAge: string;
  patientAgeGroup?: string;
  patientGender: string;
  patientMaritalStatus: string;
  patientAddress: string;
  relation: string;
  relativeName: string;
  patientContact: string;
  patientEmail: string;
  referredBy?: string;
  referredByType?: string;
}
