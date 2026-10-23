import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { LocationService } from 'src/app/services/locationServices/location.service';
import { LocationSettings } from 'src/app/models/location/location.model';

/**
 * Tracking rules. Validation lives on the server (it returns a plain message for any bad
 * value, which the error interceptor shows); the inputs only keep obviously silly values out.
 * Offices and geofences are the attendance module's, managed in Attendance setup.
 */
@Component({
  selector: 'app-location-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './location-settings.component.html',
})
export class LocationSettingsComponent implements OnInit {
  settings: LocationSettings | null = null;
  saving = false;

  readonly days = [
    { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' },
    { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
  ];

  constructor(private service: LocationService, private toastr: ToastrService) {}

  ngOnInit(): void {
    this.service.getSettings().subscribe((s) => (this.settings = s));
  }

  hasDay(n: number): boolean {
    return !!this.settings?.trackDays.includes(n);
  }

  toggleDay(n: number): void {
    if (!this.settings) return;
    const set = new Set(this.settings.trackDays);
    if (set.has(n)) set.delete(n); else set.add(n);
    this.settings.trackDays = [...set].sort();
  }

  save(): void {
    if (!this.settings) return;
    this.saving = true;
    this.service.saveSettings(this.settings).subscribe({
      next: (s) => {
        this.settings = s;
        this.saving = false;
        this.toastr.success('Location settings saved. Phones pick them up the next time the app is opened.');
      },
      error: () => (this.saving = false),
    });
  }
}
