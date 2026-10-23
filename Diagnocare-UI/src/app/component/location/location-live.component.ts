import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { LocationService } from 'src/app/services/locationServices/location.service';
import { LocationStatus, UserLatestLocation } from 'src/app/models/location/location.model';
import { ago, createMap, esc, formatDateTime, placeText, STATUS_COLOR, STATUS_LABEL } from './location-map.util';

const REFRESH_MS = 60_000;

/**
 * Latest known position of every active user, as a table and as markers.
 *
 * A marker is coloured by freshness, not just placed: a person last seen 40 minutes
 * ago must not look the same as one seen a minute ago, which is why "Live" is
 * reserved for the configured short window and everything older says so in words.
 */
@Component({
  selector: 'app-location-live',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './location-live.component.html',
})
export class LocationLiveComponent implements AfterViewInit, OnDestroy {
  @Output() viewHistory = new EventEmitter<number>();
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLElement>;

  rows: UserLatestLocation[] = [];
  search = '';
  statusFilter = '';
  loading = false;
  selectedId: number | null = null;
  lastLoaded: Date | null = null;

  readonly statuses: LocationStatus[] = ['Live', 'Recent', 'Stale', 'Offline', 'NoData'];
  readonly label = STATUS_LABEL;
  readonly ago = ago;
  readonly placeText = placeText;

  private map!: L.Map;
  private layer = L.layerGroup();
  private markers = new Map<number, L.CircleMarker>();
  private timer?: ReturnType<typeof setInterval>;
  private fitted = false;

  constructor(private service: LocationService) {}

  ngAfterViewInit(): void {
    this.map = createMap(this.mapEl.nativeElement);
    this.layer.addTo(this.map);
    this.load(false);
    this.timer = setInterval(() => this.load(true), REFRESH_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.map?.remove();
  }

  get withLocation(): number {
    return this.rows.filter((r) => r.latitude !== null).length;
  }

  load(quiet: boolean): void {
    this.loading = true;
    this.service.getLatest(this.statusFilter || undefined, this.search.trim() || undefined, quiet).subscribe({
      next: (rows) => {
        this.rows = rows;
        this.lastLoaded = new Date();
        this.loading = false;
        this.draw();
      },
      error: () => (this.loading = false), // the interceptor already told the user (not on quiet refreshes)
    });
  }

  select(r: UserLatestLocation): void {
    this.selectedId = r.userId;
    const m = this.markers.get(r.userId);
    if (m) {
      this.map.flyTo(m.getLatLng(), Math.max(this.map.getZoom(), 15));
      m.openPopup();
    }
  }

  trackById = (_: number, r: UserLatestLocation) => r.userId;

  private draw(): void {
    this.layer.clearLayers();
    this.markers.clear();
    const bounds: L.LatLngExpression[] = [];

    for (const r of this.rows) {
      if (r.latitude === null || r.longitude === null) continue;
      const ll: L.LatLngExpression = [r.latitude, r.longitude];
      bounds.push(ll);

      // Accuracy ring first so the marker sits on top of it.
      if (r.accuracy) {
        L.circle(ll, { radius: r.accuracy, color: STATUS_COLOR[r.status], weight: 1, fillOpacity: 0.08, interactive: false }).addTo(this.layer);
      }
      const marker = L.circleMarker(ll, {
        radius: 9, color: '#fff', weight: 2, fillColor: STATUS_COLOR[r.status], fillOpacity: 1,
      }).bindPopup(
        `<strong>${esc(r.userName)}</strong><br>` +
        `${esc(STATUS_LABEL[r.status])} · updated ${esc(ago(r.minutesAgo))}<br>` +
        `<small>${esc(r.capturedAt ? formatDateTime(r.capturedAt) : '')}</small><br>` +
        `Accuracy ±${Math.round(r.accuracy ?? 0)} m<br>` +
        `${esc(placeText(r))}`,
      );
      marker.on('click', () => (this.selectedId = r.userId));
      marker.addTo(this.layer);
      this.markers.set(r.userId, marker);
    }

    // Fit once. Re-fitting on every 60 s refresh would yank the map away from
    // whatever the admin had zoomed into.
    if (!this.fitted && bounds.length) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
      this.fitted = true;
    }
  }
}
