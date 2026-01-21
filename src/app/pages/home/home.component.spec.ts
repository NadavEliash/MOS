import { describe, it, expect } from 'vitest';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  it('creates', () => {
    const comp = new HomeComponent();
    expect(comp).toBeTruthy();
  });
});
