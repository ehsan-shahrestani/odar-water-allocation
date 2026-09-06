import { Routes } from '@angular/router';
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        title: 'خانه ادمین | اُدار',
        loadComponent: () =>
          import('./admin-home/admin-home.component').then((m) => m.AdminHomeComponent),
      },
    ],
  },
];
