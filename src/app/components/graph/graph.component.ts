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
import { ContrastStyle, contrastDecals, contrastStyles, contrastTones, graphColors } from "../../services/static.data";
import { escapeHtml } from "../../utils/escape-html";
import { AccessibilityService } from "../../services/accessibility.service";

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

export type ChartType = 'line' | 'stacked-column';

/**
 * Width of a high-contrast line swatch, shared by the legend icon and the
 * tooltip so both show the same stretch of the dash pattern. The longest
 * dash in contrastStyles needs about this much room to be recognisable.
 */
const CONTRAST_SWATCH_WIDTH = 30;

/** Counts below this are shown as a bound rather than a figure */
const SMALL_VALUE_THRESHOLD = 10;

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
  private accessibility = inject(AccessibilityService);

  /** The chart is a canvas, so the high-contrast stylesheet cannot reach it - redraw instead. */
  private contrastEffect = effect(() => {
    this.accessibility.contrast();
    this.updateChart();
  });

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

  private contrastStyle(series: any, fallback: number): ContrastStyle {
    const paletteIdx = graphColors.findIndex(c =>
      c.toLowerCase() === series?.color?.toString().toLowerCase()
    );
    const idx = paletteIdx === -1 ? fallback : paletteIdx;
    return contrastStyles[idx % contrastStyles.length];
  }

  private contrastLineSwatch(style: ContrastStyle): string {
    const width = CONTRAST_SWATCH_WIDTH;
    const height = 14;
    const mid = height / 2;
    const dash = Array.isArray(style.lineDash)
      ? ` stroke-dasharray="${style.lineDash.join(' ')}"`
      : '';

    return `<svg class="tooltip-line" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">`
      + `<line x1="0" y1="${mid}" x2="${width}" y2="${mid}" stroke="${style.tone}" stroke-width="2.5"${dash} />`
      + this.contrastSymbolShape(style.lineSymbol, width / 2, mid, style.tone)
      + `</svg>`;
  }

  /** The subset of ECharts symbols used by contrastStyles, as flat SVG shapes */
  private contrastSymbolShape(symbol: string, cx: number, cy: number, tone: string): string {
    const hollow = symbol.startsWith('empty');
    const shape = (hollow ? symbol.slice(5) : symbol).toLowerCase();
    const r = 4;
    const paint = `fill="${hollow ? '#FFFFFF' : tone}" stroke="${tone}" stroke-width="1.5"`;

    switch (shape) {
      case 'rect':
        return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" ${paint} />`;
      case 'roundrect':
        return `<rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" rx="1.5" ${paint} />`;
      case 'triangle':
        return `<polygon points="${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}" ${paint} />`;
      case 'diamond':
        return `<polygon points="${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}" ${paint} />`;
      case 'pin':
        return `<path d="M${cx},${cy + r} C${cx - r},${cy} ${cx - r},${cy - r} ${cx},${cy - r}`
          + ` C${cx + r},${cy - r} ${cx + r},${cy} ${cx},${cy + r} Z" ${paint} />`;
      case 'arrow':
        return `<polygon points="${cx},${cy - r} ${cx + r},${cy + r} ${cx},${cy + r * 0.4} ${cx - r},${cy + r}" ${paint} />`;
      default:
        return `<circle cx="${cx}" cy="${cy}" r="${r}" ${paint} />`;
    }
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
    // const maxSeriesValue = chartData?.series?.reduce((max: number, s: any) =>
    //   Math.max(max, ...s.data.filter((v: number) => v !== null && v !== undefined).map(Number)), 0
    // ) ?? 0;
    const isPercentRate = isRate && this.graphData()?.isPercent;
    // Rates arrive as fractions - scale on read so redrawing cannot scale twice
    const valueScale = isPercentRate ? 100 : 1;
    const isContrast = this.accessibility.contrast();


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
            color: isContrast ? 'rgba(0, 0, 0, 0.12)' : '#0068F514',
            width: 70,
            padding: 10,
            type: 'solid'
          },
          shadowStyle: {
            color: isContrast ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 104, 245, 0.08)'
          },
          crossStyle: {
            color: isContrast ? 'rgba(0, 0, 0, 0.12)' : '#0068F514',
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
              ? this.formatValue(param.value, !!isPercentRate)
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

            // In high contrast the swatch repeats the legend icon: a dash and its
            // symbol for lines, the fill and its texture for bars
            let swatch: string;
            if (isContrast) {
              const style = this.contrastStyle(series, seriesIndex);
              if (isLine) {
                swatch = this.contrastLineSwatch(style);
              } else {
                const textureIdx = style.decal ? contrastDecals.indexOf(style.decal) : -1;
                swatch = `<div class="tooltip-color tooltip-tone--${contrastTones.indexOf(style.tone)}`
                  + (textureIdx === -1 ? '' : ` tooltip-texture--${textureIdx}`)
                  + `"></div>`;
              }
            } else {
              const colorIndex = graphColors.findIndex(c =>
                c.toLowerCase() === param.color?.toString().toLowerCase()
              );
              swatch = colorIndex === -1
                ? `<div class="tooltip-color"></div>`
                : `<div class="tooltip-color tooltip-color--${colorIndex}"></div>`;
            }


            const isRegularBar = hasVisibleStackedBars && !isStackedSeries;

            const titleClass = isRegularBar
              ? 'tooltip-title tooltip-title--emphasized'
              : 'tooltip-title';

            return `<div class="tooltip-item">
              ${swatch}
              <span class="${titleClass}">${escapeHtml(title)}</span>
              <span class="tooltip-value">${escapeHtml(value)}</span>
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
        // Lines keep the series' own icon in high contrast so the dash pattern shows
        icon: isContrast ? (isLine ? undefined : 'rect') : 'circle',
        itemGap: 20,
        // A dash needs room to be read, so the line icon matches the tooltip swatch
        itemWidth: isContrast ? (isLine ? CONTRAST_SWATCH_WIDTH : 18) : 12,
        itemHeight: 12,
        textStyle: {
          color: isContrast ? "#000000" : "#123248",
          fontFamily: "Rubik, sans-serif",
          fontSize: 12
        },
        pageIconSize: 12,
        pageTextStyle: {
          color: isContrast ? "#000000" : "#123248"
        },
        pageButtonPosition: 'start',
        data: visibleSeries.map((s, idx, arr) => {
          const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
          const isStackedSeries = s.stack;
          let name: string;
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
        axisLabel: { color: isContrast ? "#000000" : "#6b7a90", fontFamily: "Rubik, sans-serif" },
        splitLine: { show: true, lineStyle: { color: isContrast ? "rgba(0, 0, 0, 0.35)" : "rgba(90, 124, 167, 0.1)" } }
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        splitLine: { lineStyle: { color: isContrast ? "rgba(0, 0, 0, 0.35)" : "rgba(90, 124, 167, 0.15)" } },
        axisLabel: {
          color: isContrast ? "#000000" : "#866b90ff",
          fontFamily: "Rubik, sans-serif",
          formatter: isPercentRate ? '{value}%' : '{value}'
        }
      },
      series: visibleSeries.map((s, seriesIdx) => {
        const isLine = this.data?.type?.toLowerCase().includes('line');
        const isStacked = this.data?.type?.toLowerCase().includes('stacked');

        let filteredData = s.data;
        if (chartData?.categories?.filter?.labels) {
          const checkedIndices = chartData.categories.filter.labels
            .map((label, idx) => label.data.checked ? idx : -1)
            .filter(idx => idx !== -1);
          filteredData = checkedIndices.map(idx => s.data[idx]);
        }
        filteredData = filteredData.map((v: number) =>
          v !== null && v !== undefined ? v * valueScale : v
        );

        const seriesName = s.name.toString().trim();

        let displayName = seriesName;
        const hasMultipleMeasures = chartData?.measureIds && chartData.measureIds.length > 1;
        const isStackedSeries = s.stack;
        if (hasMultipleMeasures && !isStackedSeries) {
          const measureSeries = chartData.series.filter((series: any) => !series.stack);
          const measureIndex = measureSeries.findIndex((series: any) => series.name === s.name);
          displayName = `מדד ${measureIndex + 1}`;
        }

        // High contrast drops the palette for a full fill or a texture over a dark gray tone
        const contrastStyle = isContrast ? this.contrastStyle(s, seriesIdx) : null;
        const seriesColor = contrastStyle ? contrastStyle.tone : s.color;

        const seriesConfig: any = {
          name: displayName,
          type: isLine ? 'line' : 'bar',
          data: isLine ? filteredData : filteredData.map(v => v === 0 ? null : v),
          itemStyle: { color: seriesColor },
          z: 10
        };

        if (isLine) {
          seriesConfig.smooth = true;
          seriesConfig.symbol = contrastStyle ? contrastStyle.lineSymbol : 'circle';
          seriesConfig.symbolSize = isContrast ? 9 : 7;
          if (contrastStyle) {
            seriesConfig.lineStyle = {
              color: contrastStyle.tone,
              width: 3,
              type: contrastStyle.lineDash
            };
          }
          seriesConfig.label = { show: false };
        } else {
          if (isStacked) {
            seriesConfig.stack = s.stack || undefined;
          }
          seriesConfig.itemStyle = {
            ...seriesConfig.itemStyle,
            decal: contrastStyle?.decal,
            borderWidth: 2,
            borderColor: isContrast ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 0.1)',
            borderRadius: [5, 5, 0, 0]
          };
          // A texture needs room to read, so the bars widen in high contrast
          seriesConfig.barWidth = isContrast
            ? (hasVisibleStackedBars && !s.stack ? 22 : 14)
            : (hasVisibleStackedBars && !s.stack ? 18 : 12);
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

    // The series keeps its raw fraction, so the percentage is scaled here too
    return this.formatValue(isPercentRate ? num * 100 : num, isPercentRate);
  }

  /**
   * How a value reads wherever it is shown - the tooltip and the accessible
   * table. A count below the threshold is not spelled out, only bounded; a
   * percentage is never masked, since it discloses no headcount.
   * Zero is left as zero: it means none, not a withheld figure.
   */
  private formatValue(value: number, isPercentRate: boolean): string {
    if (!isPercentRate && value > 0 && value < SMALL_VALUE_THRESHOLD) {
      return `פחות מ-${SMALL_VALUE_THRESHOLD}`;
    }
    const text = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return isPercentRate ? `${text}%` : text;
  }

  private onResize = () => this.chart?.resize();

  reload() {
    this.chart?.clear();
    this.graphReload.emit();
  }
}
