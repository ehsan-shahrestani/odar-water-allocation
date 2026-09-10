import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { MockAuth } from './mock-auth';

export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const mockAuth = inject(MockAuth);
  const router = inject(Router);

  const currentRole = auth.userRole() ?? mockAuth.role();
  const expectedRole = route.data['role'];

  if (currentRole === expectedRole) {
    return true;
  }
  return router.parseUrl(currentRole ? '/' + currentRole : '/login');
};
