import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  VisitScheduleGetDto,
  VisitScheduleCreateDto,
  VisitScheduleUpdateDto,
  VisitCalendarDayDto,
  HolidayVisitConflictDto,
} from 'src/app/models/visitSchedule/visit-schedule.dto';

@Injectable({ providedIn: 'root' })
export class VisitScheduleService {
  private base = getDiagnocareApiUrl() + 'api/visitSchedule/';

  constructor(private http: HttpClient) {}

  create(dto: VisitScheduleCreateDto): Observable<VisitScheduleGetDto> {
    return this.http.post<VisitScheduleGetDto>(`${this.base}Add`, dto);
  }

  getByDate(date: string): Observable<VisitScheduleGetDto[]> {
    return this.http.get<VisitScheduleGetDto[]>(`${this.base}GetByDate?date=${date}`);
  }

  getCalendar(year: number, month: number): Observable<VisitCalendarDayDto[]> {
    return this.http.get<VisitCalendarDayDto[]>(`${this.base}GetCalendar?year=${year}&month=${month}`);
  }

  getMyVisits(memberId: number, date?: string): Observable<VisitScheduleGetDto[]> {
    const d = date ?? new Date().toISOString().split('T')[0];
    return this.http.get<VisitScheduleGetDto[]>(`${this.base}GetMyVisits?memberId=${memberId}&date=${d}`);
  }

  /** Member's own visit calendar summary for a month (self-service). */
  getMyCalendar(year: number, month: number): Observable<VisitCalendarDayDto[]> {
    return this.http.get<VisitCalendarDayDto[]>(`${this.base}GetMyCalendar?year=${year}&month=${month}`);
  }

  /** Holidays in a year that still have visits scheduled on them. */
  getHolidayConflicts(year: number): Observable<HolidayVisitConflictDto[]> {
    return this.http.get<HolidayVisitConflictDto[]>(
      `${this.base}GetHolidayConflicts?year=${year}`);
  }

  /**
   * Holiday/visit conflicts inside an explicit date range — used before
   * registering a holiday so the admin sees which visits it would clash with.
   */
  getConflictsForRange(from: string, to?: string): Observable<HolidayVisitConflictDto[]> {
    const toParam = to ? `&to=${to}` : '';
    return this.http.get<HolidayVisitConflictDto[]>(
      `${this.base}GetHolidayConflicts?from=${from}${toParam}`);
  }

  update(dto: VisitScheduleUpdateDto): Observable<any> {
    return this.http.put(`${this.base}Update`, dto);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.base}Delete/${id}`);
  }
}
