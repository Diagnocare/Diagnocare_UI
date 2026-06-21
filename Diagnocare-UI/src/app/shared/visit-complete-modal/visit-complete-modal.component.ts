import {
  Component, EventEmitter, Input, Output, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';

export interface VisitCompletionData {
  remark:      string;
  location:    string;
  photoBase64: string | null;
}

@Component({
  selector:    'app-visit-complete-modal',
  standalone:  true,
  imports:     [CommonModule, FormsModule],
  templateUrl: './visit-complete-modal.component.html',
  styleUrls:   ['./visit-complete-modal.component.scss'],
})
export class VisitCompleteModalComponent implements OnInit, OnDestroy {
  @Input() visitName = '';
  @Input() saving    = false;

  // ── View-only mode (show completion details) ───────────────────────────────
  /** When true the modal shows existing data read-only instead of capture controls. */
  @Input() viewMode          = false;
  @Input() viewRemark:        string | null = null;
  @Input() viewLocation:      string | null = null;
  @Input() viewPhotoBase64:   string | null = null;
  @Input() viewCompletedAt:   string | null = null;

  @Output() confirmed = new EventEmitter<VisitCompletionData>();
  @Output() cancelled = new EventEmitter<void>();

  // ── Capture state (used only when viewMode = false) ────────────────────────
  remark      = '';
  location    = '';
  photoBase64: string | null = null;
  photoPreviewUrl: string | null = null;

  locationStatus: 'idle' | 'loading' | 'done' | 'error' = 'idle';
  locationLabel  = '';

  ngOnInit(): void  { document.body.classList.add('modal-open'); }
  ngOnDestroy(): void { document.body.classList.remove('modal-open'); }

  // ── Helpers ────────────────────────────────────────────────────────────────

  get mapsUrl(): string {
    return this.viewLocation
      ? `https://maps.google.com/?q=${this.viewLocation}`
      : '';
  }

  get completedAtLabel(): string {
    if (!this.viewCompletedAt) return '';
    try {
      return new Date(this.viewCompletedAt).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return this.viewCompletedAt; }
  }

  // ── Photo capture (viewMode = false only) ──────────────────────────────────

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.photoPreviewUrl = dataUrl;
      this.photoBase64     = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  removePhoto(): void { this.photoBase64 = null; this.photoPreviewUrl = null; }

  // ── Location capture (viewMode = false only) ───────────────────────────────

  fetchLocation(): void {
    if (!navigator.geolocation) {
      this.locationStatus = 'error';
      this.locationLabel  = 'Geolocation not supported by this browser.';
      return;
    }
    this.locationStatus = 'loading';
    this.locationLabel  = 'Acquiring GPS signal…';

    navigator.geolocation.getCurrentPosition(
      pos => {
        const rawLat = pos.coords.latitude;
        const rawLng = pos.coords.longitude;
        const lat    = Math.abs(rawLat).toFixed(6);
        const lng    = Math.abs(rawLng).toFixed(6);
        const ns     = rawLat >= 0 ? 'N' : 'S';
        const ew     = rawLng >= 0 ? 'E' : 'W';
        const acc    = pos.coords.accuracy != null
                         ? ` (±${Math.round(pos.coords.accuracy)} m)`
                         : '';

        // Store raw decimal coords for the Maps URL
        this.location       = `${rawLat.toFixed(6)},${rawLng.toFixed(6)}`;
        this.locationLabel  = `${lat}° ${ns}, ${lng}° ${ew}${acc}`;
        this.locationStatus = 'done';
      },
      err => {
        this.locationStatus = 'error';
        this.locationLabel  =
          err.code === err.PERMISSION_DENIED   ? 'Location permission denied. Please allow access in browser settings.' :
          err.code === err.POSITION_UNAVAILABLE ? 'Location unavailable. Check device GPS settings.' :
          err.code === err.TIMEOUT              ? 'Timed out. Move to an open area and try again.' :
                                                  'Could not get location.';
      },
      {
        enableHighAccuracy: true,  // use GPS chip, not cell/Wi-Fi
        timeout:            15_000, // 15 s — GPS cold-start needs more time
        maximumAge:         0,      // never return a cached position
      }
    );
  }

  clearLocation(): void { this.location = ''; this.locationLabel = ''; this.locationStatus = 'idle'; }

  // ── Actions ────────────────────────────────────────────────────────────────

  confirm(): void {
    this.confirmed.emit({ remark: this.remark.trim(), location: this.location, photoBase64: this.photoBase64 });
  }

  cancel(): void { this.cancelled.emit(); }
}
