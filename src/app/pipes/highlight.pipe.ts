import { Pipe, PipeTransform, SecurityContext } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlight',
  standalone: true
})
export class HighlightPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) { }

  private encodeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  transform(text: string | undefined, searchTerm: string): SafeHtml | string {
    if (!searchTerm || !text) {
      return text || '';
    }

    const encodedText = this.encodeHtml(text);
    const encodedTerm = this.encodeHtml(searchTerm);
    const safePattern = new RegExp(this.escapeRegExp(encodedTerm), 'gi');

    const highlightedHtml = encodedText.replace(
      safePattern,
      (match) => `<mark style="background-color: transparent; font-weight: 700;">${match}</mark>`
    );

    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, highlightedHtml) ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }
}
