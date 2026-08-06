import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { TemplateListDTO } from 'src/app/models/template/template-list.dto';
import { TemplateDetailDTO } from 'src/app/models/template/template-detail.dto';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private baseUrl: string;
  private pathologyBaseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.template;
    this.pathologyBaseUrl = getDiagnocareApiUrl() + controllerEndpoints.pathology;
  }

  /**
   * Returns the list of available templates (lightweight metadata only —
   * no htmlBody / cssStyles in this response).
   */
  getTemplates(): Observable<TemplateListDTO[]> {
    return this.http
      .get<TemplateListDTO[]>(this.baseUrl + apiEndpoints.getAllList)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * Fetches a single fully-rendered template by id.
   * The backend pre-populates all {{PLACEHOLDER}} tokens with real
   * pathology / patient / test / doctor data before responding.
   * The frontend assembles the document as:
   *   fullHtml = detail.htmlBody.replace('{{CSS_STYLES}}', detail.cssStyles)
   */
  getTemplateById(templateId: number): Observable<TemplateDetailDTO> {
    return this.http
      .get<TemplateDetailDTO>(`${this.baseUrl}${apiEndpoints.getById}?id=${templateId}`)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * Returns the templateId currently set as the pathology-level default,
   * or null when no default has been assigned yet.
   */
  getPathologyDefault(): Observable<{ templateId: number | null }> {
    return this.http
      .get<{ templateId: number | null }>(`${this.baseUrl}${apiEndpoints.getPathologyDefault}`)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * Sets the given template as the pathology-level default.
   * Pass null to clear the current default.
   */
  setPathologyDefault(templateId: number | null): Observable<any> {
    return this.http
      .put(`${this.pathologyBaseUrl}${apiEndpoints.setDefaultTemplate}?templateId=${templateId}`, {})
      .pipe(catchError(this.errorHandler));
  }

  private errorHandler(error: HttpErrorResponse): Observable<never> {
    return throwError(() => error.message || 'Server Error');
  }
}
