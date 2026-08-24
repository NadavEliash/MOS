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

      const workbook = XLSX.utils.book_new();
      workbook.Props = {
        Title: title,
        Subject: 'נתונים מאתר סקירת שירותי הרווחה',
        Author: 'משרד הרווחה והביטחון החברתי',
        Language: 'he-IL'
      };
      const usedSheetNames: string[] = [];
      const names: { Name: string; Ref: string }[] = [];

      savedGraphs.forEach((graph, index) => {
        const table = this.buildGraphTable(graph);
        const sheet = XLSX.utils.aoa_to_sheet(table.rows);
        const sheetName = this.uniqueSheetName(graph.title || `גרף ${index + 1}`, usedSheetNames);
        usedSheetNames.push(sheetName);

        const firstRow = table.headerRowIndex;
        const lastRow = table.headerRowIndex + table.bodyRowCount;
        const lastCol = table.headers.length - 1;
        const ref = `${XLSX.utils.encode_cell({ r: firstRow, c: 0 })}:${XLSX.utils.encode_cell({ r: lastRow, c: lastCol })}`;
        sheet['!autofilter'] = { ref };
        sheet['!cols'] = table.colWidths.map(wch => ({ wch }));

        XLSX.utils.book_append_sheet(workbook, sheet, sheetName);

        const absRef = `$A$${firstRow + 1}:$${XLSX.utils.encode_col(lastCol)}$${lastRow + 1}`;
        names.push({
          Name: `Table_${index + 1}`,
          Ref: `'${sheetName.replace(/'/g, "''")}'!${absRef}`
        });
      });

      workbook.Workbook = { ...workbook.Workbook, Views: [{ RTL: true }], Names: names };

      XLSX.writeFile(workbook, `${title}.xlsx`);
    } catch (error) {
      console.error('Error exporting graphs to Excel:', error);
    }
  }

  private buildGraphTable(graph: Graph): {
    rows: (string | number)[][];
    headers: string[];
    headerRowIndex: number;
    bodyRowCount: number;
    colWidths: number[];
  } {
    const series: any[] = graph.data.series ?? [];
    const allLabels = graph.data.categories?.filter?.labels ?? [];
    const checkedIndices = allLabels
      .map((label: any, idx: number) => (label.data.checked ? idx : -1))
      .filter((idx: number) => idx !== -1);
    const xAxisLabels = checkedIndices.map((idx: number) => String(allLabels[idx].title).trim());

    const groupTitleOf = (s: any) => s?.groupTitle?.toString().trim() ?? '';
    const sharedGroupTitle = (list: any[], fallback: string) => {
      const titles = new Set(list.map(groupTitleOf).filter(Boolean));
      return titles.size === 1 ? [...titles][0] : fallback;
    };

    const isMultiMeasure = (graph.data.measureIds?.length ?? 0) > 1;
    const stackedSeries = series.filter(s => s.stack);
    const parentSeries = series.filter(s => !s.stack);
    const hasStacks = stackedSeries.length > 0;

    const valueHeader = graph.data.isPercent ? 'אחוז' : graph.data.isRate ? 'יחס' : 'סך הכל';
    const xAxisHeader = graph.data.categories?.filter?.name?.toString().trim() || 'שנה';
    const groupHeader = isMultiMeasure ? 'מדד' : sharedGroupTitle(parentSeries, 'קבוצה');

    const headers = hasStacks
      ? [groupHeader, sharedGroupTitle(stackedSeries, 'פילוח'), xAxisHeader, valueHeader]
      : [groupHeader, xAxisHeader, valueHeader];

    const body: (string | number)[][] = [];
    series.forEach((s: any) => {
      const name = String(s.name ?? '').trim();
      const stack = s.stack ? String(s.stack).trim() : '';

      checkedIndices.forEach((dataIdx: number, idx: number) => {
        const value = this.toCellValue(s.data?.[dataIdx]);
        body.push(hasStacks
          ? [stack || name, stack ? name : 'כללי', xAxisLabels[idx], value]
          : [name, xAxisLabels[idx], value]);
      });
    });

    const heading: (string | number)[][] = [];
    if (graph.title) heading.push([String(graph.title).trim()]);
    if (graph.subtitle) heading.push([String(graph.subtitle).trim()]);

    const subtitles = (graph.data.subtitles?.split('#') ?? []).filter((s: string) => s?.trim());
    if (subtitles.length > 1) {
      subtitles.forEach((subtitle: string, idx: number) => {
        heading.push([`מדד ${idx + 1}: ${subtitle.trim()}`]);
      });
    }
    // A single blank row keeps the heading block out of the table region
    if (heading.length) heading.push([]);

    const colWidths = headers.map((header, col) => {
      const longest = body.reduce(
        (max, row) => Math.max(max, String(row[col] ?? '').length),
        header.length
      );
      return Math.min(Math.max(longest + 2, 10), 40);
    });

    return {
      rows: [...heading, headers, ...body],
      headers,
      headerRowIndex: heading.length,
      bodyRowCount: body.length,
      colWidths
    };
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
