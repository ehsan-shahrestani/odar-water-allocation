import { Component, DestroyRef, DOCUMENT, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgxSonnerToaster } from 'ngx-sonner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NgxSonnerToaster],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  constructor() {
    const document = inject(DOCUMENT);
    inject(Router)
      .events.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((event) => {
        if (event instanceof NavigationEnd)
          setTimeout(() => {
            document.querySelector<HTMLElement>('h1')?.focus();
            window.scrollTo(0, 0);
          });
      });
  }
}
