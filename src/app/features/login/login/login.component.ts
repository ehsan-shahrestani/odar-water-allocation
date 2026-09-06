import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { AdminAuthError, AuthService } from '../../../core/auth.service';
import { ButtonComponent } from '../../../shared/button/button.component';
import { InputComponent } from '../../../shared/input/input.component';
import { PageHeaderComponent } from '../../../shared/page-header/page-header.component';

@Component({
  selector: 'app-login',
  imports: [ButtonComponent, InputComponent, PageHeaderComponent, FormField],
  template: ` <div class="login-page">
    <app-page-header eyebrow="" title="ورود مدیر سامانه" />
    <form
      novalidate
      (submit)="login(); $event.preventDefault()"
      class="space-y-5"
      [attr.aria-busy]="auth.isLoading()"
    >
      <app-input label="ایمیل" inputId="email">
        <input
          #emailInput
          id="email"
          type="email"
          dir="ltr"
          autocomplete="username"
          placeholder="admin@example.com"
          [formField]="loginForm.email"
          [attr.aria-invalid]="error() ? 'true' : null"
          aria-describedby="login-error"
        />
      </app-input>

      <app-input label="رمز عبور" inputId="password">
        <input
          id="password"
          type="password"
          dir="ltr"
          autocomplete="current-password"
          placeholder="رمز عبور"
          [formField]="loginForm.password"
          [attr.aria-invalid]="error() ? 'true' : null"
          aria-describedby="login-error"
        />
      </app-input>

      <p id="login-error" role="alert" class="error-message">{{ error() }}</p>
      <button app-button type="submit" class="w-full" [disabled]="auth.isLoading()">
        @if (auth.isLoading()) {
          <span class="loading-spinner" aria-hidden="true"></span>
          <span role="status">در حال ورود…</span>
        } @else {
          ورود
        }
      </button>
    </form>
  </div>`,
})
export class LoginComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');
  protected readonly error = signal('');
  protected readonly credentials = signal({ email: '', password: '' });
  protected readonly loginForm = form(this.credentials, (path) => {
    required(path.email);
    email(path.email);
    required(path.password);
  });

  constructor() {
    afterNextRender(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigateByUrl('/admin');
        return;
      }
      this.emailInput()?.nativeElement.focus();
    });
  }

  protected login(): void {
    if (this.auth.isLoading()) return;
    this.error.set('');

    if (this.loginForm().invalid()) {
      this.error.set('ایمیل و رمز عبور را کامل و صحیح وارد کنید.');
      this.emailInput()?.nativeElement.focus();
      return;
    }

    submit(this.loginForm, async () => {
      try {
        const { email: adminEmail, password } = this.credentials();
        await this.auth.loginAdmin(adminEmail, password);
        this.credentials.update((value) => ({ ...value, password: '' }));
        await this.router.navigateByUrl('/admin');
      } catch (loginError: unknown) {
        this.error.set(
          loginError instanceof AdminAuthError
            ? loginError.userMessage
            : 'ورود به سامانه ممکن نشد. دوباره تلاش کنید.',
        );
      }
    });
  }
}
