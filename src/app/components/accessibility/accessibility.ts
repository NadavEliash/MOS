import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccessibilityService } from '../../services/accessibility.service';

@Component({
  selector: 'app-accessibility',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './accessibility.html',
  styleUrls: ['./accessibility.scss']
})
export class AccessibilityComponent {
  open = signal(false);

  private a11y = inject(AccessibilityService);

  contrast = this.a11y.contrast;
  fontScale = this.a11y.fontScale;

  private trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  toggleOpen(): void {
    this.open.set(!this.open());
  }

  /** Closing must not leave focus on a removed element, so hand it back to the trigger. */
  close(returnFocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (returnFocus) this.trigger()?.nativeElement.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close(true);
  }

  toggleContrast(): void {
    this.a11y.toggleContrast();
  }

  setFontScale(value: number | string): void {
    const v = typeof value === 'string' ? parseFloat(value) / 100 : value;
    this.a11y.setFontScale(v);
  }
}
