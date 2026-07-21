import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PathologyService } from 'src/app/services/pathologyServices/pathology.service';
import { TokenService }     from 'src/app/core/interceptors/token.service';

/** How many days before expiry the "Extend Licence" button appears */
const EXTEND_WINDOW_DAYS = 15;

export type HomeNavState =
  | 'loading'       // still fetching
  | 'unregistered'  // no pathology in DB → show Register
  | 'extend'        // registered, expiry ≤ 15 days → show Extend
  | 'registered';   // registered, expiry > 15 days → no CTA needed

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {

  currentYear = new Date().getFullYear();
  navState: HomeNavState = 'loading';
  daysLeft = 0;
  expiryDisplay = '';

  constructor(
    private _pathologyService: PathologyService,
    private _tokenService: TokenService,
  ) {}

  ngOnInit(): void {
    // Always fetch the current registration state from the server so the home page
    // reflects live data — registration and licence expiry can change over time.
    this.loadFromServer();
  }

  private loadFromServer(): void {
    this._pathologyService.getPublicInfo().subscribe({
      next: (info) => {
        this.applyPublicInfo(info);
      },
      error: () => {
        this.navState = 'unregistered';
      },
    });
  }

  /** Maps a GetPublicInfo response (from cache or server) to the nav state. */
  private applyPublicInfo(info: any): void {
    if (!info?.isRegistered) {
      this.navState = 'unregistered';
      return;
    }
    if (!info.date_of_Expiry) {
      this.navState = 'registered';
      return;
    }
    this.daysLeft = this.daysUntil(info.date_of_Expiry);
    const _ed = new Date(info.date_of_Expiry);
    this.expiryDisplay = `${_ed.getDate().toString().padStart(2,'0')}-${(_ed.getMonth()+1).toString().padStart(2,'0')}-${_ed.getFullYear()}`;
    this.navState = this.daysLeft <= EXTEND_WINDOW_DAYS ? 'extend' : 'registered';
  }

  private daysUntil(isoDate: string): number {
    const diff = new Date(isoDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}
