import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { TokenService } from 'src/app/core/interceptors/token.service';
import { RoleId } from 'src/app/constant/enums';

/**
 * Factory that creates a `CanActivateFn` restricting a route to the given roles.
 *
 * Usage in routing:
 * ```ts
 * canActivate: [roleGuard(Role.Super_Admin.id)]
 * canActivate: [roleGuard(Role.Admin.id, Role.Super_Admin.id)]
 * ```
 *
 * On denial the user goes to /access-denied, carrying the path they attempted so
 * the page can name it. This previously redirected to /pathology, which was
 * actively confusing in two ways: the user got no signal that anything had been
 * refused (the click just appeared to do nothing), and roles whose landing route
 * is NOT /pathology — collection boys, doctors — were bounced to a dashboard they
 * are themselves barred from, which redirected again.
 *
 * Note this guard is a usability affordance, not a security control. The API
 * enforces the same matrix via authorization policies; a user who edits their
 * token or calls the endpoints directly is stopped there, not here.
 */
export function roleGuard(...allowedRoles: RoleId[]): CanActivateFn {
  return (_route, state) => {
    const tokenService = inject(TokenService);
    const router       = inject(Router);

    if (tokenService.hasRole(...allowedRoles)) {
      return true;
    }

    return router.createUrlTree(['/access-denied'], {
      queryParams: { attempted: state.url, reason: 'route' },
    });
  };
}
