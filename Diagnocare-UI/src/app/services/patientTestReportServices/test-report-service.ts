import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { patientTest } from 'src/app/models/patientTest/patientTestModel';
import { testDetail, testDetailResponse } from 'src/app/models/patientTest/testDetailModel';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';


@Injectable({
  providedIn: 'root',
})
export class TestReportService {
  private url: string;

  constructor(private httpClient: HttpClient) {
    this.url = getDiagnocareApiUrl()+controllerEndpoints.patientReport;
  }
  getAllPatientTests(patientId: string): Observable<patientTest[]> {
    const geturl = `${this.url}${apiEndpoints.getAllList}?patientId=${patientId}`;
    return this.httpClient.get<patientTest[]>(geturl).pipe(
      catchError(this.errorHandler)
    );
  }

  getTestDetails(patientTestId: string): Observable<testDetail[]> {
    const encodedTestId = patientTestId.replace(/,/g, '%2C');
    const geturl = `${this.url}${apiEndpoints.getById}?patientTestId=${encodedTestId}`;
    return this.httpClient.get<testDetailResponse>(geturl).pipe(
      map((response: testDetailResponse) => response.tests || []),
      catchError(this.errorHandler)
    );
  }

  /** INSERT – called for parameters that have no existing row in the DB. */
  saveTestReport(reports: any[]): Observable<any> {
    const postUrl = `${this.url}${apiEndpoints.add}`;
    return this.httpClient.post(postUrl, reports).pipe(
      catchError(this.errorHandler)
    );
  }

  /** UPDATE – called for parameters that already have a row in the DB (id is known). */
  updateTestReport(reports: any[]): Observable<any> {
    const putUrl = `${this.url}${apiEndpoints.update}`;
    return this.httpClient.put(putUrl, reports).pipe(
      catchError(this.errorHandler)
    );
  }

  getSavedTestReport(patientTestId: number, testCode: string): Observable<any[]> {
    const geturl = `${this.url}${apiEndpoints.getSavedTestReport}?patientTestId=${patientTestId}&testCode=${encodeURIComponent(testCode)}`;
    return this.httpClient.get<any[]>(geturl).pipe(
      catchError(this.errorHandler)
    );
  }

  private errorHandler(error: HttpErrorResponse) {
    console.error(error);
    return throwError(() => new Error(error.message || "Server Error"));
  }
}
