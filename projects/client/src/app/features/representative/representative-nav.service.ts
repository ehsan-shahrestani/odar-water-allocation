import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export type RepSection = 'dashboard' | 'water-years' | 'farmers';

@Injectable({ providedIn: 'root' })
export class RepresentativeNavService {
  private readonly router = inject(Router);
  readonly currentSection = signal<RepSection>('dashboard');

  async navigateTo(section: RepSection): Promise<void> {
    this.currentSection.set(section);
    if (!this.router.url.startsWith('/representative') || this.router.url.includes('/farmer/')) {
      await this.router.navigate(['/representative']);
    }

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
  }
}
