import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    children: [
      {
        path: '',
        title: 'داشبورد مدیریت | اُدار',
        loadComponent: () =>
          import('./admin-home/admin-home.component').then((m) => m.AdminHomeComponent),
      },
      {
        path: 'users',
        title: 'مدیریت کاربران | اُدار',
        loadComponent: () =>
          import('./users/users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'wells',
        title: 'مدیریت چاه‌ها | اُدار',
        loadComponent: () =>
          import('./wells/wells.component').then((m) => m.AdminWellsComponent),
      },
      {
        path: 'wells/:id',
        title: 'جزئیات چاه | اُدار',
        loadComponent: () =>
          import('./wells/well-detail/well-detail.component').then((m) => m.WellDetailComponent),
      },
    ],
  },
];
