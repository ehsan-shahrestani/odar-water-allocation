import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/** Prevents authenticated users from reaching the login page. */
export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.initializeSession$().pipe(
    map(() => {
      const role = auth.userRole();
      if (role) {
        return router.parseUrl('/' + role);
      }
      return true;
    }),
  );
};
