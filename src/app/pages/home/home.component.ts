import { Component, computed, effect, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CategoryService } from "../../services/category.service";

import { HighlightPipe } from "../../pipes/highlight.pipe";
import { HomeService } from "../../services/home.service";
@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, FormsModule, HighlightPipe],
  templateUrl: "./home.component.html",
  styleUrls: ["./home.component.scss"]
})
export class HomeComponent {
  private router = inject(Router);
  private homeService = inject(HomeService);
  private categoryService = inject(CategoryService);

  pageData = this.homeService.pageData;
  chips = this.categoryService.categories;
  searchTerm = signal<string>('');
  searchResults: any[] = [];
  isDrawerOpen: boolean = false;
  selectedResultIndex: number = -1;

  title = computed(() => {
    return this.pageData()?.find((d: any) => d.PagePart_ID === "H01")?.Main_Header.match(/^(.*?)(\d+)(.*)$/) ?? 
    ['', 'נתוני הרווחה בישראל לשנת', `${new Date().getFullYear()}`, 'לחוקרים ואנשי המקצוע'];
  });
  
  HeaderData = computed(() => {
    return this.pageData()?.find((d: any) => d.PagePart_ID === "H01");
  });
  
  midData = computed(() => {
    return this.pageData()?.find((d: any) => d.PagePart_ID === "C01");
  });

  constructor() {
    this.homeService.getPageData('homePage');
    this.categoryService.getCategories();
    this.homeService.getSearchData();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.isDrawerOpen && this.searchResults.length > 0) {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          this.selectedResultIndex = (this.selectedResultIndex > 0)
            ? this.selectedResultIndex - 1
            : this.searchResults.length - 1;
          break;
        case 'ArrowDown':
          event.preventDefault();
          this.selectedResultIndex = (this.selectedResultIndex < this.searchResults.length - 1)
            ? this.selectedResultIndex + 1
            : 0;
          break;
        case 'Enter':
          event.preventDefault();
          if (this.selectedResultIndex > -1) {
            this.onSelectResult(this.searchResults[this.selectedResultIndex]);
          }
          break;
      }
    }
  }


  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    if (this.searchTerm().length > 0) {
      if (this.searchTerm().trim()) {
        this.searchResults = this.homeService.search(this.searchTerm());
        this.isDrawerOpen = true;
      } else {
        this.searchResults = [];
        this.isDrawerOpen = false;
      }
    } else {
      this.searchResults = [];
      this.isDrawerOpen = false;
    }
  }

  resetSearch(): void {
    this.searchTerm.set('');
    this.searchResults = [];
    this.isDrawerOpen = false;
  }

  onChipClick(chipId: string): void {
    this.router.navigate(['/category'], { queryParams: { id: chipId } });
  }

  onSelectResult(result: any): void {
    this.resetSearch();
    this.router.navigate(['/category'], { queryParams: { id: result.categoryId } });
    if (result.id !== result.categoryId) { 
      this.categoryService.setSelectedMeasure(result.id);
    }
  }

  isCategory = (id: string) => {
    return this.categoryService.categories()?.find(c => c.Category_ID === id)
  }
}
