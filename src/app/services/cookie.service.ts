import { Injectable, signal, WritableSignal } from '@angular/core';
import { Graph } from '../interfaces';

@Injectable({
  providedIn: 'root'
})
export class CookieService {
  private readonly SAVED_GRAPHS_KEY = 'savedGraphs';
  savedGraphs: WritableSignal<Graph[]> = signal([]);

  constructor() {
    this.savedGraphs.set(this.getSavedGraphsFromLocalStorage());
  }

  saveGraph(graph: Graph): boolean {
    // Check if the same graph already exists
    const isDuplicate = this.savedGraphs().some(savedGraph =>
      this.areGraphsEqual(savedGraph.data, graph.data)
    );

    if (isDuplicate) {
      return false; // Graph already exists, don't save
    }

    const newGraph: Graph = {
      ...graph,
      id: this.generateId(),
    };

    this.savedGraphs.update(graphs => [...graphs, newGraph]);
    this.setSavedGraphs(this.savedGraphs());
    return true; // Graph saved successfully
  }

  private areGraphsEqual(graph1: any, graph2: any): boolean {
    // Compare category IDs and measure titles
    if (graph1.categoryId !== graph2.categoryId || graph1.title !== graph2.title) {
      return false;
    }

    // Compare checked category labels
    const labels1 = graph1.categories?.filter?.labels
      ?.filter((l: any) => l.data.checked)
      .map((l: any) => l.title)
      .sort((a: any, b: any) => String(a).localeCompare(String(b), undefined, { numeric: true })) || [];
    const labels2 = graph2.categories?.filter?.labels
      ?.filter((l: any) => l.data.checked)
      .map((l: any) => l.title)
      .sort((a: any, b: any) => String(a).localeCompare(String(b), undefined, { numeric: true })) || [];

    if (JSON.stringify(labels1) !== JSON.stringify(labels2)) {
      return false;
    }

    // Compare series (names and data)
    const series1 = graph1.series?.map((s: any) => ({
      name: s.name,
      data: s.data
    })).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })) || [];

    const series2 = graph2.series?.map((s: any) => ({
      name: s.name,
      data: s.data
    })).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true })) || [];

    return JSON.stringify(series1) === JSON.stringify(series2);
  }

  getSavedGraphs(): Graph[] {
    return this.savedGraphs();
  }

  private getSavedGraphsFromLocalStorage(): Graph[] {
    try {
      const data = localStorage.getItem(this.SAVED_GRAPHS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error reading saved graphs from localStorage:', error);
      return [];
    }
  }

  removeGraph(graphId: string): void {
    this.savedGraphs.update(graphs => graphs.filter(graph => graph.id !== graphId));
    this.setSavedGraphs(this.savedGraphs());
  }

  clearAllGraphs(): void {
    this.savedGraphs.set([]);
    localStorage.removeItem(this.SAVED_GRAPHS_KEY);
  }

  private setSavedGraphs(graphs: Graph[]): void {
    try {
      localStorage.setItem(this.SAVED_GRAPHS_KEY, JSON.stringify(graphs));
    } catch (error) {
      console.error('Error saving graphs to localStorage:', error);
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async exportToExcel(graphs?: Graph[]): Promise<void> {
    const savedGraphs = graphs ?? this.getSavedGraphs();
    if (savedGraphs.length === 0) {
      return;
    }

    const title = graphs?.length === 1 ? graphs[0].title : graphs?.map(g => g.title).join('_') || 'גרף מאתר נתוני הרווחה';

    try {
      // Loaded on demand so the spreadsheet library stays out of the initial bundle
      const XLSX = await import('xlsx');

      // Build a workbook with one sheet per graph
      const workbook = XLSX.utils.book_new();
      // Open every sheet right-to-left, matching the Hebrew content
      workbook.Workbook = { ...workbook.Workbook, Views: [{ RTL: true }] };
      const usedSheetNames: string[] = [];

      savedGraphs.forEach((graph, index) => {
        const sheet = XLSX.utils.aoa_to_sheet(this.convertGraphToRows(graph));
        const sheetName = this.uniqueSheetName(graph.title || `גרף ${index + 1}`, usedSheetNames);
        usedSheetNames.push(sheetName);
        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      });

      XLSX.writeFile(workbook, `${title}.xlsx`);
    } catch (error) {
      console.error('Error exporting graphs to Excel:', error);
    }
  }
  
  private convertGraphToRows(graph: Graph): (string | number)[][] {
    const rows: (string | number)[][] = [];

    const allLabels = graph.data.categories.filter.labels;
    const checkedIndices = allLabels
      .map((label: any, idx: number) => (label.data.checked ? idx : -1))
      .filter((idx: number) => idx !== -1);
    const xAxisLabels = checkedIndices.map((idx: number) => allLabels[idx].title);
    
    rows.push([graph.title]);
    rows.push([graph.subtitle]);

    if (graph.data.subtitles?.split('#').length > 1) {
      graph.data.subtitles.split('#').forEach((subtitle: string, idx: number) => {
        rows.push([`מדד ${idx + 1}: ${subtitle}`]);
      });
    }
    const titles: string[] = graph.data.series.map((s: any) => s.groupTitle.toString().trim());    
    const filterTitles = new Set(titles);
    const valueHeader = graph.data.isPercent ? 'אחוז' : graph.data.isRate ? 'יחס' : 'סך הכל';
    rows.push([...filterTitles, 'שנה', valueHeader]);

    graph.data.series.forEach((s: any) => {
      const alignedData = checkedIndices.map((idx: number) => this.toCellValue(s.data?.[idx]));
      let rowLabel = `${s.name.toString().trim()}`;
      if (s.stack) {
        const stackName = graph.data.series.find((serie: any) => serie.name === s.stack).groupTitle.trim();
        rowLabel = `${stackName}: ${s.stack.trim()}, ${rowLabel}`;
      }
      
      alignedData.forEach((value: any, idx: number) => {        
        if (filterTitles.size > 1) {
          rows.push([s.stack ? s.stack.toString().trim() : s.name.toString().trim(), s.stack ? s.name.toString().trim() : 'כללי', xAxisLabels[idx], value]);
        } else {
          rows.push([s.name.toString().trim(), xAxisLabels[idx], value]);
        }
      })
    });

    return rows;
  }

  // Keep numeric values numeric so Excel can sum and chart them
  private toCellValue(value: any): string | number {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : String(value);
  }

  // Excel sheet names: max 31 chars, no []:*?/\ and unique within the workbook
  private uniqueSheetName(title: string, used: string[]): string {
    const base = (title.replace(/[\[\]:*?\/\\]/g, ' ').trim() || 'גרף').substring(0, 31);

    let name = base;
    let suffix = 2;
    while (used.includes(name)) {
      const tag = ` (${suffix++})`;
      name = base.substring(0, 31 - tag.length) + tag;
    }
    return name;
  }
}
