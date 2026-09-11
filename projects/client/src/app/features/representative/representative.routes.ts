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
        title: 'خانه نماینده | اُدار',
        loadComponent: () =>
          import('./representative-home/representative-home.component').then(
            (m) => m.RepresentativeHomeComponent,
          ),
      },
      {
        path: 'farmer/:farmerId',
        title: 'جزییات کشاورز | اُدار',
        loadComponent: () =>
          import('./farmer-detail/farmer-detail.component').then(
            (m) => m.FarmerDetailComponent,
          ),
      },
    ],
  },
];

