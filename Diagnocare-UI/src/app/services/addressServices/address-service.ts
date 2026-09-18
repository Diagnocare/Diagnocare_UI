import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { shareReplay } from 'rxjs/operators';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';


@Injectable({
  providedIn: 'root',
})
export class AddressService {
  url:string;
  
  constructor(private httpClient:HttpClient) {
  
      this.url=getDiagnocareApiUrl() +controllerEndpoints.address;
      
     }

      getStateCityList(): Observable<string[]>
      {
        let geturl=this.url+apiEndpoints.getAllStateCityList;
        return this.httpClient.get<string[]>(geturl);
      }
}
