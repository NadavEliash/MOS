import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { CookieService } from '../../services/cookie.service';
import { CommonModule } from '@angular/common';
import { links } from '../../services/static.data';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss',
})
export class Navbar {
  private cookieService = inject(CookieService);
  private router = inject(Router);

  savedGraphsCount = computed(() => this.cookieService.savedGraphs().length);
  ministrySite = links.ministrySite;

  private currentUrl = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map((event) => (event as NavigationEnd).urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  isHome = computed(() => {
    const url = this.currentUrl();
    return url === '/' || url === '/home' || url.startsWith('/?');
  });
}
