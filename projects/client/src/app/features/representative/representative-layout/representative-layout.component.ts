import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-representative-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './representative-layout.component.html',
  styleUrl: './representative-layout.component.css',
})
export class RepresentativeLayoutComponent {
  protected readonly auth = inject(AuthService);

  protected logout(): void {
    void this.auth.logout();
  }
}
