import { Routes } from '@angular/router';
export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./farmer-layout/farmer-layout.component').then((m) => m.FarmerLayoutComponent),
    children: [
      {
        path: '',
        title: 'خانه کشاورز | اُدار',
        loadComponent: () =>
          import('./farmer-home/farmer-home.component').then((m) => m.FarmerHomeComponent),
      },
    ],
  },
];
