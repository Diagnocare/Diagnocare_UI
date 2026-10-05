import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import { apiEndpoints, controllerEndpoints } from 'src/app/constant/constants';
import { HomeSummary } from 'src/app/models/dashboard/home-summary';

@Injectable({ providedIn: 'root' })
export class DashboardService {

  private readonly baseUrl = getDiagnocareApiUrl() + controllerEndpoints.dashboard;

  constructor(private http: HttpClient) {}

  /**
   * Everything the home hero draws, in one request: the five KPI tiles, the Live
   * Activity rows and the week sparkline.
   *
   * `date` is dd-MM-yyyy. Pass the browser's own today so the figures follow the
   * user's calendar day rather than the server's; omitting it falls back to the
   * server's today.
   * GET api/Dashboard/GetHomeSummary
   */
  getHomeSummary(date?: string): Observable<HomeSummary> {
    let params = new HttpParams();
    if (date) params = params.set('date', date);

    return this.http.get<HomeSummary>(`${this.baseUrl}${apiEndpoints.getHomeSummary}`, { params });
  }
}
