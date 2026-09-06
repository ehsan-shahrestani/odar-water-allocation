import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.initializeSession();
  const profile = auth.currentProfile();
  return (
    (auth.isAuthenticated() && profile?.role === 'admin' && profile.is_active) ||
    router.parseUrl('/login')
  );
};
