import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, computed, inject, output, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { CookieService } from "../../services/cookie.service";
import { ShareBar } from "../share-bar/share-bar";
import { FilterGroup, Graph, GraphData } from "../../interfaces";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

export type ChartType = 'line' | 'stacked-column';

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
  successMessage = signal<string | null>(null);
  messageType = signal<'success' | 'error'>('success');
  noCategory = signal<boolean>(false);
  @ViewChild("chartEl") chartEl: ElementRef<HTMLDivElement> | undefined;

  private chart?: echarts.ECharts;
  private cookieService = inject(CookieService);

  showShareBar = false;

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
        return null; // Should be filtered out
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
    if (changes['data'] || changes['chartType']) {
      this.getChartData();
      this.noCategory.set(!this.data?.categories?.filter?.labels?.some(l => l.data.checked));
      if (this.chart) {
        this.updateChart();
      } else {
        setTimeout(() => { this.initChart(); this.updateChart() });
      }
    }
  }

  ngOnDestroy(): void {
    this.chart?.dispose();
    window.removeEventListener("resize", this.onResize);
  }

  private getChartData() {
    this.graphData.set(this.data || this.emptyGraph);
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

    // Check if this is a rate measure (values are percentages)
    const isRate = chartData?.series?.some(s =>
      s.data.some((val: number) => val > 0 && val <= 100)
    ) && chartData?.series?.every(s =>
      s.data.every((val: number) => val === 0 || (val > 0 && val <= 100))
    );

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

          // Check if this is a rate measure (values are percentages)
          const isRateMeasure = chartData?.series?.some(s =>
            s.data.some((val: number) => val > 0 && val <= 100)
          ) && chartData?.series?.every(s =>
            s.data.every((val: number) => val === 0 || (val > 0 && val <= 100))
          );

          // Check if there are any stacked bars in the series
          const hasStackedBars = (chartData?.series || []).some((s: any) => s.stack);

          // Filter out items with value of 0 or undefined
          const filteredParams = params.filter((param: any) =>
            param.value !== 0 && param.value !== undefined && param.value !== null
          );

          if (filteredParams.length === 0) return '';

          const tooltipItems = filteredParams.map((param: any, idx: number) => {
            const value = typeof param.value === 'number'
              ? (isRateMeasure
                ? param.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + '%'
                : param.value.toLocaleString(undefined, { maximumFractionDigits: 2 }))
              : param.value;

            // Find the corresponding series by matching seriesIndex from ECharts
            const seriesIndex = param.seriesIndex;
            const reversedIndex = (chartData?.series?.length || 0) - 1 - seriesIndex;
            const series = chartData?.series?.[reversedIndex];
            const isStackedSeries = !!series?.stack;

            // Only use 'מדד + index' for non-stacked series when there are multiple measures
            let title;
            const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
            if (hasMultipleMeasures && !isStackedSeries) {
              // This is a measure bar, use 'מדד + index' pattern
              // Only count non-stacked series (measure bars) for the index
              const measureSeries = chartData.series.filter((s: any) => !s.stack);
              const measureIndex = measureSeries.findIndex((s: any) => s.name === series?.name);
              title = `מדד ${measureIndex + 1}`;
            } else {
              // This is a filter bar, use the actual name from the series object
              const seriesName = (series?.name || param.seriesName)?.toString().trim();
              title = seriesName?.length > 20
                ? seriesName.substring(0, 20) + '...'
                : seriesName;
            }

            const color = param.color || '#000';
            const isRegularBar = hasStackedBars && !isStackedSeries;

            // Apply bold and underline to regular bars when stacked bars exist
            const titleStyle = isRegularBar
              ? 'font-weight: 700; text-decoration: underline;'
              : '';

            return `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; flex-shrink: 0;"></div>
              <span style="color: #6b7a90; flex: 1; margin-right: 8px; text-align: right; ${titleStyle}">${title}</span>
              <span style="font-weight: 600; color: #123248; margin-right: 16px;">${value}</span>
            </div>`;
          }).reverse().join('');

          return `<div style="padding: 8px 12px; background-color: rgba(255,255,255,0.95); border-radius: 4px;">${tooltipItems}</div>`;
        }
      },
      legend: {
        type: 'scroll',
        right: 20,
        top: 10,
        orient: 'horizontal',
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
        // Filter legend to only show series with non-zero data
        data: [...(chartData?.series || [])].reverse()
          .filter(s => {
            // Check if series has any non-zero values
            let filteredData = s.data;
            if (chartData?.categories?.filter?.labels) {
              const checkedIndices = chartData.categories.filter.labels
                .map((label, idx) => label.data.checked ? idx : -1)
                .filter(idx => idx !== -1);
              filteredData = checkedIndices.map(idx => s.data[idx]);
            }
            return filteredData.some((val: number) => val !== 0 && val !== null && val !== undefined);
          })
          .map((s, idx, arr) => {
            // Only use 'מדד + index' for non-stacked series when there are multiple measures
            const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
            const isStackedSeries = s.stack;
            if (hasMultipleMeasures && !isStackedSeries) {
              // Only count non-stacked series (measure bars) for the index
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
          formatter: isRate ? '{value}%' : '{value}'
        }
      },
      series: [...(chartData?.series || [])].reverse().map(s => {
        const isLine = this.data?.type?.toLowerCase().includes('line');
        const isStacked = this.data?.type?.toLowerCase().includes('stacked');

        // Check if there are any stacked bars in the entire series
        const hasStackedBars = (chartData?.series || []).some((series: any) => series.stack);

        // Filter data to match checked x-axis labels
        let filteredData = s.data;
        if (chartData?.categories?.filter?.labels) {
          const checkedIndices = chartData.categories.filter.labels
            .map((label, idx) => label.data.checked ? idx : -1)
            .filter(idx => idx !== -1);
          filteredData = checkedIndices.map(idx => s.data[idx]);
        }

        const seriesName = s.name.toString().trim();
        const groupTitle = (s as any).groupTitle;

        // Only use 'מדד + index' for non-stacked series when there are multiple measures
        let displayName = seriesName;
        const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
        const isStackedSeries = s.stack;
        if (hasMultipleMeasures && !isStackedSeries) {
          // Only count non-stacked series (measure bars) for the index
          const measureSeries = chartData.series.filter((series: any) => !series.stack);
          const measureIndex = measureSeries.findIndex((series: any) => series.name === s.name);
          displayName = `מדד ${measureIndex + 1}`;
        }

        const seriesConfig: any = {
          name: displayName,
          type: isLine ? 'line' : 'bar',
          data: filteredData,
          itemStyle: { color: s.color },
          z: 10
        };

        if (isLine) {
          seriesConfig.smooth = true;
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
          seriesConfig.barWidth = hasStackedBars && !s.stack ? 18 : 12;
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
    const measureId = this.data.categories?.measureId;
    if (!measureId) {
      return '';
    }

    const checkedFilters = this.data.filterGroups
      .filter(fg => fg.measureId === measureId)
      .map(fg => ({
        filterId: fg.filter.id,
        checkedLabels: fg.filter.labels?.filter(l => l.data.checked).map(l => l.title)
      }))
      .filter(f => f.checkedLabels?.length > 0);

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

  private onResize = () => this.chart?.resize();

  reload() {
    this.graphReload.emit();
  }
}
