import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-share-bar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './share-bar.html',
  styleUrls: ['./share-bar.scss']
})
export class ShareBar {
  @Input() url: string = '';
  @Input() title: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() copied = new EventEmitter<string>();

  shareViaMail(): void {
    const subject = encodeURIComponent(`שיתוף גרף: ${this.title}`);
    const body = encodeURIComponent(`בדוק את הגרף הזה: ${this.url}`);
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    window.open(mailtoUrl, '_blank');
    this.close.emit();
  }

  shareViaWhatsapp(): void {
    window.open(`https://wa.me/?text=${this.url}`, '_blank');
    this.close.emit();
  }

  async copyLink() {
    try {
      await navigator.clipboard.writeText(this.url);
      this.copied.emit('הקישור הועתק בהצלחה');
    } catch (err) {
      console.error('Failed to copy link:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = this.url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.copied.emit('הקישור הועתק בהצלחה');
    }
    this.close.emit();
  }

  onClose(): void {
    this.close.emit();
  }
}
