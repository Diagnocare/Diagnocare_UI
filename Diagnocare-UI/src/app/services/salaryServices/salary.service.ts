import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import {
  MonthlySalaryResponseDTO,
  GenerateSalaryDTO,
  AddPaymentDTO,
  UserSalaryConfigDTO,
  SaveSalaryConfigDTO,
  CalculatePayableSalaryDTO,
} from 'src/app/models/salary/salary.dto';

@Injectable({ providedIn: 'root' })
export class SalaryService {

  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    this.baseUrl = getDiagnocareApiUrl() + controllerEndpoints.salary;
  }

  /**
   * GET api/salary/GetMonthly?year=YYYY&month=M
   * Returns all users' salary records for the given month, plus month-level totals.
   */
  getMonthlySalary(year: number, month: number): Observable<MonthlySalaryResponseDTO> {
    return this.http
      .get<MonthlySalaryResponseDTO>(
        `${this.baseUrl}${apiEndpoints.getMonthly}?year=${year}&month=${month}`
      )
      .pipe(catchError(this.errorHandler));
  }

  /**
   * POST api/salary/Generate
   * Creates SalaryRecords for all configured users for the given month.
   * Idempotent on the backend — re-calling for an already-generated month is safe.
   */
  generateSalary(payload: GenerateSalaryDTO): Observable<any> {
    return this.http
      .post(`${this.baseUrl}${apiEndpoints.generateSalary}`, payload)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * POST api/salary/AddPayment
   * Records a partial (or full) payment against an existing salary record.
   * Backend updates totalPaid, pendingAmount and status automatically.
   */
  addPayment(payload: AddPaymentDTO): Observable<any> {
    return this.http
      .post(`${this.baseUrl}${apiEndpoints.addPayment}`, payload)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * GET api/salary/GetConfig
   * Returns the salary configuration for every registered user.
   */
  getSalaryConfig(): Observable<UserSalaryConfigDTO[]> {
    return this.http
      .get<UserSalaryConfigDTO[]>(`${this.baseUrl}${apiEndpoints.getAllList}`)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * POST api/salary/SaveConfig
   * Creates or updates the salary configuration for one user.
   */
  saveSalaryConfig(payload: SaveSalaryConfigDTO): Observable<any> {
    return this.http
      .post(`${this.baseUrl}${apiEndpoints.add}`, payload)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * GET api/salary/CalculatePayableSalary?userId=&year=&month=
   * Returns the payable salary breakdown for one user for the given month,
   * factoring in absences, half-days, allowed leaves and per-day deductions.
   */
  calculatePayableSalary(userId: number, year: number, month: number): Observable<CalculatePayableSalaryDTO> {
    return this.http
      .get<CalculatePayableSalaryDTO>(
        `${this.baseUrl}${apiEndpoints.calculatePayableSalary}?userId=${userId}&year=${year}&month=${month}`
      )
      .pipe(catchError(this.errorHandler));
  }

  private errorHandler(error: HttpErrorResponse): Observable<never> {
    return throwError(() => error.message || 'Server Error');
  }
}
