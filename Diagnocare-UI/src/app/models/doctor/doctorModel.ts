// Interface representing a doctor in the system
export interface doctorModel {
  id: number; // Unique identifier for the doctor
  name: string; // Full name of the doctor
  qualification: string; // Qualification of the doctor
  position: string; // Position of the doctor
  signatureBase64: string; // Base64 encoded signature of the doctor
  pathologyId?: string; // Pathology ID (hidden, set from JWT)
}
