import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, computed, effect, inject, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { CookieService } from "../../services/cookie.service";
import { ShareBar } from "../share-bar/share-bar";
import { FilterGroup, Graph, GraphData } from "../../interfaces";

import { ErrorService } from "../../services/error.service";
import { CategoryService } from "../../services/category.service";
import { graphColors } from "../../services/static.data";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

export type ChartType = 'line' | 'stacked-column';

/** Screen-reader equivalent of the chart: x-axis labels as rows, series as columns */
export interface ChartTable {
  caption: string;
  summary: string;
  columnHeader: string;
  series: string[];
  rows: { label: string; values: string[] }[];
}

@Component({
  selector: "app-graph",
  standalone: true,
  imports: [CommonModule, ShareBar],
  templateUrl: "./graph.component.html",
  styleUrls: ["./graph.component.scss"]
})
export class GraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() categoryId: string = "DEM01";
  @Input() data: GraphData | undefined = undefined;
  @Input() filterGroups: FilterGroup[] | null = null;
  @Input() headless = false;
  @Input() isLoading = false;

  emptyGraph: GraphData = {
    categoryId: '',
    title: '',
    type: '',
    categories: {
      measureId: '',
      title: '',
      expanded: false,
      filter: {
        id: '',
        name: '',
        property: '',
        expanded: false,
        labels: [],
      }
    },
    series: [],
    filterGroups: []
  }
  graphReload = output<void>();
  graphSaved = output<void>();
  graphData = signal<GraphData>(this.emptyGraph);
  chartTable = signal<ChartTable | null>(null);
  successMessage = signal<string | null>(null);
  messageType = signal<'success' | 'error'>('success');
  noCategory = signal<boolean>(false);
  @ViewChild("chartEl") chartEl: ElementRef<HTMLDivElement> | undefined;

  private chart?: echarts.ECharts;
  private cookieService = inject(CookieService);
  private errorService = inject(ErrorService);
  private categoryService = inject(CategoryService);

  showShareBar = false;

  hasError = computed(() => {
    const errorState = this.errorService.failedMeasuresSignal();
    if (errorState.has('global')) return true;

    const measureId = this.categoryService.selectedMeasure();
    if (!measureId) return false;
    return errorState.has(measureId);
  });

  
  activeFilters = computed(() => {
    const data = this.graphData();
    if (!data || !data.categories?.measureId) return [];

    const measureId = data.categories.measureId;

    return (data.filterGroups || [])
      .filter(fg => fg.measureId === measureId)
      .map(fg => {
        const activeLabels = (fg.filter.labels || [])
          .filter(l => l.data.checked)
          .map(l => l.title)
          .join(', ');

        if (activeLabels) {
          return `${fg.filter.name}: ${activeLabels}`;
        }
        return null;
      })
      .filter((s): s is string => s !== null);
  });

  showSuccessMessage(message: string, type: 'success' | 'error' = 'success'): void {
    this.successMessage.set(message);
    this.messageType.set(type);
    setTimeout(() => {
      this.successMessage.set(null);
    }, 2000);
  }

  ngAfterViewInit(): void {
    this.getChartData();
    this.initChart();
    window.addEventListener("resize", this.onResize);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.chart?.dispose();
      this.chart = undefined;

      this.getChartData();
      this.noCategory.set(!this.data?.categories?.filter?.labels?.some(l => l.data.checked));
      setTimeout(() => { this.initChart(); });
    }
  }

  ngOnDestroy(): void {
    this.chart?.dispose();
    window.removeEventListener("resize", this.onResize);
  }

  private getChartData() {
    if (!this.data) {
      this.graphData.set(this.emptyGraph);
      return;
    }
    const processedData: GraphData = {
      ...this.data,
      series: this.handleDuplicateSeriesNames(this.data.series)
    };

    this.graphData.set(processedData);
  }

  private handleDuplicateSeriesNames(series: any[]): any[] {
    if (!series) return [];
    const nameToGroups = new Map<string, Set<string>>();
    series.forEach(s => {
      const name = s.name?.toString().trim();
      const group = s.groupTitle?.toString().trim();
      if (name && group) {
        if (!nameToGroups.has(name)) nameToGroups.set(name, new Set());
        nameToGroups.get(name)!.add(group);
      }
    });

    return series.map(s => {
      const name = s.name?.toString().trim();
      const group = s.groupTitle?.toString().trim();

      if (name && group && nameToGroups.get(name)!.size > 1) {
        return {
          ...s,
          name: `${name} (${group})`
        };
      }
      return s;
    });
  }

  private initChart() {
    if (this.graphData() && this.chartEl?.nativeElement && !this.chart) {
      this.chart = echarts.init(this.chartEl.nativeElement);
      this.updateChart();
    }
  }

  private updateChart() {
    if (!this.chart) return;
    const chartData = this.graphData();
    const isLine = this.data?.type?.toLowerCase().includes('line');

    const isRate = chartData?.series?.some(s =>
      s.data.some((val: number) => val !== null && val !== undefined && val % 1 !== 0)
    );
    const maxSeriesValue = chartData?.series?.reduce((max: number, s: any) =>
      Math.max(max, ...s.data.filter((v: number) => v !== null && v !== undefined).map(Number)), 0
    ) ?? 0;
    const isPercentRate = isRate && maxSeriesValue <= 1;
    if (isPercentRate) {
      chartData.series.forEach((s: any) => {
        s.data = s.data.map((v: number) => v !== null && v !== undefined ? v * 100 : v);
      });
    }


    const reversedSeries = [...(chartData?.series || [])].reverse();
    const visibleSeries = reversedSeries.filter(s => {
      let filteredData = s.data;
      if (chartData?.categories?.filter?.labels) {
        const checkedIndices = chartData.categories.filter.labels
          .map((label, idx) => label.data.checked ? idx : -1)
          .filter(idx => idx !== -1);
        filteredData = checkedIndices.map(idx => s.data[idx]);
      }
      return filteredData.some((val: number) => val !== 0 && val !== null && val !== undefined);
    });

    const hasVisibleStackedBars = visibleSeries.some((series: any) => series.stack);

    const option: echarts.EChartsCoreOption = {
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: isLine ? 'line' : 'shadow',
          lineStyle: {
            color: '#0068F514',
            width: 70,
            padding: 10,
            type: 'solid'
          },
          shadowStyle: {
            color: 'rgba(0, 104, 245, 0.08)'
          },
          crossStyle: {
            color: '#0068F514',
            width: 100,
            type: 'solid'
          }
        },
        textStyle: { fontFamily: "Rubik, sans-serif" },
        extraCssText: 'max-width: 400px; overflow: hidden; word-wrap: break-word;',
        formatter: (params: any) => {
          if (!Array.isArray(params)) return '';
          const filteredParams = params.filter((param: any) =>
            param.value !== 0 && param.value !== undefined && param.value !== null
        );
        
        if (filteredParams.length === 0) return '';
        
        const tooltipItems = filteredParams.map((param: any, idx: number) => {
            const value = typeof param.value === 'number'
              ? (isPercentRate
                ? param.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%'
                : param.value.toLocaleString(undefined, { maximumFractionDigits: 2 }))
              : param.value;

            const seriesIndex = param.seriesIndex;
            const series = visibleSeries[seriesIndex];
            const isStackedSeries = !!series?.stack;

            let title;
            const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
            if (hasMultipleMeasures && !isStackedSeries) {
              const measureSeries = chartData.series.filter((s: any) => !s.stack);
              const measureIndex = measureSeries.findIndex((s: any) => s.name === series?.name);
              title = `מדד ${measureIndex + 1}`;
            } else {
              const seriesName = (series?.name || param.seriesName)?.toString().trim();
              title = seriesName?.length > 20
                ? seriesName.substring(0, 20) + '...'
                : seriesName;
            }

            const colorIndex = graphColors.findIndex(c =>
              c.toLowerCase() === param.color?.toString().toLowerCase()
            );
            const colorClass = colorIndex === -1
              ? 'tooltip-color'
              : `tooltip-color tooltip-color--${colorIndex}`;

            const isRegularBar = hasVisibleStackedBars && !isStackedSeries;

            const titleClass = isRegularBar
              ? 'tooltip-title tooltip-title--emphasized'
              : 'tooltip-title';

            return `<div class="tooltip-item">
              <div class="${colorClass}"></div>
              <span class="${titleClass}">${title}</span>
              <span class="tooltip-value">${value}</span>
            </div>`;
          }).reverse().join('');

          return `<div class="tooltip-container">${tooltipItems}</div>`;
        }
      },
      legend: {
        type: 'scroll',
        right: 20,
        top: 10,
        orient: 'horizontal',
        icon: 'circle',
        itemGap: 20,
        itemWidth: 12,
        itemHeight: 12,
        textStyle: {
          color: "#123248",
          fontFamily: "Rubik, sans-serif",
          fontSize: 12
        },
        pageIconSize: 12,
        pageTextStyle: {
          color: "#123248"
        },
        pageButtonPosition: 'start',
        data: visibleSeries.map((s, idx, arr) => {
          const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
          const isStackedSeries = s.stack;
          if (hasMultipleMeasures && !isStackedSeries) {
            const measureSeries = chartData.series.filter((series: any) => !series.stack);
            const measureIndex = measureSeries.findIndex((series: any) => series.name === s.name);
            return `מדד ${measureIndex + 1}`;
          }
          return s.name.toString().trim();
        })
      },
      grid: { left: 40, right: 24, top: 100, bottom: 40 },
      xAxis: {
        type: "category",
        data: chartData?.categories?.filter?.labels?.filter(l => l.data.checked).map(l => l.title),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#6b7a90", fontFamily: "Rubik, sans-serif" },
        splitLine: { show: true, lineStyle: { color: "rgba(90, 124, 167, 0.1)" } }
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: "rgba(90, 124, 167, 0.15)" } },
        axisLabel: {
          color: "#866b90ff",
          fontFamily: "Rubik, sans-serif",
          formatter: isPercentRate ? '{value}%' : '{value}'
        }
      },
      series: visibleSeries.map(s => {
        const isLine = this.data?.type?.toLowerCase().includes('line');
        const isStacked = this.data?.type?.toLowerCase().includes('stacked');

        let filteredData = s.data;
        if (chartData?.categories?.filter?.labels) {
          const checkedIndices = chartData.categories.filter.labels
            .map((label, idx) => label.data.checked ? idx : -1)
            .filter(idx => idx !== -1);
          filteredData = checkedIndices.map(idx => s.data[idx]);
        }

        const seriesName = s.name.toString().trim();

        let displayName = seriesName;
        const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
        const isStackedSeries = s.stack;
        if (hasMultipleMeasures && !isStackedSeries) {
          const measureSeries = chartData.series.filter((series: any) => !series.stack);
          const measureIndex = measureSeries.findIndex((series: any) => series.name === s.name);
          displayName = `מדד ${measureIndex + 1}`;
        }

        const seriesConfig: any = {
          name: displayName,
          type: isLine ? 'line' : 'bar',
          data: isLine ? filteredData : filteredData.map(v => v === 0 ? null : v),
          itemStyle: { color: s.color },
          z: 10
        };

        if (isLine) {
          seriesConfig.smooth = true;
          seriesConfig.symbol = 'circle';
          seriesConfig.symbolSize = 7;
          seriesConfig.itemStyle = { color: s.color };
          seriesConfig.label = { show: false };
        } else {
          if (isStacked) {
            seriesConfig.stack = s.stack || undefined;
          }
          seriesConfig.itemStyle = {
            ...seriesConfig.itemStyle,
            borderWidth: 3,
            borderColor: 'rgba(255, 255, 255, 0)',
            borderRadius: [5, 5, 0, 0]
          };
          seriesConfig.barWidth = hasVisibleStackedBars && !s.stack ? 18 : 12;
          seriesConfig.barMinHeight = 6;
          seriesConfig.barGap = '20%';
          seriesConfig.label = {
            show: false,
            position: 'top',
            color: '#6b7a90',
            fontFamily: 'Rubik, sans-serif'
          };
        }
        return seriesConfig;
      })
    };
    this.chart.setOption(option, true);
    this.chartTable.set(this.buildChartTable(!!isPercentRate));
  }

  saveGraph(): void {
    if (!this.data) {
      return;
    }

    const saved = this.cookieService.saveGraph({
      id: Date.now().toString(),
      title: this.graphData()?.title!,
      subtitle: this.graphData()?.description || '',
      data: this.data,
    });

    if (saved) {
      this.graphSaved.emit();
      this.showSuccessMessage('הגרף נשמר בהצלחה', 'success');
    } else {
      this.showSuccessMessage('הגרף כבר קיים', 'error');
    }
  }

  exportToExcel(): void {
    if (!this.data) {
      return;
    }

    const graph: Graph = {
      id: Date.now().toString(),
      title: this.graphData()?.title || '',
      subtitle: this.graphData()?.description || '',
      data: this.data,
    };

    this.cookieService.exportToExcel([graph]);
  }

  toggleShareBar(show?: boolean): void {
    show !== undefined ? this.showShareBar = show : this.showShareBar = !this.showShareBar;
  }

  closeShareBar(): void {
    this.showShareBar = false;
  }

  getShareUrl(): string {
    if (!this.data) {
      return '';
    }

    const categoryId = this.data.categoryId;
    const measureIds = this.data.measureIds?.length
      ? this.data.measureIds
      : (this.data.categories?.measureId ? [this.data.categories.measureId] : []);
    if (measureIds.length === 0) {
      return '';
    }

    const checkedFilters = this.data.filterGroups
      .filter(fg => measureIds.includes(fg.measureId))
      .map(fg => ({
        filterId: fg.filter.id,
        checkedLabels: fg.filter.labels?.filter(l => l.data.checked).map(l => l.title)
      }))
      .filter(f => f.checkedLabels?.length > 0)
      .filter((f, i, arr) => arr.findIndex(x => x.filterId === f.filterId) === i);

    const shareableData = {
      categoryId,
      measureIds,
      checkedFilters
    };

    const baseUrl = window.location.origin;
    const graphDataString = JSON.stringify(shareableData);
    const encodedGraphData = encodeURIComponent(graphDataString);

    return `${baseUrl}/category?id=${categoryId}&graph=${encodedGraphData}`;
  }

  private buildChartTable(isPercentRate: boolean): ChartTable | null {
    const chartData = this.graphData();
    if (!chartData || !chartData.series?.length) {
      return null;
    }

    const labels = chartData.categories?.filter?.labels || [];
    const checkedIndices = labels
      .map((label, idx) => label.data?.checked ? idx : -1)
      .filter(idx => idx !== -1);
    const indices = checkedIndices.length ? checkedIndices : labels.map((_, idx) => idx);
    if (indices.length === 0) return null;

    // Same predicate the chart uses to drop empty series, in the original order
    const series = chartData.series.filter((s: any) =>
      indices.some(idx => {
        const value = s.data?.[idx];
        return value !== 0 && value !== null && value !== undefined;
      })
    );
    if (series.length === 0) return null;

    // Alongside stacked series, a series with no stack is the overall value
    const hasStackedSeries = series.some((s: any) => s.stack);
    const seriesNames = series.map((s: any, idx: number) => {
      const name = s.name?.toString().trim() || `סדרה ${idx + 1}`;
      if (s.stack) return `${s.stack.toString().trim()}, ${name}`;
      return hasStackedSeries ? `${name}, כללי` : name;
    });

    const rows = indices.map(labelIndex => ({
      label: labels[labelIndex]?.title?.toString().trim() || `${labelIndex + 1}`,
      values: series.map((s: any) => this.formatTableValue(s.data?.[labelIndex], isPercentRate))
    }));

    const subtitles = chartData.subtitles?.split('#').map((s: string) => s.trim()).filter(Boolean) || [];
    const caption = [
      chartData.title || 'גרף',
      chartData.description,
      ...subtitles.map((s: string, idx: number) => subtitles.length > 1 ? `מדד ${idx + 1}: ${s}` : s),
      ...this.activeFilters()
    ].filter(Boolean).join('. ');

    return {
      caption: `${caption}. טבלת הנתונים של הגרף`,
      summary: `הגרף עודכן. ${rows.length} שורות, ${seriesNames.length} סדרות נתונים`,
      columnHeader: chartData.categories?.filter?.name?.toString().trim() || 'שנה',
      series: seriesNames,
      rows
    };
  }

  private formatTableValue(value: any, isPercentRate: boolean): string {
    if (value === null || value === undefined || value === '') {
      return 'אין ערך';
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);

    const text = num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return isPercentRate ? `${text}%` : text;
  }

  private onResize = () => this.chart?.resize();

  reload() {
    this.chart?.clear();
    this.graphReload.emit();
  }
}
