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
  largeText = signal(false);

  ngOnInit(): void {
    try {
      this.contrast.set(localStorage.getItem('highContrast') === '1');
      this.largeText.set(localStorage.getItem('largeText') === '1');
    } catch (e) {
      // ignore
    }
    if (this.contrast()) document.body.classList.add('high-contrast');
    if (this.largeText()) document.body.classList.add('large-text');
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

  toggleLargeText(): void {
    const v = !this.largeText();
    this.largeText.set(v);
    try { localStorage.setItem('largeText', v ? '1' : '0'); } catch {}
    if (v) document.body.classList.add('large-text'); else document.body.classList.remove('large-text');
  }
}
