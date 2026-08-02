import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

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

  /** GitHub project board — used to add a new item (issue). */
  readonly issueBoardUrl = 'https://github.com/orgs/Diagnocare/projects/1/views/2';

  /**
   * Same board, pre-filtered to the signed-in GitHub user's own items.
   *
   * GitHub Projects v2 has NO "author / created-by" filter, so a board cannot be
   * scoped by who opened an item. The only per-visitor self-filter it supports is
   * `assignee:@me`, where `@me` resolves to whoever is logged into GitHub.
   *
   * For this to show a user "only what I created", they must be set as the
   * ASSIGNEE of the issue they open (self-assign when adding the item).
   */
  readonly myIssuesUrl =
    'https://github.com/orgs/Diagnocare/projects/1/views/2?filterQuery=' +
    encodeURIComponent('assignee:@me');

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
