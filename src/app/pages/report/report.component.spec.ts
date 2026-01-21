import { describe, it, expect } from 'vitest';
import { ReportComponent } from './report.component';

describe('ReportComponent', () => {
  it('creates', () => {
    const comp = new ReportComponent();
    expect(comp).toBeTruthy();
  });
});
