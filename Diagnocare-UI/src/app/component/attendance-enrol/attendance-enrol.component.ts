import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AttendanceDeviceService } from 'src/app/core/services/attendance-device.service';

/**
 * Enrols this browser as an attendance device.
 *
 * <b>What this page is for.</b> An administrator enrols a handset in the admin screens
 * and gets back a token, shown once. Getting that token onto the employee's phone is the
 * gap this page fills: the admin sends the link (or shows it as a QR for the phone to
 * open), the employee taps it once, and the phone is enrolled for ninety days.
 *
 * <b>Why it matters that this exists at all.</b> Without it the only way onto the
 * attendance screen would be signing in — and signing in on a phone terminates the
 * employee's session on the lab workstation, because the application allows one active
 * session per user. The whole device-credential design exists to avoid that, and it is
 * worth nothing if there is no way to install the credential.
 *
 * Deliberately outside the authenticated shell and behind no guard: the phone doing the
 * enrolling has, by definition, never logged in. The token in the link is the credential,
 * it is single-use in practice because it is shown to the administrator once, and it
 * grants nothing but the attendance endpoints for one employee.
 */
@Component({
  selector: 'app-attendance-enrol',
  templateUrl: './attendance-enrol.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class AttendanceEnrolComponent implements OnInit {

  /** 'prompt' when no token arrived in the link and we are asking for one. */
  state: 'working' | 'done' | 'prompt' | 'failed' = 'working';

  pastedToken = '';
  message = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private device: AttendanceDeviceService,
  ) {}

  ngOnInit(): void {
    const token = (this.route.snapshot.queryParamMap.get('token') ?? '').trim();

    if (!token) {
      this.state = 'prompt';
      return;
    }

    this.store(token);
  }

  enrolPasted(): void {
    const token = this.pastedToken.trim();

    if (token.length < 10) {
      this.message = 'That does not look like an enrolment code. Paste the whole thing.';
      return;
    }

    this.store(token);
  }

  private store(token: string): void {
    const stored = this.device.setToken(token);

    if (!stored) {
      // Almost always private browsing. Worth naming precisely, because the employee
      // will otherwise enrol successfully, close the tab, and find themselves locked out
      // again with no idea why.
      this.state = 'failed';
      this.message =
        'This browser will not remember the device. If you are browsing privately, '
        + 'open the link in a normal window and try again.';
      return;
    }

    this.state = 'done';

    // Straight through to the attendance screen. An employee who has just tapped a link
    // from their manager wants to check in, not read a confirmation page.
    setTimeout(() => {
      void this.router.navigate(['/check-in'], { replaceUrl: true });
    }, 1200);
  }

  goToAttendance(): void {
    void this.router.navigate(['/check-in'], { replaceUrl: true });
  }
}
