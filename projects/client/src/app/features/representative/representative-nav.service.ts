import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { from } from 'rxjs';

export type RepSection = 'dashboard' | 'water-years' | 'farmers';

@Injectable({ providedIn: 'root' })
export class RepresentativeNavService {
  private readonly router = inject(Router);
  readonly currentSection = signal<RepSection>('dashboard');

  navigateTo(section: RepSection): void {
    this.currentSection.set(section);

    const scroll = () => {
      setTimeout(() => {
        const targetId =
          section === 'dashboard'
            ? 'dashboard-section'
            : section === 'water-years'
              ? 'water-years-section'
              : 'farmers-section';
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 60);
    };

    if (!this.router.url.startsWith('/representative') || this.router.url.includes('/farmer/')) {
      from(this.router.navigate(['/representative'])).subscribe(() => scroll());
    } else {
      scroll();
    }
  }
}
