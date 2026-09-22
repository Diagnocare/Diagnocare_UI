import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { map, Observable, of } from 'rxjs';
import { PatientCreateDto } from '../../models/patient/patient-create.dto';
import { AddPatientTestDto } from '../../models/patient/add-patient-test.dto';
import { PatientEditDto } from '../../models/patient/patient-edit.dto';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { KeyValuePair } from 'src/app/models/common/keyValuePair';
import { BookingResultDto } from '../../models/patient/booking-result.dto';
import { PagedRequest, PagedResponse } from '../../models/common/page-sort-request';
import { PatientSearchFilter } from '../../models/patient/patient-search-filter';

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

  /**
   * Registers a new patient and books their first test.
   *
   * Returns a BookingResultDto, NOT the payload that was sent — the response
   * carries the server-generated patient id, the new booking's testRegId and one
   * barcode per booked test, which is what lets the caller print sample labels.
   * (It was previously typed as PatientCreateDto, which never matched what the
   * API actually returned.)
   */
  AddPatient(data: PatientCreateDto): Observable<BookingResultDto> {
    const addurl = this.patienturl + apiEndpoints.add;
    return this.httpClient.post<BookingResultDto>(addurl, data);
  }

  /**
   * Adds a new test (and initial payment) for an already-registered patient.
   * Answers in the same shape as AddPatient, so a returning patient's booking can
   * print labels through exactly the same code path.
   * POST api/patient/AddTestWithReceipt
   */
  addPatientTest(data: AddPatientTestDto): Observable<BookingResultDto> {
    const url = this.patienturl + apiEndpoints.addTestWithReceipt;
    return this.httpClient.post<BookingResultDto>(url, data);
  }

  /**
   * Sets "Sampling Done At" on a booking saved without one. The response carries
   * the booking's barcodes — they are only generated once the location is set.
   * PUT api/patient/UpdateSamplingLocation
   */
  updateSamplingLocation(patientTestId: number, samplingDoneAt: string): Observable<BookingResultDto> {
    const url = this.patienturl + apiEndpoints.updateSamplingLocation;
    return this.httpClient.put<BookingResultDto>(url, { patientTestId, samplingDoneAt });
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

  /**
   * Searches patients. Filtering, sorting and paging all run on the server.
   * POST api/Patient/SearchPatients
   */
  searchPatients(request: PagedRequest<PatientSearchFilter>): Observable<PagedResponse<any>> {
    const searchUrl = `${this.patienturl}${apiEndpoints.searchPatients}`;
    return this.httpClient.post<PagedResponse<any>>(searchUrl, request);
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

  // NOTE: there is deliberately no updatePatientStatus() here.
  // A patient's test status is derived server-side on every read
  // (PatientService.ComputeTestStatus, which excludes cancelled bookings);
  // it is not stored, and api/Patient has no UpdatePatientStatus action.
  // The method that used to live here 404'd on every booking cancellation.

}