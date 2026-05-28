import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-accessibility',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accessibility.html',
  styleUrls: ['./accessibility.scss']
})
export class AccessibilityComponent implements OnInit {
  open = signal(false);
  contrast = signal(false);
  fontScale = signal(1);

  ngOnInit(): void {
    try {
      this.contrast.set(localStorage.getItem('highContrast') === '1');
      const stored = localStorage.getItem('fontScale');
      if (stored) this.fontScale.set(parseFloat(stored));
    } catch (e) {
      // ignore
    }
    if (this.contrast()) document.body.classList.add('high-contrast');
    // apply current scale to root so CSS variables update
    try { document.documentElement.style.setProperty('--font-scale', String(this.fontScale())); } catch {}
  }

  toggleOpen(): void {
    this.open.set(!this.open());
  }

  toggleContrast(): void {
    const v = !this.contrast();
    this.contrast.set(v);
    try { localStorage.setItem('highContrast', v ? '1' : '0'); } catch {}
    if (v) document.body.classList.add('high-contrast'); else document.body.classList.remove('high-contrast');
  }

  setFontScale(value: number | string): void {
    const v = typeof value === 'string' ? parseFloat(value) / 100 : value;
    const scale = Number.isFinite(v) ? v : this.fontScale();
    this.fontScale.set(scale);
    try { localStorage.setItem('fontScale', String(scale)); } catch {}
    try { document.documentElement.style.setProperty('--font-scale', String(scale)); } catch {}
  }
}
