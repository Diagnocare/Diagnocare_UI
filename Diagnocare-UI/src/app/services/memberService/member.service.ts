import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';

import { getDiagnocareApiUrl }           from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { MemberDto }                     from 'src/app/models/member/member.dto';
import { RoleId }                        from 'src/app/constant/enums';
import { SKIP_ERROR_TOAST_HEADER }       from 'src/app/core/interceptors/error.interceptor';

/**
 * Staff head-count vs the ceiling configured on the API (`Staff:MaxStaffCount`).
 * Every role counts, Super Admin included; deactivated members do not.
 */
export interface StaffCapacity {
  used: number;
  max: number;
  remaining: number;
  canAddMore: boolean;
}

@Injectable({ providedIn: 'root' })
export class MemberService {

  constructor(private http: HttpClient) {}

  private get baseUrl(): string {
    return getDiagnocareApiUrl() + controllerEndpoints.user;
  }

  /**
   * Normalises a raw API response so `id` is always populated.
   * The user endpoint returns `user_Id`; staff returns `id`.
   */
  private normalize(raw: any): MemberDto {
    const id = raw.id ?? raw.user_Id ?? 0;
    return { ...raw, id, user_Id: id };
  }

  private normalizeList(raws: any[]): MemberDto[] {
    return raws.map(r => this.normalize(r));
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /**
   * Fetches all members.
   * Pass `typeUserId` to filter by role (e.g. `Role.Doctor.id` for doctors only).
   * Omit or pass `undefined`/`null` to fetch all members with no role filter.
   */
  getAll(typeUserId?: RoleId | null): Observable<MemberDto[]> {
    let params = new HttpParams();
    if (typeUserId != null) params = params.set('role', typeUserId);
    return this.http
      .get<any[]>(this.baseUrl + apiEndpoints.getAllList, { params })
      .pipe(map(list => this.normalizeList(list)));
  }

  /**
   * Active collection boys for front-desk dropdowns (Add Patient -> "Collected By").
   *
   * Deliberately NOT `getAll(Role.Collection_Boy.id)`: that hits api/User, which is
   * Admin/Super Admin only, so for a Receptionist or Lab Assistant it returned 403
   * and the ErrorInterceptor bounced them to /access-denied before they could add a
   * patient. api/StaffLookup is open to every LabOperations role and returns only
   * id + name. The skip-toast header means a failure here can never navigate away -
   * an empty dropdown is better than losing the form.
   */
  getCollectionBoysLookup(): Observable<MemberDto[]> {
    const url = getDiagnocareApiUrl() + 'api/StaffLookup/CollectionBoys';
    return this.http
      .get<any[]>(url, { headers: new HttpHeaders({ [SKIP_ERROR_TOAST_HEADER]: '1' }) })
      .pipe(map(list => this.normalizeList(list ?? [])));
  }

  /**
   * How many staff slots are used, and how many the lab is allowed.
   * Never hard-code the limit here — it is API configuration. Use this to disable
   * Add controls early; the API rejects an over-limit create with 409 regardless.
   */
  getCapacity(): Observable<StaffCapacity> {
    return this.http.get<StaffCapacity>(this.baseUrl + apiEndpoints.staffCapacity);
  }

  // ── Single record ─────────────────────────────────────────────────────────

  getById(id: number): Observable<MemberDto> {
    return this.http
      .get<any>(`${this.baseUrl}${apiEndpoints.getById}?id=${id}`)
      .pipe(map(r => this.normalize(r)));
  }

  // ── Create / Update / Delete ──────────────────────────────────────────────

  add(member: Partial<MemberDto>): Observable<MemberDto> {
    return this.http.post<MemberDto>(this.baseUrl + apiEndpoints.add, member);
  }

  update(member: Partial<MemberDto>): Observable<MemberDto> {
    return this.http.put<MemberDto>(this.baseUrl + apiEndpoints.update, member);
  }

  /**
   * The only delete — deactivates the member (the API stamps DeactivatedAt).
   * The row survives, so attendance records, salary history and the "reviewed by"
   * stamp on every attendance request they approved stay intact. Reversible via
   * `reactivate`. Deactivated members drop out of the list unless "Show Inactive"
   * is on, and can no longer sign in.
   *
   * There is no permanent delete: removing the row would destroy audit history the
   * lab has to be able to produce. An erasure request scrubs the personal fields
   * instead of dropping the row.
   */
  delete(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}${apiEndpoints.delete}?id=${id}`);
  }

  /** Restores a deactivated member. Refused by the API when the staff limit is reached. */
  reactivate(id: number): Observable<any> {
    return this.http.put(`${this.baseUrl}${apiEndpoints.reactivate}?id=${id}`, {});
  }

  // ── Validation ────────────────────────────────────────────────────────────

  checkUserName(userName: string): Observable<boolean> {
    const params = new HttpParams().set('userName', userName);
    return this.http.get<boolean>(this.baseUrl + apiEndpoints.checkUserName, { params });
  }

  /**
   * Angular async validator — marks control invalid with `{ usernameTaken: true }`
   * when the username already exists.
   */
  userNameValidator(): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      const value = (control.value as string)?.trim();
      if (!value) return of(null);
      return this.checkUserName(value).pipe(
        map(available => (available ? null : { usernameTaken: true })),
        catchError(() => of(null))
      );
    };
  }

  checkDuplicateEmail(email: string, excludeId?: number): Observable<boolean> {
    let params = new HttpParams().set('email', email);
    if (excludeId !== undefined) params = params.set('userId', excludeId);
    return this.http.get<boolean>(this.baseUrl + apiEndpoints.isDuplicateEmail, { params });
  }

  checkDuplicateContact(phone: string, excludeId?: number): Observable<boolean> {
    let params = new HttpParams().set('contactPhone', phone);
    if (excludeId !== undefined) params = params.set('userId', excludeId);
    return this.http.get<boolean>(this.baseUrl + apiEndpoints.isDuplicateContact, { params });
  }

  // ── Doctor-only signature ─────────────────────────────────────────────────

  updateSignature(id: number, signatureBase64: string): Observable<any> {
    return this.http.put(
      `${this.baseUrl}${id}/Signature`,
      { signatureImage: signatureBase64 }
    );
  }

  deleteSignature(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}${id}/Signature`);
  }
}
