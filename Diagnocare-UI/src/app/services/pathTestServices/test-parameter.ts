import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, Observable, throwError } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { TestItemParameter } from 'src/app/models/path-test/parameter/parameter.model';
import { TestItem } from 'src/app/models/path-test/test/test.model';


@Injectable({
  providedIn: 'root',
})
export class TestParameter {
  testParameterApiUrl: string;
  constructor(private httpClient:HttpClient) {
    this.testParameterApiUrl =getDiagnocareApiUrl()+controllerEndpoints.pathologyTest;
  }

  GetTestDetails(testRegId:number):Observable<TestItem>{
    return this.httpClient.get<TestItem>(this.testParameterApiUrl+apiEndpoints.getPathTest+"?testId="+testRegId).pipe((
      catchError(this.errorHandler)));
  }
  GetTestParameter(testRegId:number):Observable<TestItemParameter[]>{
    return this.httpClient.get<TestItemParameter[]>(this.testParameterApiUrl+apiEndpoints.getTestParameter+"?testRegId="+testRegId).pipe(
      catchError(this.errorHandler));
  }
  AddTestParameter(lstTestParameter:TestItemParameter[]):Observable<boolean>{
    return this.httpClient.post<boolean>(this.testParameterApiUrl+apiEndpoints.testParameterManipulation,lstTestParameter).pipe(
      catchError(this.errorHandler));
  }
  errorHandler(error:HttpErrorResponse)
  {
    return throwError(error.message || "Server Error");
  }
}
