import { describe, it, expect } from 'vitest';
import { CategoryComponent } from './category.component';

describe('CategoryComponent', () => {
  it('creates', () => {
    const comp = new CategoryComponent();
    expect(comp).toBeTruthy();
  });
});
