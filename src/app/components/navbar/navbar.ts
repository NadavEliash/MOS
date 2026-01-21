import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CookieService } from '../../services/cookie.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  private cookieService = inject(CookieService);
  savedGraphsCount = computed(() => this.cookieService.savedGraphs().length);
}
