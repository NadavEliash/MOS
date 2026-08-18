import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { escapeHtml } from '../utils/escape-html';

@Pipe({
  name: 'highlight',
  standalone: true
})
export class HighlightPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) { }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  transform(text: string | undefined, searchTerm: string): SafeHtml | string {
    if (!searchTerm || !text) {
      return text || '';
    }

    const encodedText = escapeHtml(text);
    const encodedTerm = escapeHtml(searchTerm);
    const safePattern = new RegExp(this.escapeRegExp(encodedTerm), 'gi');

    const highlightedHtml = encodedText.replace(
      safePattern,
      (match) => `<mark class="highlight">${match}</mark>`
    );

    return this.sanitizer.bypassSecurityTrustHtml(highlightedHtml);
  }
}
