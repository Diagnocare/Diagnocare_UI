import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SKIP_ERROR_TOAST_HEADER } from 'src/app/core/interceptors/error.interceptor';

import { getDiagnocareApiUrl } from 'src/app/core/utils/api-base-url.util';
import { controllerEndpoints } from 'src/app/shared/constants/constants';
import {
  LocationHistory,
  LocationSettings,
  UserLatestLocation,
} from 'src/app/features/location/models/location.model';

/**
 * Staff location tracking — admin side. Every endpoint is Super Admin only on the
 * server; the route guard and menu entry mirror that, but the server is the gate.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly baseUrl = getDiagnocareApiUrl() + controllerEndpoints.location;

  constructor(private http: HttpClient) {}

  /** `quiet` is for the background refresh: no error toast and no access-denied redirect mid-task. */
  getLatest(status?: string, search?: string, quiet = false): Observable<UserLatestLocation[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (search) params = params.set('search', search);
    const headers = quiet ? new HttpHeaders({ [SKIP_ERROR_TOAST_HEADER]: '1' }) : undefined;
    return this.http.get<UserLatestLocation[]>(this.baseUrl + 'latest', { params, headers });
  }

  getHistory(userId: number, from: Date, to: Date, maxPoints = 1000): Observable<LocationHistory> {
    const params = new HttpParams()
      .set('userId', userId)
      .set('from', from.toISOString())
      .set('to', to.toISOString())
      .set('maxPoints', maxPoints);
    return this.http.get<LocationHistory>(this.baseUrl + 'history', { params });
  }

  getSettings(): Observable<LocationSettings> {
    return this.http.get<LocationSettings>(this.baseUrl + 'settings');
  }

  saveSettings(settings: LocationSettings): Observable<LocationSettings> {
    return this.http.put<LocationSettings>(this.baseUrl + 'settings', settings);
  }
}
