import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MockAuth } from './mock-auth';
export const roleGuard: CanActivateFn = (route) => {
  const role = inject(MockAuth).role();
  const router = inject(Router);
  return role === route.data['role'] || router.parseUrl(role ? '/' + role : '/login');
};
