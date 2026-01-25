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
  
  @ViewChild("chartEl") chartEl: ElementRef<HTMLDivElement> | undefined;

  private chart?: echarts.ECharts;
  private cookieService = inject(CookieService);

  showShareBar = false;

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
      if (this.chart) {
        this.updateChart();
      } else {
        setTimeout(() => {this.initChart(); this.updateChart()});
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
          
          const tooltipItems = params.map((param: any) => {
            const value = typeof param.value === 'number' 
              ? param.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) 
              : param.value;
            const title = param.seriesName?.length > 20 
              ? param.seriesName.substring(0, 20) + '...' 
              : param.seriesName;
            const color = param.color || '#000';
            
            return `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${color}; flex-shrink: 0;"></div>
              <span style="color: #6b7a90; flex: 1; margin-right: 8px; text-align: right;">${title}</span>
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
        pageButtonPosition: 'start'
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
        axisLabel: { color: "#866b90ff", fontFamily: "Rubik, sans-serif" }
      },
      series: [...(chartData?.series || [])].reverse().map(s => {
        const isLine = this.data?.type?.toLowerCase().includes('line');
        const isStacked = this.data?.type?.toLowerCase().includes('stacked');
        
        // Filter data to match checked x-axis labels
        let filteredData = s.data;
        if (chartData?.categories?.filter?.labels) {
          const checkedIndices = chartData.categories.filter.labels
            .map((label, idx) => label.data.checked ? idx : -1)
            .filter(idx => idx !== -1);
          filteredData = checkedIndices.map(idx => s.data[idx]);
        }
        
        const seriesConfig: any = {
            name: s.name.toString().trim(),
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
            seriesConfig.barWidth = 12;
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

  toggleShareBar(): void {
    this.showShareBar = !this.showShareBar;
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
