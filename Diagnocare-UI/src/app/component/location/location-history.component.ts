import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { LocationService } from 'src/app/services/locationServices/location.service';
import {
  LocationHistory,
  LocationPoint,
  UserLatestLocation,
} from 'src/app/models/location/location.model';
import { createMap, esc, formatDateTime, formatTime } from './location-map.util';

/** "2026-10-22T09:00" in the browser's local time, as <input type="datetime-local"> wants it. */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * One person's movement over a time range: points, the route joining them, the list
 * with time / place / accuracy, and the attendance-time locations for the same days.
 *
 * Each load is recorded in the server's access log (who looked at whose history).
 */
@Component({
  selector: 'app-location-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './location-history.component.html',
})
export class LocationHistoryComponent implements AfterViewInit, OnDestroy {
  @Input() initialUserId: number | null = null;
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLElement>;

  users: UserLatestLocation[] = [];
  userId: number | null = null;
  from = '';
  to = '';

  loading = false;
  history: LocationHistory | null = null;
  selectedId: number | null = null;
  rangeError = '';

  readonly formatDateTime = formatDateTime;
  readonly formatTime = formatTime;

  private map!: L.Map;
  private layer = L.layerGroup();
  private markers = new Map<number, L.CircleMarker>();

  constructor(private service: LocationService) {
    this.setToday();
  }

  ngAfterViewInit(): void {
    this.map = createMap(this.mapEl.nativeElement);
    this.layer.addTo(this.map);

    this.service.getLatest().subscribe((rows) => {
      this.users = rows;
      if (this.initialUserId) {
        this.userId = this.initialUserId;
        this.load();
      }
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  setToday(): void {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 0, 0);
    this.from = toLocalInput(start);
    this.to = toLocalInput(end);
  }

  setYesterday(): void {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 0, 0);
    this.from = toLocalInput(start);
    this.to = toLocalInput(end);
  }

  load(): void {
    this.rangeError = '';
    if (!this.userId) return void (this.rangeError = 'Choose a person.');
    const from = new Date(this.from);
    const to = new Date(this.to);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from) {
      return void (this.rangeError = 'The end must be after the start.');
    }
    if (to.getTime() - from.getTime() > 31 * 24 * 3600 * 1000) {
      return void (this.rangeError = 'Choose a range of 31 days or less.');
    }

    this.loading = true;
    this.selectedId = null;
    this.service.getHistory(this.userId, from, to).subscribe({
      next: (h) => {
        this.history = h;
        this.loading = false;
        this.draw(h.points);
      },
      error: () => (this.loading = false),
    });
  }

  select(p: LocationPoint): void {
    this.selectedId = p.id;
    const m = this.markers.get(p.id);
    if (m) {
      this.map.flyTo(m.getLatLng(), Math.max(this.map.getZoom(), 16));
      m.openPopup();
    }
  }

  trackById = (_: number, p: LocationPoint) => p.id;

  private draw(points: LocationPoint[]): void {
    this.layer.clearLayers();
    this.markers.clear();
    if (points.length === 0) return;

    const latlngs = points.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
    // A dashed line: it joins fixes minutes apart, so it is "roughly this way", not a road trace.
    if (latlngs.length > 1) {
      L.polyline(latlngs, { color: '#1d4ed8', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(this.layer);
    }

    points.forEach((p, i) => {
      const first = i === 0;
      const last = i === points.length - 1;
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: first || last ? 9 : 6,
        color: '#fff',
        weight: 2,
        fillColor: first ? '#15803d' : last ? '#b91c1c' : '#1d4ed8',
        fillOpacity: 1,
      }).bindPopup(
        `<strong>${esc(formatDateTime(p.capturedAt))}</strong>` +
        `${first ? ' · start' : last ? ' · latest' : ''}<br>` +
        `Accuracy ±${Math.round(p.accuracy)} m<br>` +
        `${esc(p.placeName ?? `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}`)}`,
      );
      marker.on('click', () => (this.selectedId = p.id));
      marker.addTo(this.layer);
      this.markers.set(p.id, marker);
    });

    this.map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 16 });
  }
}
