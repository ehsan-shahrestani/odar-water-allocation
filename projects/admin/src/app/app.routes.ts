import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'ورود مدیر | اُدار',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.routes),
  },
  { path: '', pathMatch: 'full', redirectTo: 'admin' },
  { path: '**', redirectTo: 'admin' },
];
