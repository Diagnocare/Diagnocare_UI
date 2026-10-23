import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation } from '@angular/core';
import { LocationLiveComponent } from './location-live.component';
import { LocationHistoryComponent } from './location-history.component';
import { LocationSettingsComponent } from './location-settings.component';

type Tab = 'live' | 'history' | 'settings';

/**
 * Super Admin: where staff are. Three views — Live (latest fix per person on a map),
 * History (one person's route over a range) and Settings (tracking rules, geofences).
 *
 * Reading history is audited server-side (PhiAccessLog) and the page is
 * Super-Admin-only on both the route and the API.
 *
 * ViewEncapsulation.None on purpose: Leaflet builds its DOM at runtime, so scoped
 * component styles would not reach it, and its stylesheet has to be global anyway.
 * Page styles are therefore all prefixed `loc-`.
 */
@Component({
  selector: 'app-location',
  standalone: true,
  imports: [CommonModule, LocationLiveComponent, LocationHistoryComponent, LocationSettingsComponent],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './location.component.html',
  styleUrls: ['./location.component.scss'],
})
export class LocationComponent {
  tab: Tab = 'live';
  /** Set by "History" on a Live row so the History tab opens on that person. */
  historyUserId: number | null = null;

  setTab(t: Tab): void {
    this.tab = t;
  }

  openHistory(userId: number): void {
    this.historyUserId = userId;
    this.tab = 'history';
  }
}
