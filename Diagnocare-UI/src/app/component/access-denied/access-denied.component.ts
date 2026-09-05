import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { TokenService } from 'src/app/core/interceptors/token.service';
import { Role } from 'src/app/constant/enums';
import { MODULE_ACCESS, DEFAULT_ACCESS } from 'src/app/constant/module-access';

/**
 * Shown when a signed-in user reaches something their role does not permit.
 *
 * Two entry points, distinguished by the `reason` query parameter:
 *
 *   route — roleGuard blocked a navigation before the screen ever loaded.
 *   api   — a request came back 403; the screen rendered but the data did not.
 *
 * The distinction matters to the user: "you can't open this page" and "you opened
 * a page you can't get data for" feel like different failures, and only the second
 * one is plausibly a misconfiguration worth reporting to an admin.
 *
 * Deliberately NOT a logout. A 403 means the session is valid and the role is
 * simply wrong for this destination — signing the user out would be both hostile
 * and misleading. Compare 401, which AuthInterceptor owns and which does end the
 * session.
 */
@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './access-denied.component.html',
  styleUrls: ['./access-denied.component.scss'],
})
export class AccessDeniedComponent implements OnInit {

  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);
  private readonly tokenService = inject(TokenService);

  /** The path the user was trying to reach, when we know it. */
  attemptedPath = '';
  /** 'route' (guard blocked navigation) or 'api' (server returned 403). */
  reason: 'route' | 'api' = 'route';
  /** Human-readable role label, e.g. "Lab Assistant". */
  roleLabel = '';
  /** Where "Back to my home" sends this role. */
  private landingRoute = '/pathology';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;

    this.attemptedPath = params.get('attempted') ?? '';
    this.reason        = params.get('reason') === 'api' ? 'api' : 'route';

    const roleId = this.tokenService.getUserRole();

    this.roleLabel = roleId !== null
      ? (Object.values(Role).find(r => r.id === roleId)?.label ?? 'your account')
      : 'your account';

    this.landingRoute = roleId !== null
      ? (MODULE_ACCESS[roleId] ?? DEFAULT_ACCESS).landingRoute
      : DEFAULT_ACCESS.landingRoute;
  }

  /** Explanatory line under the heading, tailored to how we got here. */
  get explanation(): string {
    return this.reason === 'api'
      ? `The server refused this request for the ${this.roleLabel} role. The page may have loaded, but its data did not.`
      : `The ${this.roleLabel} role does not have access to this page.`;
  }

  goHome(): void {
    this.router.navigate([this.landingRoute]);
  }

  goBack(): void {
    // history.back() can land the user right back on the blocked route, which
    // bounces them here again. Falling through to their landing route is calmer.
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    this.goHome();
  }
}
