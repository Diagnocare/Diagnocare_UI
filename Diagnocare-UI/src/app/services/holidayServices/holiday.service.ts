import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { controllerEndpoints, apiEndpoints } from 'src/app/constant/constants';
import { HolidayDTO, CreateHolidayDTO, UpdateHolidayDTO } from 'src/app/models/holiday/holiday.dto';

@Injectable({ providedIn: 'root' })
export class HolidayService {

  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.holiday;
  }

  /** GET api/holiday/GetByYear?year=YYYY */
  getByYear(year: number): Observable<HolidayDTO[]> {
    return this.http
      .get<HolidayDTO[]>(`${this.baseUrl}${apiEndpoints.getHolidaysByYear}?year=${year}`)
      .pipe(catchError(this.errorHandler));
  }

  /** POST api/holiday/Add */
  add(dto: CreateHolidayDTO): Observable<HolidayDTO> {
    return this.http
      .post<HolidayDTO>(`${this.baseUrl}${apiEndpoints.add}`, dto)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * POST multiple holidays in parallel.
   * Each request is isolated — a failure on one does not cancel the others.
   * Returns an array where successful items are `HolidayDTO` and failed ones are `null`.
   */
  addBulk(dtos: CreateHolidayDTO[]): Observable<(HolidayDTO | null)[]> {
    if (!dtos.length) return of([]);
    return forkJoin(
      dtos.map(dto =>
        this.add(dto).pipe(catchError(() => of(null)))
      )
    );
  }

  /** PUT api/holiday/Update */
  update(dto: UpdateHolidayDTO): Observable<HolidayDTO> {
    return this.http
      .put<HolidayDTO>(`${this.baseUrl}${apiEndpoints.update}`, dto)
      .pipe(catchError(this.errorHandler));
  }

  /** DELETE api/holiday/Delete/{id} */
  delete(holidayId: number): Observable<any> {
    return this.http
      .delete(`${this.baseUrl}${apiEndpoints.delete}/${holidayId}`)
      .pipe(catchError(this.errorHandler));
  }

  private errorHandler(error: HttpErrorResponse): Observable<never> {
    return throwError(() => error.message || 'Server Error');
  }
}
