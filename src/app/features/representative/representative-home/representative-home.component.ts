import { Component, computed, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ButtonComponent } from '../../../shared/button/button.component';
import { InputComponent } from '../../../shared/input/input.component';
import { CardComponent } from '../../../shared/card/card.component';
import { PageHeaderComponent } from '../../../shared/page-header/page-header.component';
import { farmers, waterYear, wellName, faNumber, normalizeName } from '../../../core/mock-data';
@Component({
  selector: 'app-representative-home',
  imports: [ButtonComponent, InputComponent, CardComponent, PageHeaderComponent, FormField],
  template: ` <app-page-header
      eyebrow="اُدار · خانه نماینده"
      title="حسین رحیمی"
      [subtitle]="well"
    />
    <div class="page-content space-y-5">
      <div class="current-year">
        <span>سال آبی جاری</span><strong>{{ year.name }}</strong>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button app-button type="button" (click)="showPending('ثبت مصرف')">
          <span aria-hidden="true">＋</span> ثبت مصرف</button
        ><button
          app-button
          variant="secondary"
          type="button"
          (click)="showPending('افزودن کشاورز')"
        >
          افزودن کشاورز
        </button>
      </div>
      <p class="status-message" role="status">{{ message() }}</p>
      <section aria-labelledby="farmers-heading">
        <h2 id="farmers-heading" class="section-title">کشاورزان</h2>
        <app-input inputId="farmer-search" label="جستجوی کشاورز"
          ><input
            id="farmer-search"
            type="search"
            placeholder="نام کشاورز را بنویسید"
            [formField]="searchForm.query"
            autocomplete="off"
        /></app-input>
        <div class="farmer-list" aria-live="polite">
          @for (farmer of filteredFarmers(); track farmer.id) {
            <app-card
              ><h3>{{ farmer.name }}</h3>
              <dl class="farmer-quota">
                <div>
                  <dt>سهمیه کل <small>(مترمکعب)</small></dt>
                  <dd>{{ number(farmer.quota) }}</dd>
                </div>
                <div>
                  <dt>مانده <small>(مترمکعب)</small></dt>
                  <dd class="remaining">{{ number(farmer.quota - farmer.used) }}</dd>
                </div>
              </dl></app-card
            >
          } @empty {
            <p class="empty-state">کشاورزی با این نام پیدا نشد. نام دیگری بنویسید.</p>
          }
        </div>
      </section>
    </div>`,
})
export class RepresentativeHomeComponent {
  protected readonly year = waterYear;
  protected readonly well = wellName;
  protected readonly number = faNumber;
  protected readonly search = signal({ query: '' });
  protected readonly searchForm = form(this.search);
  protected readonly filteredFarmers = computed(() =>
    farmers.filter((f) => normalizeName(f.name).includes(normalizeName(this.search().query))),
  );
  protected readonly message = signal('');
  protected showPending(action: string): void {
    this.message.set('«' + action + '» در این نسخه پیاده‌سازی نشده است.');
  }
}
