import { Component, computed, signal } from '@angular/core';
import { CardComponent } from '../../../shared/card/card.component';
import { PageHeaderComponent } from '../../../shared/page-header/page-header.component';
import { farmers, waterYear, wellName, recentUsage, faNumber } from '../../../core/mock-data';
@Component({
  selector: 'app-farmer-home',
  imports: [CardComponent, PageHeaderComponent],
  template: ` <app-page-header
      eyebrow="اُدار · خانه کشاورز"
      [title]="farmer().name"
      [subtitle]="well"
    />
    <div class="page-content space-y-5">
      <app-card [emphasis]="true"
        ><p class="balance-label">مانده سهمیه شما</p>
        <div class="balance-number">{{ number(remaining()) }} <span>مترمکعب</span></div>
        <div class="quota-summary">
          <div>
            <span>سهمیه کل</span
            ><strong>{{ number(farmer().quota) }} <small>مترمکعب</small></strong>
          </div>
          <div>
            <span>مصرف‌شده</span><strong>{{ number(farmer().used) }} <small>مترمکعب</small></strong>
          </div>
        </div></app-card
      >
      <app-card
        ><h2>سال آبی {{ year.name }}</h2>
        <dl class="year-dates">
          <div>
            <dt>تاریخ شروع</dt>
            <dd>{{ year.start }}</dd>
          </div>
          <div>
            <dt>تاریخ پایان</dt>
            <dd>{{ year.end }}</dd>
          </div>
        </dl>
        <p class="year-description">{{ year.description }}</p></app-card
      >
      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" class="section-title">سه مصرف آخر</h2>
        <app-card
          ><ul class="divided-list">
            @for (usage of usageList; track usage.id) {
              <li>
                <span>{{ usage.date }}</span
                ><strong>{{ number(usage.volume) }} <small>مترمکعب</small></strong>
              </li>
            }
          </ul></app-card
        >
      </section>
    </div>`,
})
export class FarmerHomeComponent {
  protected readonly farmer = signal(farmers[0]);
  protected readonly remaining = computed(() => this.farmer().quota - this.farmer().used);
  protected readonly year = waterYear;
  protected readonly well = wellName;
  protected readonly usageList = recentUsage;
  protected readonly number = faNumber;
}
