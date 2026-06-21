import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { FileToUpload } from 'src/app/models/pathology/fileToUpload';
import { PathologyListDto } from 'src/app/models/pathology/pathology-list.dto';
import { PathologyEditDto } from 'src/app/models/pathology/pathology-edit.dto';
import { PathologyRegisterDto } from 'src/app/models/pathology/pathology-register.dto';
import { PathologyRegisterResponseDto } from 'src/app/models/pathology/pathology-register-response.dto';
import { PathologyPublicInfoDto } from 'src/app/models/pathology/pathology-public-info.dto';
import { PathologyExtendLicenseDto, PathologyExtendLicenseResponseDto } from 'src/app/models/pathology/pathology-extend-license.dto';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { CommonService } from 'src/app/shared/common.service';

@Injectable({
  providedIn: 'root'
})
export class PathologyService {

  url:string;

  constructor(private httpClient: HttpClient, private commonService: CommonService) {
      this.url=getDiagnocareApiUrl()+controllerEndpoints.pathology;
  }
     
     uploadFile(theFile: FileToUpload) : Observable<any> {
        const httpOptions = {
          headers: new HttpHeaders({
            'Content-Type': 'application/json'
          })
        };
        return this.httpClient.post<FileToUpload>(this.url+apiEndpoints.uploadImage, theFile, httpOptions);
      }

      getPathology(): Observable<PathologyListDto>
      {
        let geturl=this.url+apiEndpoints.getById;
        return this.httpClient.get<PathologyListDto>(geturl).pipe(
          catchError(this.errorHandler));
      }
      
      updatePathology(path: FormData | PathologyEditDto): Observable<PathologyListDto>
      {
        return this.httpClient.put<PathologyListDto>(this.url+apiEndpoints.update, path).pipe(
          catchError(this.errorHandler));
      }

      /** Public endpoint — no auth token required */
      registerPathology(dto: PathologyRegisterDto): Observable<PathologyRegisterResponseDto> {
        return this.httpClient.post<PathologyRegisterResponseDto>(
          this.url + apiEndpoints.add, dto
        ).pipe(catchError(this.errorHandler));
      }

      /** Public (no-auth) — check if pathology is registered and get expiry info */
      getPublicInfo(): Observable<PathologyPublicInfoDto> {
        return this.httpClient.get<PathologyPublicInfoDto>(
          this.url + apiEndpoints.getPublicInfo
        ).pipe(catchError(this.errorHandler));
      }

      /** Public (no-auth) — extend an existing pathology licence */
      extendLicense(dto: PathologyExtendLicenseDto): Observable<PathologyExtendLicenseResponseDto> {
        return this.httpClient.post<PathologyExtendLicenseResponseDto>(
          this.url + apiEndpoints.extendLicense, dto
        ).pipe(catchError(this.errorHandler));
      }

      /** PUT — update JWT token expiry duration (minutes) for this pathology */
      updateTokenExpiry(minutes: number): Observable<any> {
        return this.httpClient.put<any>(
          `${this.url}${apiEndpoints.updateTokenExpiry}?tokenExpiryInMinutes=${minutes}`,
          null
        ).pipe(catchError(this.errorHandler));
      }

      getPathologyExpiryDate(): Observable<any> {
        const geturl = this.url + apiEndpoints.getPathologyExpiryDate;
        return this.httpClient.get<any>(geturl).pipe(
          catchError(this.errorHandler));
      }

      errorHandler(error:HttpErrorResponse)
      {
        const errorMessage = error.message || "Server Error";
          return throwError(() => new Error(errorMessage));
      }
}

