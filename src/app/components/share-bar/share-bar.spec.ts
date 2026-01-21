import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShareBar } from './share-bar';

describe('ShareBar', () => {
  let component: ShareBar;
  let fixture: ComponentFixture<ShareBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShareBar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShareBar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
