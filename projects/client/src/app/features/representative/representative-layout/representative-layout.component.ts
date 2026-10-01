import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  private readonly destroyRef = inject(DestroyRef);

  protected logout(): void {
    this.auth.logout$().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }
}
