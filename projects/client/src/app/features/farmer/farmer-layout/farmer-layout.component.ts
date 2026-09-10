import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNavigationComponent } from '../../../shared/bottom-navigation/bottom-navigation.component';
@Component({
  selector: 'app-farmer-layout',
  imports: [RouterOutlet, BottomNavigationComponent],
  template: `<div class="role-layout">
    <router-outlet /><app-bottom-navigation home="/farmer" />
  </div>`,
})
export class FarmerLayoutComponent {}
