import { Component, signal } from '@angular/core';
import { CardComponent } from '../../../shared/card/card.component';
import { PageHeaderComponent } from '../../../shared/page-header/page-header.component';
import { farmers, faNumber } from '../../../core/mock-data';
@Component({
  selector: 'app-admin-home',
  imports: [CardComponent, PageHeaderComponent],
  template: ` <app-page-header eyebrow="اُدار · خانه ادمین" title="مدیریت سامانه" />
    <div class="page-content space-y-5">
      @for (item of summaries; track item.key) {
        <app-card
          ><div class="admin-stat">
            <h2>{{ item.label }}</h2>
            <strong>{{ number(item.count) }}</strong>
          </div>
          <button type="button" class="list-link" (click)="openList(item.label)">
            <span>ورود به لیست {{ item.label }}</span
            ><span aria-hidden="true">←</span>
          </button></app-card
        >
      }
      <p role="status" class="status-message">{{ message() }}</p>
    </div>`,
})
export class AdminHomeComponent {
  protected readonly number = faNumber;
  protected readonly summaries = [
    { key: 'wells', label: 'چاه‌ها', count: 1 },
    { key: 'representatives', label: 'نمایندگان', count: 1 },
    { key: 'farmers', label: 'کشاورزان', count: farmers.length },
  ];
  protected readonly message = signal('');
  protected openList(label: string): void {
    this.message.set('لیست ' + label + ' در این نسخه پیاده‌سازی نشده است.');
  }
}
