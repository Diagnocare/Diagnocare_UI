import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { environment } from 'src/environments/environment';

/**
 * Public Help / Contact Us page.
 *
 * Reachable by everyone (no auth or role guard — see the `/help` route in
 * app-routing.module.ts), so both logged-in staff and logged-out visitors can
 * find support details and raise an issue on the project board.
 *
 * NOTE: the contact values below are PLACEHOLDERS. Replace them with the real
 * lab / support details before going live.
 */
@Component({
  selector: 'app-help',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.css'],
})
export class HelpComponent {

  currentYear = new Date().getFullYear();

  /**
   * Feedback / help portal URL.
   *
   * Configured per environment (`helpUrl` in src/environments/environment*.ts),
   * so dev, qa, uat and production can each point at their own portal without a
   * code change — Angular swaps the environment file at build time via the
   * `fileReplacements` entries in angular.json.
   */
  readonly helpUrl = environment.helpUrl;

  /** Submit a new issue / suggestion. */
  readonly issueBoardUrl = this.helpUrl;

  /**
   * Check the status of an already-submitted item.
   *
   * The portal issues a tracking ID on submit, which is entered on the same
   * page — so this points at the same configurable URL.
   */
  readonly myIssuesUrl = this.helpUrl;

  /**
   * Contact details shown on the page.
   * ⚠️ PLACEHOLDERS — update these with your real support contact details.
   */
  readonly contact = {
    email:   'support@diagnocare.com',
    phone:   '+91 XXXXX XXXXX',
    altPhone:'+91 XXXXX XXXXX',
    address: 'Diagnocare, [Street Address], [City], [State] – [PIN]',
    hours:   'Monday – Saturday, 9:00 AM – 7:00 PM (IST)',
  };
}
