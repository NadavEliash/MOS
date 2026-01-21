import { Component } from '@angular/core';
import { footerLinks } from '../../services/static.data';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss'
})
export class Footer {
  links = footerLinks
}
