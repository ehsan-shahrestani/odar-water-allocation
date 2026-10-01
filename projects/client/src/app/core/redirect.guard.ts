import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

/** Redirects `/` to the user's dashboard or to `/login`. */
export const redirectGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.initializeSession$().pipe(
    map(() => {
      const role = auth.userRole();
      return router.parseUrl(role ? '/' + role : '/login');
    }),
  );
};
