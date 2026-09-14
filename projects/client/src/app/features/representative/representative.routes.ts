import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./representative-layout/representative-layout.component').then(
        (m) => m.RepresentativeLayoutComponent,
      ),
    children: [
      {
        path: '',
        title: 'داشبورد نماینده | اُدار',
        loadComponent: () =>
          import('./representative-home/representative-home.component').then(
            (m) => m.RepresentativeHomeComponent,
          ),
      },
      {
        path: 'dashboard',
        redirectTo: '',
        pathMatch: 'full',
      },
      {
        path: 'water-years',
        title: 'سال‌های آبی | اُدار',
        loadComponent: () =>
          import('./water-years/water-years.component').then((m) => m.WaterYearsComponent),
      },
      {
        path: 'farmers',
        title: 'لیست کشاورزان | اُدار',
        loadComponent: () =>
          import('./farmers-list/farmers-list.component').then((m) => m.FarmersListComponent),
      },
      {
        path: 'farmers/:farmerId',
        title: 'پرونده کشاورز | اُدار',
        loadComponent: () =>
          import('./farmer-detail/farmer-detail.component').then((m) => m.FarmerDetailComponent),
      },
      {
        path: 'farmer/:farmerId',
        redirectTo: 'farmers/:farmerId',
      },
    ],
  },
];
