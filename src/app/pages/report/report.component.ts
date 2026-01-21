import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { GraphComponent } from '../../components/graph/graph.component';
import { ShareBar } from '../../components/share-bar/share-bar';
import { CookieService } from '../../services/cookie.service';
import { CategoryService, Category } from '../../services/category.service';
import { Graph } from '../../interfaces';

interface ExtendedGraph extends Graph {
  selectedForExport?: boolean;
  showShareBar?: boolean;
}

interface CategoryWithGraphs {
  category: Category;
  graphs: ExtendedGraph[];
}

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, GraphComponent, ShareBar],
  templateUrl: './report.component.html',
  styleUrls: ['./report.component.scss']
})
export class ReportComponent implements OnInit {
  private cookieService = inject(CookieService);
  private router = inject(Router);
  private categoryService = inject(CategoryService);

  categories = signal<CategoryWithGraphs[]>([]);

  ngOnInit(): void {
    this.loadSavedGraphs();
  }

  private loadSavedGraphs(): void {
    const savedGraphs = this.cookieService.getSavedGraphs();
    this.categoryService.getCategories().then(() => {

      
      const graphsByCategories = this.categoryService.categories()?.map(category => ({
        category,
        graphs: savedGraphs.filter(graph => graph.data.categoryId === category.Category_ID)
      })).filter(c => c.graphs.length > 0)
        .map(c => ({ ...c, graphs: c.graphs.map(graph => ({...graph, selectedForExport: true, showShareBar: false}))
        }));
      
      this.categories.set(graphsByCategories!)
    })
  }
    
  exportToExcel(): void {
    const allGraphs = this.categories().flatMap(cat => cat.graphs);
    const selectedGraphs = allGraphs.filter(graph => graph.selectedForExport);
    if (selectedGraphs.length === 0) {
      return;
    }
    this.cookieService.exportToExcel();
  }

  toggleExportSelection(graphId: string): void {
    const updatedCategories = this.categories().map(categoryGroup => ({
      ...categoryGroup,
      graphs: categoryGroup.graphs.map(graph =>
        graph.id === graphId
          ? { ...graph, selectedForExport: !graph.selectedForExport }
          : graph
      )
    }));
    this.categories.set(updatedCategories);
  }

  returnToGraph(graph: ExtendedGraph): void {
    this.router.navigate(['/category']).then(() => {
      this.categoryService.setSelectedSavedGraph(graph.id);
    });
  }

  toggleShareBar(graph: ExtendedGraph): void {
    graph.showShareBar = !graph.showShareBar;
  }

  closeShareBar(graph: ExtendedGraph): void {
    graph.showShareBar = false;
  }

  getShareUrl(graph: ExtendedGraph): string {
    const data = graph.data;
    const categoryId = data.categoryId;
    const measureId = data.filterGroups.find((fg:any) => fg.measureId)?.measureId;
    if (!measureId) {
      return '';
    }

    const checkedFilters = data.filterGroups
      .map((fg:any) => ({
        filterId: fg.filter.id,
        checkedLabels: fg.filter.labels?.filter((l:any) => l.data.checked).map((l:any) => l.title)
      }))
      .filter((f:any) => f.checkedLabels?.length > 0);

    const shareableData = {
      categoryId,
      measureId,
      checkedFilters
    };

    const baseUrl = window.location.origin;
    const graphDataString = JSON.stringify(shareableData);
    const encodedGraphData = encodeURIComponent(graphDataString);

    return `${baseUrl}/category?id=${categoryId}&graph=${encodedGraphData}`;
  }

  removeGraph(graphId: string): void {
    if (confirm('האם אתה בטוח שברצונך למחוק גרף זה?')) {
      this.cookieService.removeGraph(graphId);
      this.loadSavedGraphs(); // Reload the list
    }
  }

  clearAllGraphs(): void {
    if (confirm('האם אתה בטוח שברצונך למחוק את כל הגרפים השמורים?')) {
      this.cookieService.clearAllGraphs();
      this.loadSavedGraphs(); // Reload the list
    }
  }
}
