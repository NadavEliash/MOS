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
      .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })) || [];
    const labels2 = graph2.categories?.filter?.labels
      ?.filter((l: any) => l.data.checked)
      .map((l: any) => l.title)
      .sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })) || [];

    if (JSON.stringify(labels1) !== JSON.stringify(labels2)) {
      return false;
    }

    // Compare series (names and data)
    const series1 = graph1.series?.map((s: any) => ({
      name: s.name,
      data: s.data
    })).sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true })) || [];

    const series2 = graph2.series?.map((s: any) => ({
      name: s.name,
      data: s.data
    })).sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true })) || [];

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

  exportToExcel(graphs?: Graph[]): void {
    const savedGraphs = graphs ?? this.getSavedGraphs();
    if (savedGraphs.length === 0) {
      return;
    }

    // Create CSV content
    const csvContent = '\ufeff' + this.convertGraphsToCSV(savedGraphs);

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `graphs_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private convertGraphsToCSV(graphs: Graph[]): string {
    let csv = '';

    graphs.forEach((graph, index) => {
      if (index > 0) {
        csv += '\n\n'; // Separate graphs
      }

      const xAxisLabels = graph.data.categories.filter.labels
        .filter((l: any) => l.data.checked)
        .map((l: any) => l.title);

      csv += Array(8).fill('') + graph.title.replace(',', ' ') + '\n';
      csv += graph.subtitle + '\n';

      const headerRow = [...xAxisLabels, ''];
      csv += headerRow.map(cell => `"${cell}"`).join(',') + '\n';

      graph.data.series.forEach((s: any) => {
        const row = [...s.data, s.name];
        csv += row.map(cell => `"${cell}"`).join(',') + '\n';
      });
    });

    return csv;
  }
}