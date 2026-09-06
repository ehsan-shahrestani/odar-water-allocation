import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from './admin-auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);

  await auth.initializeSession();
  if (auth.isFullyAuthenticated()) {
    return true;
  }
  return router.parseUrl('/login');
};
