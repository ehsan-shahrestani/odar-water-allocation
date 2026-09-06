import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
@Component({
  selector: 'app-bottom-navigation',
  imports: [RouterLink],
  template: ` <nav class="bottom-nav" aria-label="ناوبری اصلی">
    <a [routerLink]="home()" aria-current="page"
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H15v-6H9v6H3Z" /></svg
      ><span>خانه</span></a
    >
    <button type="button" (click)="logout()" [disabled]="auth.isLoading()">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M10 4H4v16h6M8 12h13m-4-4 4 4-4 4" /></svg
      ><span>خروج</span>
    </button>
  </nav>`,
})
export class BottomNavigationComponent {
  readonly home = input.required<string>();
  protected readonly auth = inject(AuthService);

  protected logout(): void {
    void this.auth.logout();
  }
}
