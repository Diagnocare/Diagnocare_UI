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
  UserSalarySummaryDTO,
  SalaryPaymentDTO,
  PayAllComponentsDTO,
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
   * POST api/salary/PayAllComponents
   * Settles every salary component for the month in one call. The backend writes
   * ONE payment row per component that still has a balance, so payment history
   * itemises Base Salary / Travel Allowance / Other Allowance instead of showing
   * a single lump sum. Returns the rows it created.
   */
  payAllComponents(payload: PayAllComponentsDTO): Observable<any> {
    return this.http
      .post(`${this.baseUrl}${apiEndpoints.payAllComponents}`, payload)
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

  /**
   * GET api/salary/GetMySalary
   * Self-service — returns the logged-in staff member's own salary summary,
   * including a month-by-month payment history. The backend resolves the user
   * from the JWT, so no userId is sent from the client.
   */
  getMySalary(): Observable<UserSalarySummaryDTO> {
    return this.http
      .get<UserSalarySummaryDTO>(`${this.baseUrl}${apiEndpoints.getMySalary}`)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * GET api/salary/GenerateMySalaryReceipt?month=YYYY-MM
   * Self-service — returns the logged-in staff member's salary payment receipt
   * for the given month as a PDF blob. The backend resolves the user from the JWT.
   */
  getMySalaryReceipt(month: string): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}${apiEndpoints.generateMySalaryReceipt}?month=${month}`, {
        responseType: 'blob',
      })
      .pipe(catchError(this.errorHandler));
  }

  /**
   * GET api/salary/GetMyPayments
   * Self-service — returns every actual salary payment made to the logged-in user.
   */
  getMyPayments(): Observable<SalaryPaymentDTO[]> {
    return this.http
      .get<SalaryPaymentDTO[]>(`${this.baseUrl}${apiEndpoints.getMyPayments}`)
      .pipe(catchError(this.errorHandler));
  }

  /**
   * GET api/salary/GenerateMyPaymentReceipt?paymentId=X
   * Self-service — returns a PDF receipt for a single payment (ownership-validated server-side).
   */
  getMyPaymentReceipt(paymentId: number): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}${apiEndpoints.generateMyPaymentReceipt}?paymentId=${paymentId}`, {
        responseType: 'blob',
      })
      .pipe(catchError(this.errorHandler));
  }

  private errorHandler(error: HttpErrorResponse): Observable<never> {
    return throwError(() => error.message || 'Server Error');
  }
}
