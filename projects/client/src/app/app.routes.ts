import { Routes } from '@angular/router';
import { roleGuard } from './core/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'ورود کشاورزان و نمایندگان | اُدار',
    loadComponent: () =>
      import('./features/login/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'farmer',
    data: { role: 'farmer' },
    canActivate: [roleGuard],
    loadChildren: () => import('./features/farmer/farmer.routes').then((m) => m.routes),
  },
  {
    path: 'representative',
    data: { role: 'representative' },
    canActivate: [roleGuard],
    loadChildren: () =>
      import('./features/representative/representative.routes').then((m) => m.routes),
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
