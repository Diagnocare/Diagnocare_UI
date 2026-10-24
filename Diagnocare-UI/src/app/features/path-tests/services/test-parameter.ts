import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/core/utils/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/shared/constants/constants';
import { TestItemParameter } from 'src/app/features/path-tests/models/parameter.model';
import { TestItem } from 'src/app/features/path-tests/models/test.model';


@Injectable({
  providedIn: 'root',
})
export class TestParameter {
  testParameterApiUrl: string;
  constructor(private httpClient:HttpClient) {
    this.testParameterApiUrl =getDiagnocareApiUrl()+controllerEndpoints.pathologyTest;
  }

  GetTestDetails(testRegId:number):Observable<TestItem>{
    return this.httpClient.get<TestItem>(this.testParameterApiUrl+apiEndpoints.getPathTest+"?testId="+testRegId);
  }
  GetTestParameter(testRegId:number):Observable<TestItemParameter[]>{
    return this.httpClient.get<TestItemParameter[]>(this.testParameterApiUrl+apiEndpoints.getTestParameter+"?testRegId="+testRegId);
  }
  AddTestParameter(lstTestParameter:TestItemParameter[]):Observable<boolean>{
    return this.httpClient.post<boolean>(this.testParameterApiUrl+apiEndpoints.testParameterManipulation,lstTestParameter);
  }
}
