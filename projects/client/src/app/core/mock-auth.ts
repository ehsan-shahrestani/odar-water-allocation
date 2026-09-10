import { Service, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { demoAccounts, normalizeDigits, Role } from './mock-data';
@Service()
export class MockAuth {
  private readonly router = inject(Router);
  private readonly currentRole = signal<Role | null>(null);
  readonly role = this.currentRole.asReadonly();
  login(phone: string, otp: string): boolean {
    const role = demoAccounts[normalizeDigits(phone)];
    if (!role || normalizeDigits(otp) !== '123456') return false;
    this.currentRole.set(role);
    return true;
  }
  logout(): void {
    this.currentRole.set(null);
    void this.router.navigateByUrl('/login');
  }
}
