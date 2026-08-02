import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RequestStatus, REQUEST_STATUS_CONFIG } from 'src/app/models/attendanceRequest/attendance-request.model';

/** Small reusable status chip shared by employee + admin request views. */
@Component({
  selector: 'app-request-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="req-badge" [ngClass]="cssClass">{{ label }}</span>`,
  styles: [`
    .req-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1.4;
      white-space: nowrap;
    }
    .badge-pending   { background: #fff3cd; color: #8a6d00; border: 1px solid #ffe08a; }
    .badge-approved  { background: #d4edda; color: #1b6b32; border: 1px solid #a3d9b1; }
    .badge-rejected  { background: #f8d7da; color: #a11c28; border: 1px solid #efb3b8; }
    .badge-cancelled { background: #e9ecef; color: #5c636a; border: 1px solid #ced4da; }
  `],
})
export class RequestStatusBadgeComponent {
  @Input() status: number = RequestStatus.Pending;

  get label(): string {
    return REQUEST_STATUS_CONFIG[this.status as RequestStatus]?.label ?? '—';
  }
  get cssClass(): string {
    return REQUEST_STATUS_CONFIG[this.status as RequestStatus]?.cssClass ?? '';
  }
}
