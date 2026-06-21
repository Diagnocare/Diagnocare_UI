import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { ContactAddressModel } from 'src/app/models/contactAddress/contactAddressModel';
import { ContactAddressListDto } from 'src/app/models/contactAddress/contactAddress-list.dto';
import { ContactAddressCreateDto } from 'src/app/models/contactAddress/contactAddress-create.dto';
import { ContactAddressEditDto } from 'src/app/models/contactAddress/contactAddress-edit.dto';
import { CommonService } from 'src/app/shared/common.service';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';


@Injectable({ providedIn: 'root' })
export class ContactAddressService {
  private baseUrl = getDiagnocareApiUrl() +controllerEndpoints.address; // Adjust base URL as needed

  private commonService = inject(CommonService);
  constructor(private http: HttpClient) {}

  getContacts(): Observable<ContactAddressListDto[]> {
    return this.http.get<ContactAddressListDto[]>(this.baseUrl + apiEndpoints.getAllList);
  }

  /** Returns active contacts filtered by institution type (e.g. 7=Doctor, 3=Laboratory). */
  getContactsByType(institutionType: number): Observable<ContactAddressListDto[]> {
    return this.http.get<ContactAddressListDto[]>(`${this.baseUrl}GetByType?type=${institutionType}`);
  }

  /**
   * Returns the existing contact row for this name+type, or creates a minimal new one.
   * Called during patient registration to ensure the referred-by name is in the directory.
   */
  getOrCreate(name: string, institutionType: number): Observable<ContactAddressListDto> {
    return this.http.post<ContactAddressListDto>(`${this.baseUrl}GetOrCreate`, { name, institutionType });
  }

  getContactById(id: number): Observable<ContactAddressListDto> {
    return this.http.get<ContactAddressListDto>(`${this.baseUrl + apiEndpoints.getById}?id=${id}`);
  }

  addContact(contact: ContactAddressCreateDto): Observable<any> {
    return this.http.post(this.baseUrl + apiEndpoints.add, contact);
  }

  updateContact(contact: ContactAddressEditDto): Observable<any> {
    return this.http.put(`${this.baseUrl}${apiEndpoints.update}`, contact);
  }

  deleteContact(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl + apiEndpoints.delete}?id=${id}`);
  }
}
