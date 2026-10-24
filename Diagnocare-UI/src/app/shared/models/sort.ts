import { PatientListDto } from "../../features/patients/models/patient-list.dto";

export type SortPatientField = keyof PatientListDto;
export type SortDirection = 'asc' | 'desc';