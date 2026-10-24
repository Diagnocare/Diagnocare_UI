/** DTO used when creating a doctor */
export interface DoctorCreateDto {
  name: string;
  qualification: string;
  position: string;
  signatureBase64?: string;
  pathologyId?: string;
}
