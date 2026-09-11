import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
@Component({
  selector: 'app-representative-layout',
  imports: [RouterOutlet],
  template: `<div class="role-layout">
    <router-outlet />
  </div>`,
})
export class RepresentativeLayoutComponent {}
