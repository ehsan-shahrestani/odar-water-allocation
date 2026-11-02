import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

@Directive({
  selector: '[appDialogFocus]',
  host: { '(keydown)': 'onKeydown($event)' },
})
export class DialogFocusDirective implements AfterViewInit, OnDestroy {
  readonly dialogClose = output<void>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly trigger = this.document.activeElement as HTMLElement | null;
  private focusTimer: ReturnType<typeof setTimeout> | undefined;

  ngAfterViewInit(): void {
    this.focusTimer = setTimeout(() => this.element.querySelector<HTMLElement>('.modal-close')?.focus());
  }

  ngOnDestroy(): void {
    clearTimeout(this.focusTimer);
    if (this.trigger?.isConnected) this.trigger.focus();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('[role="dialog"]') !== this.element) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dialogClose.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = this.element.querySelector('.modal-dialog');
    const controls = Array.from(dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((control) => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && this.document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && this.document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
