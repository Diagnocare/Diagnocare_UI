import * as L from 'leaflet';
import { LocationStatus, UserLatestLocation } from 'src/app/features/location/models/location.model';

/**
 * Colour is never the only signal: every status is also written out in the table,
 * the popup and the legend. These are tuned to stay distinguishable for the common
 * colour-vision deficiencies (green/blue/orange/grey differ in lightness too).
 */
export const STATUS_COLOR: Record<LocationStatus, string> = {
  Live: '#15803d',
  Recent: '#1d4ed8',
  Stale: '#c2410c',
  Offline: '#64748b',
  NoData: '#94a3b8',
};

export const STATUS_LABEL: Record<LocationStatus, string> = {
  Live: 'Live',
  Recent: 'Recent',
  Stale: 'Stale',
  Offline: 'Offline',
  NoData: 'No data',
};

/** OpenStreetMap standard tiles. Fine for an internal admin tool; swap the URL for a paid provider if volume grows. */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { zoomControl: true }).setView([22.5, 79], 5); // India overview until data arrives
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  return map;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function ago(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / (60 * 24))} d ago`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** The place column: "Head Office" when inside a fence, "3.2 km from Head Office" when outside, else coordinates. */
export function placeText(u: UserLatestLocation): string {
  if (u.latitude === null || u.longitude === null) return '—';
  if (u.placeName && u.geofenceStatus === 'Inside') return u.placeName;
  if (u.placeName && u.distanceMeters !== null) return `${formatDistance(u.distanceMeters)} from ${u.placeName}`;
  return `${u.latitude.toFixed(4)}, ${u.longitude.toFixed(4)}`;
}

/** HTML-escapes text going into a Leaflet popup (popups take HTML; names are user data). */
export function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
