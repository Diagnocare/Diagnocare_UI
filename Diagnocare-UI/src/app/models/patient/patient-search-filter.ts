/** Filter for POST api/Patient/SearchPatients. Matches the API's PatientSearchFilter. */
export interface PatientSearchFilter {
  searchTerm?: string;
  /** dd-MM-yyyy */
  dateFrom?: string;
  /** dd-MM-yyyy */
  dateTo?: string;
  /** active | pending | partial | completed | deactivated */
  status?: string;
}
