import { PatientListDto } from "../patient/patient-list.dto";

export type SortPatientField = keyof PatientListDto;
export type SortDirection = 'asc' | 'desc';