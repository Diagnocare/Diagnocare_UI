import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import {MonthlySalaryResponseDTO, GenerateSalaryDTO, AddPaymentDTO, UserSalaryConfigDTO, SaveSalaryConfigDTO, CalculatePayableSalaryDTO, UserSalarySummaryDTO, SalaryPaymentDTO, PayAllComponentsDTO, PaymentHistoryDTO} from 'src/app/models/salary/salary.dto';

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
      );
  }

  /**
   * POST api/salary/Generate
   * Creates SalaryRecords for all configured users for the given month.
   * Idempotent on the backend — re-calling for an already-generated month is safe.
   */
  generateSalary(payload: GenerateSalaryDTO): Observable<any> {
    return this.http
      .post(`${this.baseUrl}${apiEndpoints.generateSalary}`, payload);
  }

  /**
   * POST api/salary/AddPayment
   * Records a partial (or full) payment against an existing salary record.
   * Backend updates totalPaid, pendingAmount and status automatically.
   */
  addPayment(payload: AddPaymentDTO): Observable<any> {
    return this.http
      .post(`${this.baseUrl}${apiEndpoints.addPayment}`, payload);
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
      .post(`${this.baseUrl}${apiEndpoints.payAllComponents}`, payload);
  }

  /**
   * GET api/salary/GetConfig
   * Returns the salary configuration for every registered user.
   */
  getSalaryConfig(): Observable<UserSalaryConfigDTO[]> {
    return this.http
      .get<UserSalaryConfigDTO[]>(`${this.baseUrl}${apiEndpoints.getAllList}`);
  }

  /**
   * POST api/salary/SaveConfig
   * Creates or updates the salary configuration for one user.
   */
  saveSalaryConfig(payload: SaveSalaryConfigDTO): Observable<any> {
    return this.http
      .post(`${this.baseUrl}${apiEndpoints.add}`, payload);
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
      );
  }

  /**
   * GET api/salary/GetMySalary
   * Self-service — returns the logged-in staff member's own salary summary,
   * including a month-by-month payment history. The backend resolves the user
   * from the JWT, so no userId is sent from the client.
   */
  getMySalary(): Observable<UserSalarySummaryDTO> {
    return this.http
      .get<UserSalarySummaryDTO>(`${this.baseUrl}${apiEndpoints.getMySalary}`);
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
      });
  }

  /**
   * GET api/salary/GetMyPayments
   * Self-service — returns every actual salary payment made to the logged-in user.
   */
  getMyPayments(): Observable<SalaryPaymentDTO[]> {
    return this.http
      .get<SalaryPaymentDTO[]>(`${this.baseUrl}${apiEndpoints.getMyPayments}`);
  }

  /**
   * GET api/salary/GenerateMyPaymentReceipt?paymentId=X
   * Self-service — returns a PDF receipt for a single payment (ownership-validated server-side).
   */
  getMyPaymentReceipt(paymentId: number): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}${apiEndpoints.generateMyPaymentReceipt}?paymentId=${paymentId}`, {
        responseType: 'blob',
      });
  }

  // ── Payment history ────────────────────────────────────────────────────────

  /**
   * GET api/salary/GetPaymentHistory?userId=X
   * One employee's complete payment history, grouped by salary period, newest
   * month first. Every payment carries when, how and how much was paid — date,
   * amount, mode, transaction reference, status and whether proof is attached.
   */
  getPaymentHistory(userId: number): Observable<PaymentHistoryDTO> {
    return this.http
      .get<PaymentHistoryDTO>(`${this.baseUrl}${apiEndpoints.getPaymentHistory}?userId=${userId}`);
  }

  // ── Payment proof (screenshot / receipt) ───────────────────────────────────

  /**
   * POST api/salary/UploadPaymentProof (multipart/form-data)
   * Attaches a screenshot or receipt to an existing payment; re-uploading replaces it.
   *
   * Separate from addPayment on purpose — the payment is recorded first and the
   * file attached after, so a rejected upload never loses the payment itself.
   * Content-Type is deliberately left unset: the browser must add the multipart
   * boundary, and naming it here would produce a request the API cannot parse.
   */
  uploadPaymentProof(paymentId: number, file: File): Observable<any> {
    const form = new FormData();
    form.append('paymentId', String(paymentId));
    form.append('file', file, file.name);
    return this.http.post(`${this.baseUrl}${apiEndpoints.uploadPaymentProof}`, form);
  }

  /**
   * GET api/salary/GetPaymentProof?paymentId=X
   * Admin — downloads the proof attached to any payment.
   */
  getPaymentProof(paymentId: number): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}${apiEndpoints.getPaymentProof}?paymentId=${paymentId}`, {
        responseType: 'blob',
      });
  }

  /**
   * GET api/salary/GetMyPaymentProof?paymentId=X
   * Self-service — downloads the proof for one of the caller's own payments
   * (ownership-validated server-side).
   */
  getMyPaymentProof(paymentId: number): Observable<Blob> {
    return this.http
      .get(`${this.baseUrl}${apiEndpoints.getMyPaymentProof}?paymentId=${paymentId}`, {
        responseType: 'blob',
      });
  }

  /**
   * DELETE api/salary/DeletePaymentProof/{paymentId}
   * Removes the attached proof, leaving the payment record itself untouched.
   */
  deletePaymentProof(paymentId: number): Observable<any> {
    return this.http
      .delete(`${this.baseUrl}${apiEndpoints.deletePaymentProof}/${paymentId}`);
  }

}
