/** DTO used when updating a doctor */
export interface DoctorEditDto {
  id: number;
  name: string;
  qualification: string;
  position: string;
  signatureBase64?: string;
  pathologyId?: string;
}
