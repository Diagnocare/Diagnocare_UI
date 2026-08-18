import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { map, Observable, of } from 'rxjs';
import { PatientCreateDto } from '../../models/patient/patient-create.dto';
import { AddPatientTestDto } from '../../models/patient/add-patient-test.dto';
import { PatientEditDto } from '../../models/patient/patient-edit.dto';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { KeyValuePair } from 'src/app/models/common/keyValuePair';

@Injectable({
  providedIn: 'root'
})
export class PatientService {
  /** Returns the default country dialling code for this deployment. */
  getDialingCode(): Observable<string> {
    return of('+91');
  }
  patienturl: string;

  constructor(private httpClient: HttpClient) {
    this.patienturl = getDiagnocareApiUrl() +controllerEndpoints.patient;
  }

  getPatientById(patientId: string): Observable<PatientEditDto> {
    const geturl = `${this.patienturl}${apiEndpoints.getById}?patientId=${encodeURIComponent(patientId)}`;
    return this.httpClient.get<PatientEditDto>(geturl);
  }

  getSerialNPatientId(): Observable<KeyValuePair> {
    const geturl = this.patienturl + apiEndpoints.getSerialNPatientId;
    console.log(geturl);
    return this.httpClient.get<KeyValuePair>(geturl);
  }

  AddPatient(data: PatientCreateDto): Observable<PatientCreateDto> {
    const addurl = this.patienturl + apiEndpoints.add;
    console.log(addurl);
    return this.httpClient.post<PatientCreateDto>(addurl, data);
  }

  /**
   * Adds a new test (and initial payment) for an already-registered patient.
   * POST api/patient/AddTest
   */
  addPatientTest(data: AddPatientTestDto): Observable<any> {
    const url = this.patienturl + apiEndpoints.addTestWithReceipt;
    return this.httpClient.post<any>(url, data);
  }

  updatePatientDetails(patient: PatientEditDto): Observable<boolean> {
    const updateUrl = this.patienturl + apiEndpoints.update;
    return this.httpClient.put<boolean>(updateUrl, patient);
  }

  /**
   * Soft delete (deactivate) a patient. The record is retained but hidden from
   * normal lists; reversible via reactivatePatient. Returns the API OperationResult.
   * DELETE api/patient/Delete
   */
  deletePatientDetails(patientId: string, reason?: string): Observable<any> {
    let deleteUrl = `${this.patienturl}${apiEndpoints.delete}?patientId=${encodeURIComponent(patientId)}`;
    if (reason) {
      deleteUrl += `&reason=${encodeURIComponent(reason)}`;
    }
    return this.httpClient.delete<any>(deleteUrl);
  }

  /**
   * Reactivates a previously soft-deleted patient.
   * PUT api/patient/Reactivate
   */
  reactivatePatient(patientId: string): Observable<any> {
    const url = `${this.patienturl}${apiEndpoints.reactivate}?patientId=${encodeURIComponent(patientId)}`;
    return this.httpClient.put<any>(url, null);
  }

  /**
   * Permanently deletes a patient and all dependent records. Irreversible —
   * use only for genuine erasure requests / junk records.
   * DELETE api/patient/HardDelete
   */
  hardDeletePatient(patientId: string): Observable<any> {
    const url = `${this.patienturl}${apiEndpoints.hardDelete}?patientId=${encodeURIComponent(patientId)}`;
    return this.httpClient.delete<any>(url);
  }

  searchPatients(searchTerm: string, pageNumber: number, pageSize: number, dateFrom?: string, dateTo?: string, status?: string): Observable<any> {
    let searchUrl = `${this.patienturl}${apiEndpoints.searchPatients}?searchTerm=${encodeURIComponent(searchTerm)}&pageNumber=${pageNumber}&pageSize=${pageSize}`;
    if (dateFrom) {
      searchUrl += `&dateFrom=${dateFrom}`;
    }
    if (dateTo) {
      searchUrl += `&dateTo=${dateTo}`;
    }
    if (status) {
      searchUrl += `&status=${encodeURIComponent(status)}`;
    }
    return this.httpClient.get<any>(searchUrl);
  }
  getDistinctReferredBy(referredByType:string): Observable<string[]> {
    const getUrl = `${this.patienturl}${apiEndpoints.getDistinctReferredBy}?referred_By_Type=${referredByType}`;
    return this.httpClient.get<any[]>(getUrl).pipe(
      map((response) => this.normalizeDistinctReferredBy(response))
    );
  }

  private normalizeDistinctReferredBy(response: any[]): string[] {
    const list = Array.isArray(response) ? response : [];
    const normalized = list
      .map((entry: any) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry && typeof entry === 'object') {
          return entry.referred_By || entry.referredBy || entry.value || '';
        }
        return '';
      })
      .map((entry: string) => entry.trim())
      .filter((entry: string) => !!entry);

    return [...new Set(normalized)];
  }

  /**
   * Cancels a booked patient test.
   * PUT api/patient/CancelTest
   */
  cancelPatientTest(patientTestId: number, reason?: string): Observable<any> {
    const url = this.patienturl + apiEndpoints.cancelTest;
    return this.httpClient.put<any>(url, { patientTestId, reason: reason ?? null });
  }

  /**
   * Removes specific test codes from a booking without cancelling the whole booking.
   * When no codes remain the booking is automatically cancelled server-side.
   * PATCH api/patient/RemoveTests
   */
  removeTestCodes(patientTestId: number, testCodes: string[], reason?: string): Observable<any> {
    const url = this.patienturl + apiEndpoints.removeTests;
    return this.httpClient.patch<any>(url, { patientTestId, testCodes, reason: reason ?? null });
  }

  /**
   * Updates the status of a patient based on their test completion status.
   * Called after booking cancellation or test completion to auto-update patient status.
   * PUT api/patient/UpdatePatientStatus
   *
   * @param patientId The patient ID to update
   * @param newStatus The new patient status ('Pending' | 'Partial' | 'Completed')
   * @returns Observable indicating success
   */
  updatePatientStatus(patientId: string, newStatus: string): Observable<any> {
    const url = `${this.patienturl}/UpdatePatientStatus`;
    return this.httpClient.put<any>(url, { patientId, status: newStatus });
  }

}