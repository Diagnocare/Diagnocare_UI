import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { TokenService } from 'src/app/core/interceptors/token.service';
import { RoleId } from 'src/app/constant/enums';

/**
 * Factory that creates a `CanActivateFn` restricting a route to the given roles.
 *
 * Usage in routing:
 * ```ts
 * canActivate: [roleGuard(UserTypeId.Super_Admin)]
 * canActivate: [roleGuard(UserTypeId.Admin, UserTypeId.Super_Admin)]
 * ```
 *
 * Redirects to '/pathology' if the current user does not have the required role.
 */
export function roleGuard(...allowedRoles: RoleId[]): CanActivateFn {
  return () => {
    const tokenService = inject(TokenService);
    const router       = inject(Router);

    if (tokenService.hasRole(...allowedRoles)) {
      return true;
    }

    // Redirect to home — access denied
    return router.createUrlTree(['/pathology']);
  };
}
