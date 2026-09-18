import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { VisitScheduleGetDto } from 'src/app/models/visitSchedule/visit-schedule.dto';

/**
 * Shared presentational visit card used by both the admin Visit Schedule and the
 * staff My Visits views. It renders one visit and emits action events; the parent
 * decides which actions are available via `canManage` (admin) and whether to show
 * the assigned staff member via `showMember`.
 */
@Component({
  selector: 'app-visit-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './visit-card.component.html',
  styleUrls: ['./visit-card.component.scss'],
})
export class VisitCardComponent {
  @Input() visit!: VisitScheduleGetDto;
  /** Show the assigned staff member's name (admin / all-staff views). */
  @Input() showMember = false;
  /** Admin capabilities — enables Edit and Delete. */
  @Input() canManage = false;

  @Output() complete    = new EventEmitter<VisitScheduleGetDto>();
  @Output() viewDetails = new EventEmitter<VisitScheduleGetDto>();
  @Output() edit        = new EventEmitter<VisitScheduleGetDto>();
  @Output() remove      = new EventEmitter<number>();

  formatTime(t: string): string {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }

  mapsUrl(address: string): string {
    return 'https://maps.google.com/?q=' + encodeURIComponent(address);
  }
}
