import { Component, input } from '@angular/core';
@Component({
  selector: 'app-card',
  template: '<ng-content />',
  host: { class: 'card', '[class.balance-card]': 'emphasis()' },
})
export class CardComponent {
  readonly emphasis = input(false);
}
