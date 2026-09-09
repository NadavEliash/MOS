import { Injectable, signal } from '@angular/core';

/**
 * Holds the accessibility preferences so components other than the accessibility
 * menu can react to them. The chart is drawn on a canvas, so the global
 * `body.high-contrast` CSS cannot reach it - it reads this signal instead.
 */
@Injectable({ providedIn: 'root' })
export class AccessibilityService {
  private readonly contrastSignal = signal(false);
  private readonly fontScaleSignal = signal(1);

  /** True while high contrast (black on white, textures instead of colours) is on */
  readonly contrast = this.contrastSignal.asReadonly();
  readonly fontScale = this.fontScaleSignal.asReadonly();

  constructor() {
    let storedContrast = false;
    let storedScale: number | null = null;
    try {
      storedContrast = localStorage.getItem('highContrast') === '1';
      const raw = localStorage.getItem('fontScale');
      if (raw) {
        const parsed = parseFloat(raw);
        if (Number.isFinite(parsed)) storedScale = parsed;
      }
    } catch {
      // storage unavailable - fall back to defaults
    }

    this.setContrast(storedContrast);
    this.setFontScale(storedScale ?? 1);
  }

  toggleContrast(): void {
    this.setContrast(!this.contrastSignal());
  }

  setContrast(on: boolean): void {
    this.contrastSignal.set(on);
    try {
      localStorage.setItem('highContrast', on ? '1' : '0');
    } catch {
      // ignore
    }
    document.body.classList.toggle('high-contrast', on);
  }

  setFontScale(value: number): void {
    const scale = Number.isFinite(value) ? value : this.fontScaleSignal();
    this.fontScaleSignal.set(scale);
    try {
      localStorage.setItem('fontScale', String(scale));
    } catch {
      // ignore
    }
    try {
      document.documentElement.style.setProperty('--font-scale', String(scale));
    } catch {
      // ignore
    }
  }
}
