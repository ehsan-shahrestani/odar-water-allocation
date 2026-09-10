import { Component, input } from '@angular/core';
@Component({
  selector: 'app-page-header',
  template: `<header class="page-header">
    <span class="eyebrow">{{ eyebrow() }}</span>
    <h1 tabindex="-1">{{ title() }}</h1>
    @if (subtitle()) {
      <p>{{ subtitle() }}</p>
    }
  </header>`,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input('اُدار · سهم آب');
  readonly subtitle = input('');
}
