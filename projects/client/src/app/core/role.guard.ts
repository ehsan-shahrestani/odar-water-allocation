import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const currentRole = auth.userRole();
  const expectedRole = route.data['role'];

  if (currentRole === expectedRole) {
    return true;
  }
  return router.parseUrl(currentRole ? '/' + currentRole : '/login');
};
