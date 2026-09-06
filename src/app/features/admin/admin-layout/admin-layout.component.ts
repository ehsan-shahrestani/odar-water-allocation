import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNavigationComponent } from '../../../shared/bottom-navigation/bottom-navigation.component';
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, BottomNavigationComponent],
  template: `<div class="role-layout">
    <router-outlet /><app-bottom-navigation home="/admin" />
  </div>`,
})
export class AdminLayoutComponent {}
