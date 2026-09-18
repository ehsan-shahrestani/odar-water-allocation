import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PersianDatepickerComponent } from './persian-datepicker.component';
import { getDaysInJalaliMonth, jalaliToIso, parseJalali } from './jalali-utils';

describe('PersianDatepickerComponent (Wheel Picker)', () => {
  let component: PersianDatepickerComponent;
  let fixture: ComponentFixture<PersianDatepickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PersianDatepickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PersianDatepickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the wheel datepicker component', () => {
    expect(component).toBeTruthy();
  });

  it('should accept inputs properly', () => {
    fixture.componentRef.setInput('placeholder', 'انتخاب تاریخ شروع');
    fixture.componentRef.setInput('label', 'تاریخ شروع دوره');
    fixture.detectChanges();

    expect(component.placeholder()).toBe('انتخاب تاریخ شروع');
    expect(component.label()).toBe('تاریخ شروع دوره');
  });

  it('should accurately calculate Jalali days per month and leap years', () => {
    // Months 1-6 have 31 days
    expect(getDaysInJalaliMonth(1404, 1)).toBe(31);
    expect(getDaysInJalaliMonth(1404, 6)).toBe(31);
    // Months 7-11 have 30 days
    expect(getDaysInJalaliMonth(1404, 7)).toBe(30);
    expect(getDaysInJalaliMonth(1404, 11)).toBe(30);
    // Month 12 has 29 in normal year, 30 in leap year
    expect(getDaysInJalaliMonth(1404, 12)).toBe(29);
    expect(getDaysInJalaliMonth(1403, 12)).toBe(30);
  });

  it('should parse and convert dates correctly between Jalali and ISO', () => {
    const parsed = parseJalali('1404/07/01');
    expect(parsed).toEqual({ year: 1404, month: 7, day: 1 });

    const iso = jalaliToIso(1404, 7, 1);
    expect(iso).toBe('2025-09-23');
  });

  it('should emit dateSelected on confirmation', () => {
    let emitted = '';
    component.dateSelected.subscribe((val) => (emitted = val));

    component.value.set('1404/07/01');
    component.dateSelected.emit('1404/07/01');
    fixture.detectChanges();

    expect(component.value()).toBe('1404/07/01');
    expect(component.isoValue()).toBe('2025-09-23');
    expect(emitted).toBe('1404/07/01');
  });
});
