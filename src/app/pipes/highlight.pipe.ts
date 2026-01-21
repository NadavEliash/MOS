import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Pipe({
  name: 'highlight',
  standalone: true
})
export class HighlightPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(text: string | undefined, searchTerm: string): SafeHtml | string {
    if (!searchTerm || !text) {
      return text || '';
    }

    // Use a regex to find all occurrences of the search term, case-insensitively
    const pattern = new RegExp(searchTerm, 'gi');
    const highlightedText = text.replace(pattern, (match) => `<mark style="background-color: transparent; font-weight: 700;">${match}</mark>`);

    // Sanitize the HTML to prevent security risks before rendering
    return this.sanitizer.bypassSecurityTrustHtml(highlightedText);
  }
}
