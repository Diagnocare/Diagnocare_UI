import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/** One tab. Declared as data so adding a fifth is a line, not a template edit. */
interface AttendanceTab {
  path: string;
  label: string;
  icon: string;
}

/**
 * The administrator's attendance surface: four screens behind one nav entry.
 *
 * <b>Why this exists.</b> Attendance administration had grown to four separate Admin Panel
 * entries — the marking grid, verified attendance, setup, and correction requests — and
 * nothing in the names told an administrator which one to open for a given question. They
 * are four views of one subject, so they get one entry and a tab bar.
 *
 * <b>Why a shell with child routes rather than one large component.</b> Each tab stays its
 * own lazily-loaded component behind its own route. That keeps three properties that a
 * single merged component would quietly give up:
 *
 *   • <b>Each tab still loads on demand.</b> Opening the marking grid does not pull down
 *     the QR preview, the geolocation helper or the audit-trail drawer.
 *   • <b>Each tab is still linkable.</b> `/attendance/verified` is a URL an administrator
 *     can bookmark or paste into a message, and the browser's back button works between
 *     tabs. Tab state held in a component property is none of those things.
 *   • <b>Authorisation stays on the route.</b> The guard is declarative and greppable; a
 *     merged component would have to become `*ngIf="isAdmin"` in a template, which is not
 *     the same kind of statement at all.
 *
 * <b>What is deliberately NOT here.</b> The three device-facing screens — check-in, the
 * kiosk and enrolment — are not tabs and must not become tabs. They authenticate with a
 * device token rather than a login, sit outside the authenticated shell with no
 * `authGuard`, and are loaded on a phone held at a door. Folding them in would ship the
 * whole administrative surface in the bundle an unauthenticated handset downloads.
 *
 * <b>Role.</b> All four tabs are Admin + Super Admin, matching the guard on the parent
 * route and the policies on `AttendanceSetupController` and `AttendanceAuditController`.
 * There is no per-tab filtering because there is nothing to filter — non-admin staff reach
 * their own correction requests through the User Panel's own `/attendance-requests` route,
 * which is untouched.
 */
@Component({
  selector: 'app-attendance-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './attendance-shell.component.html',
  styleUrls: ['./attendance-shell.component.scss'],
})
export class AttendanceShellComponent {

  readonly tabs: AttendanceTab[] = [
    { path: 'marking',  label: 'Marking',  icon: 'fa-calendar-check' },
    { path: 'verified', label: 'Verified', icon: 'fa-shield-alt' },
    { path: 'setup',    label: 'Setup',    icon: 'fa-map-pin' },
    { path: 'requests', label: 'Requests', icon: 'fa-inbox' },
  ];
}
