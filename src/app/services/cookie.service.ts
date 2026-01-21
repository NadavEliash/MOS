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

  saveGraph(graph: Graph): void {
    const newGraph: Graph = {
      ...graph,
      id: this.generateId(),
    };

    this.savedGraphs.update(graphs => [...graphs, newGraph]);
    this.setSavedGraphs(this.savedGraphs());
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