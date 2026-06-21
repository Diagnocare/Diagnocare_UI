import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { catchError, map, Observable, of, throwError } from 'rxjs';
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
    return this.httpClient.get<PatientEditDto>(geturl).pipe(
      catchError(this.errorHandler)
    );
  }

  getSerialNPatientId(): Observable<KeyValuePair> {
    const geturl = this.patienturl + apiEndpoints.getSerialNPatientId;
    console.log(geturl);
    return this.httpClient.get<KeyValuePair>(geturl).pipe(
      catchError(this.errorHandler)
    );
  }

  AddPatient(data: PatientCreateDto): Observable<PatientCreateDto> {
    const addurl = this.patienturl + apiEndpoints.add;
    console.log(addurl);
    return this.httpClient.post<PatientCreateDto>(addurl, data).pipe(
      catchError(this.errorHandler)
    );
  }

  /**
   * Adds a new test (and initial payment) for an already-registered patient.
   * POST api/patient/AddTest
   */
  addPatientTest(data: AddPatientTestDto): Observable<any> {
    const url = this.patienturl + apiEndpoints.addTestWithReceipt;
    return this.httpClient.post<any>(url, data).pipe(
      catchError(this.errorHandler)
    );
  }

  updatePatientDetails(patient: PatientEditDto): Observable<boolean> {
    const updateUrl = this.patienturl + apiEndpoints.update;
    return this.httpClient.put<boolean>(updateUrl, patient).pipe(
      catchError(this.errorHandler)
    );
  }

  deletePatientDetails(patientId: string): Observable<boolean> {
    const deleteUrl = this.patienturl + apiEndpoints.delete + "?patientId=" + patientId;
    return this.httpClient.delete<boolean>(deleteUrl).pipe(
      catchError(this.errorHandler)
    );
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
    return this.httpClient.get<any>(searchUrl).pipe(
      catchError(this.errorHandler)
    );
  }
  getDistinctReferredBy(referredByType:string): Observable<string[]> {
    const getUrl = `${this.patienturl}${apiEndpoints.getDistinctReferredBy}?referred_By_Type=${referredByType}`;
    return this.httpClient.get<any[]>(getUrl).pipe(
      map((response) => this.normalizeDistinctReferredBy(response)),
      catchError(this.errorHandler)
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
    return this.httpClient.put<any>(url, { patientTestId, reason: reason ?? null }).pipe(
      catchError(this.errorHandler)
    );
  }

  /**
   * Removes specific test codes from a booking without cancelling the whole booking.
   * When no codes remain the booking is automatically cancelled server-side.
   * PATCH api/patient/RemoveTests
   */
  removeTestCodes(patientTestId: number, testCodes: string[], reason?: string): Observable<any> {
    const url = this.patienturl + apiEndpoints.removeTests;
    return this.httpClient.patch<any>(url, { patientTestId, testCodes, reason: reason ?? null }).pipe(
      catchError(this.errorHandler)
    );
  }

  private errorHandler(error: HttpErrorResponse) {
    console.error(error);
    return throwError(() => new Error(error.message || "Server Error"));
  }
}