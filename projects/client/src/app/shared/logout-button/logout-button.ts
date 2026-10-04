import { Component, DestroyRef, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-logout-button',
  template: `
    <button
      type="button"
      class="logout-trigger"
      [class.compact]="compact()"
      aria-label="خروج از حساب"
      title="خروج از حساب"
      (click)="open()"
      [disabled]="pending()"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4"
        />
      </svg>
      @if (!compact()) {
        <span>خروج از حساب</span>
      }
    </button>
    <dialog #confirmation aria-label="تأیید خروج از حساب" (cancel)="onCancel($event)">
      <h2>خروج از حساب</h2>
      <p>آیا می‌خواهید از حساب خود خارج شوید؟</p>
      @if (error()) {
        <p class="logout-error" role="alert">{{ error() }}</p>
      }
      <div class="dialog-actions">
        <button
          type="button"
          class="cancel-button"
          autofocus
          (click)="close()"
          [disabled]="pending()"
        >
          انصراف
        </button>
        <button type="button" class="confirm-button" (click)="logout()" [disabled]="pending()">
          {{ pending() ? 'در حال خروج…' : 'خروج از حساب' }}
        </button>
      </div>
    </dialog>
  `,
  styles: `
    :host {
      display: block;
    }
    button {
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 12px;
      font: inherit;
      font-size: 13px;
      font-weight: 650;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 3px solid #08633f;
      outline-offset: 3px;
    }
    button:disabled {
      opacity: 0.65;
      cursor: wait;
    }
    .logout-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: #9f1239;
      background: #fff;
      border: 1px solid #e5d5d9;
    }
    .logout-trigger.compact {
      width: 44px;
      padding: 10px;
      border: none;
      background: #ffffffb3;
      border: 1px solid #d7e5dc;
      border-radius: 14px;
      color: #52665b;
    }
    .logout-trigger:hover {
      background: #fff1f2;
    }
    svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    dialog {
      width: min(400px, calc(100vw - 32px));
      max-height: calc(100dvh - 48px);
      overflow: auto;
      margin: auto;
      padding: 24px;
      border: 1px solid #d7e5dc;
      border-radius: 20px;
      background: #fff;
      color: #183b29;
      box-shadow: 0 20px 60px #06372226;
    }
    dialog::backdrop {
      background: #10291db3;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 750;
    }
    p {
      margin: 0;
      font-size: 14px;
      line-height: 1.8;
    }
    .dialog-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 24px;
    }
    .cancel-button {
      border: 1px solid #bedaca;
      background: #fff;
      color: #183b29;
    }
    .confirm-button {
      border: 1px solid #9f1239;
      background: #9f1239;
      color: #fff;
    }
    .logout-error {
      color: #9f1239;
      margin-top: 12px;
    }
  `,
})
export class LogoutButton {
  readonly compact = input(false);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmation = viewChild.required<ElementRef<HTMLDialogElement>>('confirmation');
  protected readonly pending = signal(false);
  protected readonly error = signal('');

  protected open(): void {
    this.error.set('');
    this.confirmation().nativeElement.showModal();
  }

  protected close(): void {
    if (!this.pending()) this.confirmation().nativeElement.close();
  }

  protected onCancel(event: Event): void {
    if (this.pending()) event.preventDefault();
  }

  protected logout(): void {
    if (this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    this.auth
      .logout$()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.pending.set(false)),
      )
      .subscribe({
        next: () => this.confirmation().nativeElement.close(),
        error: () => this.error.set('خروج انجام نشد. دوباره تلاش کنید.'),
      });
  }
}
