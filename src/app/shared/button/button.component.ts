import { Component, input } from '@angular/core';
@Component({
  selector: 'button[app-button]',
  template: '<ng-content />',
  host: { class: 'app-button', '[class.secondary]': 'variant() === "secondary"' },
})
export class ButtonComponent {
  readonly variant = input<'primary' | 'secondary'>('primary');
}
