import { Component, input } from '@angular/core';
@Component({
  selector: 'app-input',
  template: `<label [for]="inputId()">{{ label() }}</label
    ><ng-content select="input" /><ng-content />`,
  host: { class: 'input-group' },
})
export class InputComponent {
  readonly label = input.required<string>();
  readonly inputId = input.required<string>();
}
