import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-bottom-navigation',
  imports: [RouterLink],
  template: ` <nav class="bottom-nav" aria-label="ناوبری اصلی">
    <a [routerLink]="home()" aria-current="page"
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H15v-6H9v6H3Z" /></svg
      ><span>خانه</span></a
    >
  </nav>`,
})
export class BottomNavigationComponent {
  readonly home = input.required<string>();
}
