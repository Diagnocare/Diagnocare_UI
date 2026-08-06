import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LicenceService }   from 'src/app/services/licenceServices/licence.service';
import { LoginService }     from 'src/app/services/loginServices/login.service';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';

@Component({
  selector: 'app-licence-expired',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './licence-expired.component.html',
  styleUrls: ['./licence-expired.component.scss']
})
export class LicenceExpiredComponent implements OnInit {

  expiryDate: Date | null = null;
  formattedExpiry = '';

  // ── Licence refresh (pull latest from the shared API) ──────────────────────

  /** True while a forced refresh is in flight. */
  refreshing = false;
  /** Feedback shown after a refresh attempt. */
  refreshMessage = '';
  /** 'ok' | 'warn' — drives the styling of refreshMessage. */
  refreshMessageKind: 'ok' | 'warn' = 'ok';
  /** Forced refreshes left in the current hour (server-reported, max 5). */
  refreshesRemaining: number | null = null;

  constructor(
    private licenceSvc:   LicenceService,
    private loginService: LoginService,
    private pathologyService: PathologyService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.licenceSvc.load().subscribe(() => {
      this.expiryDate    = this.licenceSvc.expiryDate;
      if (this.expiryDate) {
        const d = this.expiryDate;
        this.formattedExpiry = `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
      } else {
        this.formattedExpiry = '';
      }
    });
  }

  /**
   * If the licence was renewed elsewhere (e.g. on the licence server), this pulls the
   * latest details from the shared API rather than the cache, so the user isn't stuck
   * on this screen waiting for a cache to expire.
   *
   * The server caps forced refreshes at 5 per hour and returns cached values with
   * rateLimited = true once that's spent — so this never hard-fails.
   */
  refreshLicence(): void {
    if (this.refreshing) return;

    this.refreshing = true;
    this.refreshMessage = '';

    this.pathologyService.getPublicInfo(true).subscribe({
      next: (info) => {
        this.refreshing = false;

        if (typeof info?.refreshesRemaining === 'number') {
          this.refreshesRemaining = info.refreshesRemaining;
        }

        if (info?.date_of_Expiry) {
          this.expiryDate = new Date(info.date_of_Expiry);
          const d = this.expiryDate;
          this.formattedExpiry =
            `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`;
        }

        if (info?.rateLimited) {
          this.setMessage(
            'Refresh limit reached (5 per hour). Showing the last known licence details — please try again later.',
            'warn');
          return;
        }

        // Licence is live again — send the user back into the app.
        const stillExpired = info?.license_IsExpired ?? this.isExpiredOn(info?.date_of_Expiry);
        if (info?.isRegistered && stillExpired === false) {
          this.setMessage('Licence renewed — restoring access…', 'ok');
          window.location.href = '/pathology';
          return;
        }

        this.setMessage('Licence is still expired. Please renew it and check again.', 'warn');
      },
      error: () => {
        this.refreshing = false;
        this.setMessage('Could not reach the licence server. Please try again.', 'warn');
      },
    });
  }

  /** Tooltip showing how much of the hourly refresh quota is left. */
  get refreshTooltip(): string {
    if (this.refreshesRemaining === null) return 'Check the licence server for an updated licence';
    return `Check the licence server (${this.refreshesRemaining} of 5 refreshes left this hour)`;
  }

  private isExpiredOn(isoDate?: string): boolean | null {
    if (!isoDate) return null;
    const expiry = new Date(isoDate);
    expiry.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  }

  private setMessage(message: string, kind: 'ok' | 'warn'): void {
    this.refreshMessage = message;
    this.refreshMessageKind = kind;
  }

  goToPathology(): void {
    this.router.navigate(['/pathology']);
  }

  logout(): void {
    this.loginService.logout().subscribe(() => {
      window.location.href = '/';
    });
  }
}
