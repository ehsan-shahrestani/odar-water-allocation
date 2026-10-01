import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AdminAuthService } from './admin-auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  return auth.initializeSession$().pipe(
    map(() => (auth.isFullyAuthenticated() ? true : router.parseUrl('/login'))),
  );
};
