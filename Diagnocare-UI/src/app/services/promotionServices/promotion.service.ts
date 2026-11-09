import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { controllerEndpoints } from 'src/app/constant/constants';
import { getDiagnocareApiUrl } from 'src/app/shared/api-base-url.util';
import {
  ActivePromotion, BookingSelection, PricingPlan, PromotionRow, PromotionSave,
} from 'src/app/models/promotion/promotion.model';

/**
 * Promotional pricing. The browser never works out a promotional price: it asks the API
 * (`quote`) and shows what comes back. The API re-does the same sum when the booking is saved.
 */
@Injectable({ providedIn: 'root' })
export class PromotionService {
  private readonly apiUrl = getDiagnocareApiUrl() + controllerEndpoints.promotion;

  constructor(private http: HttpClient) {}

  /** Offers open for booking today, with prices worked out. */
  getActive(): Observable<ActivePromotion[]> {
    return this.http.get<ActivePromotion[]>(`${this.apiUrl}Active`);
  }

  /** What these selections would cost, and why. Saves nothing. */
  quote(selections: BookingSelection[]): Observable<PricingPlan> {
    return this.http.post<PricingPlan>(`${this.apiUrl}Quote`, { selections });
  }

  // ── Administration (Admin / Super Admin) ──────────────────────────────
  getAll(): Observable<PromotionRow[]> { return this.http.get<PromotionRow[]>(this.apiUrl); }
  create(body: PromotionSave): Observable<PromotionRow> { return this.http.post<PromotionRow>(this.apiUrl, body); }
  update(id: number, body: PromotionSave): Observable<PromotionRow> { return this.http.put<PromotionRow>(`${this.apiUrl}${id}`, body); }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.apiUrl}${id}`); }
}
