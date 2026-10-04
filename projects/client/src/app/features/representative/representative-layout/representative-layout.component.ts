import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LogoutButton } from '../../../shared/logout-button/logout-button';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-representative-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoutButton],
  templateUrl: './representative-layout.component.html',
  styleUrl: './representative-layout.component.css',
})
export class RepresentativeLayoutComponent {
  protected readonly auth = inject(AuthService);
}
