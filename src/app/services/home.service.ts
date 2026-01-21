import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { CategoryService } from './category.service';

@Injectable({
  providedIn: 'root'
})
export class HomeService {
  private apiService = inject(ApiService);
  private categoryService = inject(CategoryService);
  pageData = signal<any>(null);
  searchData: any[] = [];

  constructor() { }
  
  async getPageData(page: string) {
    const data = await this.apiService.getStatistics(page);
    this.pageData.set(data);
  }
  
  async getSearchData() {
    if (this.searchData.length > 0) return;
    
    const categories = this.categoryService.categories()?.map(c => ({
      name: c.Category_Name, 
      id: c.Category_ID, 
      categoryId: c.Category_ID,
      categoryName: c.Category_Name
    }));    
    if (categories && categories?.length > 0) this.searchData.push(...categories);
    
    const data = await this.apiService.getStatistics('layersMeasures');
    const measures = data.map((item: any) => ({
      name: item['Measure Name'], 
      id: item['Measure ID'], 
      categoryId: item['Category_ID'],
      categoryName: this.categoryService.categories()?.find(c => c.Category_ID === item['Category_ID'])?.Category_Name || ''
    }));

    this.searchData.push(...measures);
  }

  search(term: string): any[] {
    if (!term.trim()) {
      return [];
    }
    const results = this.searchData.filter((item:any) =>
      item.name.includes(term));

    return results.length > 0 ? results.slice(0, 9) : [{none: `לא נמצאו נושאים או מדדים עבור '${term}'`}];
  }
}