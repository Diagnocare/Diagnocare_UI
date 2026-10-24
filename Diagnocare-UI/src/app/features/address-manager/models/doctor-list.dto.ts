/** DTO representing a doctor in list responses */
export interface DoctorListDto {
  id: number;
  name: string;
  qualification: string;
  position: string;
  signatureBase64?: string;
  pathologyId?: string;
}
