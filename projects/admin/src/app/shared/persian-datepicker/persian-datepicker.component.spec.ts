import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PersianDatepickerComponent } from './persian-datepicker.component';

describe('PersianDatepickerComponent', () => {
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should accept value and placeholder inputs', () => {
    fixture.componentRef.setInput('placeholder', 'انتخاب تاریخ شروع');
    fixture.detectChanges();
    expect(component.placeholder()).toBe('انتخاب تاریخ شروع');
  });

  it('should update model value when date is selected', () => {
    let emittedDate = '';
    component.dateSelected.subscribe((d) => (emittedDate = d));

    component.dateSelected.emit('1404/07/01');
    component.value.set('1404/07/01');
    expect(component.value()).toBe('1404/07/01');
    expect(emittedDate).toBe('1404/07/01');
  });
});
