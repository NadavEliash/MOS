import { Component, inject, signal, OnInit, effect, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CategoryService, Category, Chip } from '../../services/category.service';
import { CookieService } from '../../services/cookie.service';
import { ErrorService } from '../../services/error.service';
import { FiltersComponent } from "../../components/filters/filters.component";
import { FilterGroup, Graph, GraphData, Measure } from '../../interfaces';
import { graphColors } from '../../services/static.data';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule, FiltersComponent],
  templateUrl: './category.component.html',
  styleUrls: ['./category.component.scss']
})

export class CategoryComponent implements OnInit {
  private categoryService = inject(CategoryService);
  private cookieService = inject(CookieService);
  private apiService = inject(ApiService);
  private errorService = inject(ErrorService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private abortController: AbortController | null = null;

  readonly categories = this.categoryService.categories;
  readonly measures = this.categoryService.measures;
  chips = signal<Chip[]>([]);
  selectedCategory = signal<Category | undefined>(undefined);
  categoryGroups = signal<any[]>([]);
  filterGroups = signal<FilterGroup[]>([]);
  graphData = signal<GraphData | undefined>(undefined);
  savedGraphs = signal<Graph[]>([]);
  @ViewChild(FiltersComponent) filtersComponent?: FiltersComponent;
  articles = signal<any[]>([]);
  linkedItems = signal<any[]>([]);
  loadingGraph = signal<boolean>(false);
  readonly graphError = this.errorService.graphError;

  constructor() {
    effect(() => {
      this.chips.set(this.categoryService.chips().slice(0, 5));
    })

    effect(() => {
      this.selectedCategory.set(this.categoryService.selectedCategory());
      this.linkedItems.set(this.articles().filter((i: any) => i.categoryId === this.selectedCategory()?.Category_ID));
    })
  }

  private normalizeSeriesData(series: any[]): any[] {

    const allValues = series.flatMap(s => s.data).filter((v: number) => v > 0);


    if (allValues.length > 0 && allValues.every((v: number) => v <= 1)) {

      return series.map(s => ({
        ...s,
        data: s.data.map((v: number) => v * 100)
      }));
    }

    return series;
  }

  ngOnInit() {
    this.categoryService.getCategories()
      .then((categories) => {
        this.updateSavedCategories();

        this.route.queryParams.subscribe(async (params) => {
          const categoryId = params['id'];
          const graph = params['graph'];
          if (categoryId) {
            this.router.navigate(['/category'], { replaceUrl: true });
            this.categoryService.setSelectedCategory(categoryId);
            await this.onSelectCategory(categoryId, !this.categoryService.selectedMeasure());
            if (graph) {
              const parsedShareData = JSON.parse(graph);
              const currentFilterGroups = await this.categoryService.getFilters().then(() => this.filterGroups());
              currentFilterGroups?.forEach(fg => {
                fg.filter.labels?.forEach(l => l.data.checked = false);
                const sharedFilter = parsedShareData.checkedFilters.find((cf: any) => cf.filterId === fg.filter.id);
                if (sharedFilter) {
                  fg.filter.labels?.forEach(l => {
                    if (sharedFilter.checkedLabels.includes(l.title)) {
                      l.data.checked = true;
                    }
                  });
                }
              });
              this.filterGroups.set([...currentFilterGroups]);
              this.setGraphData(this.measures().find(m => m.id === parsedShareData.measureId)!);
            }
          } else if (this.categoryService.selectedMeasure()) {
            this.getSpecificMeasure(this.categoryService.selectedMeasure()!);
          } else if (this.categoryService.selectedSavedGraph()) {
            this.onSelectSavedGraph(this.categoryService.selectedSavedGraph()!);
          } else if (!this.categoryService.selectedCategory()) {
            this.categoryService.setSelectedCategory(categories![0].Category_ID);
            this.onSelectCategory(categories![0].Category_ID, true);
          }
        });
      });
    this.categoryService.getFilters();
    this.getContent();
  }

  ngOnDestroy() {

    if (this.abortController) {
      this.abortController.abort();
    }
    this.categoryService.selectedMeasure.set(undefined);
    this.categoryService.selectedSavedGraph.set(undefined);
  }

  updateSavedCategories() {
    const savedGraphs = this.cookieService.getSavedGraphs();
    this.savedGraphs.set(savedGraphs);
    const categoryIds = new Set(savedGraphs.map(g => g.data.categoryId));
    const categories = this.categoryService.categories();
    if (categories) {
      const updatedCategories = categories.map(c => ({
        ...c,
        isSaved: categoryIds.has(c.Category_ID)
      }));
      this.categoryService.categories.set(updatedCategories);
    }
  }

  async onSelectCategory(id: string, resetGraph: boolean = false) {

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.graphData.set(undefined);
    this.loadingGraph.set(true);
    this.errorService.clearGraphError();
    this.categoryService.setSelectedCategory(this.categories()!.find(c => c.Category_ID === id)?.Category_ID!);

    try {
      if (signal.aborted) return;
      await this.categoryService.getChips(id);

      this.filterGroups.set([]);
      if (signal.aborted) return;
      const measures = await this.categoryService.getMeasures(id);
      const chipMeasures = measures.filter(m => this.chips()[0]['Measure ID']?.includes(m.id));

      for (const measure of chipMeasures) {
        if (signal.aborted) return;
        await this.categoryService.getView(measure.id);
        this.setFilterGroups(measure);
      };

      if (resetGraph) {
        if (signal.aborted) return;
        this.onSelectChip(this.chips()[0].Chip_ID);
      }
      this.loadingGraph.set(false);

      const otherMeasures = measures.filter(m => !chipMeasures.some(cm => cm.id === m.id));
      otherMeasures.forEach(measure => {
        this.categoryService.getView(measure.id)
          .then(() => {
            if (!signal.aborted) {
              this.setFilterGroups(measure);
            }
          })
          .catch(error => {
            if (error.name !== 'AbortError') {
              console.error(`[CategoryComponent] Background load failed for measure ${measure.id}:`, error);
            }
          });
      });
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        this.loadingGraph.set(false);
        this.errorService.setGraphError(true);
        console.error('[CategoryComponent] onSelectCategory error:', error);
      }
    }
  }

  onSelectChip(id: string) {
    this.filtersComponent?.collapseAllMeasures();

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    let updatedChips = this.chips();
    if (updatedChips.find(chip => chip.isActive)) {
      updatedChips.find(chip => chip.isActive)!.isActive = false;
    }
    updatedChips.find(chip => chip.Chip_ID === id)!.isActive = true;
    this.chips.set(updatedChips);
    this.updateActiveGraph('chip', id);

    const chip = this.chips().find(chip => chip.Chip_ID === id);
    if (chip) {

      const measureIds = chip['Measure ID']?.split(',').map((m: string) => m.trim());
      if (measureIds?.length > 0) {
        this.categoryService.setSelectedMeasure(measureIds[0]);
      }

      this.handleChipSelection(chip);
    }
  }

  setFilterGroups(measure: Measure) {
    const newFilterGroups = measure.filters.map((filterId: string) => ({
      measureId: measure.id,
      title: measure.name,
      expanded: false,
      filter: {
        id: filterId,
        name: this.categoryService.filters().find(f => f.id === filterId)?.name!,
        property: this.categoryService.filters().find(f => f.id === filterId)?.property!,
        expanded: false,
        labels: [],
        blocked: this.getBlockedFilters(measure, filterId)
      }
    }));

    this.filterGroups.update(existingGroups => {
      const groupsForOtherMeasures = existingGroups.filter(g => g.measureId !== measure.id);
      return [...groupsForOtherMeasures, ...newFilterGroups];
    });
    this.setLabels(measure.id, newFilterGroups);
  }

  getBlockedFilters(measure: any, filterId: string) {
    let blocked: string[] = [];

    if (!measure.blockedFilters) return blocked;
    measure.blockedFilters.forEach((b: any) => {
      if (Array.isArray(b)) {
        if (b.includes(filterId)) blocked.push(...b);
      } else {
        if (measure.blockedFilters.includes(filterId)) blocked.push(...measure.blockedFilters);
      }
    });
    return blocked;
  }

  setLabels(measureId: string, filterGroupsForMeasure: FilterGroup[]) {
    const updatedLabels = this.categoryService.getLabels(measureId, filterGroupsForMeasure);
    this.filterGroups.update(allGroups => {
      const updatedGroups = allGroups.map(group => {
        if (group.measureId === measureId) {

          const allLabels = updatedLabels.flat();

          const labels = allLabels
            .filter(label => label.data.filterId === group.filter.id)
            .map(label => ({
              title: label.title,
              data: label.data,
            }));

          if (labels.length > 0) {
            return {
              ...group,
              filter: {
                ...group.filter,
                labels: labels
              }
            };
          }
        }
        return group;
      });
      return updatedGroups;
    });
  }

  onSelectMeasure(measureId: string) {

    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    this.loadingGraph.set(false);
    if (!measureId) {
      this.graphData.set(undefined);
      return;
    }
    if (this.categoryService.views().every(v => v.id !== measureId)) {
      this.graphData.set(undefined);
      this.loadingGraph.set(true);
      this.errorService.clearGraphError();
    }
    this.categoryService.setSelectedMeasure(measureId);
    this.updateActiveGraph('measure', measureId);


    const measure = this.measures().find(m => m.id === measureId)!;
    this.setGraphData(measure);
  }

  onSelectMultipleMeasures(measureIds: string[]) {
    if (!measureIds || measureIds.length === 0) {
      this.graphData.set(undefined);
      return;
    }

    const measures = measureIds
      .map(id => this.measures().find(m => m.id === id))
      .filter(m => m) as Measure[];

    if (measures.length > 1) {
      this.setMultiMeasureGraphData(measures);
    } else if (measures.length === 1) {
      this.onSelectMeasure(measures[0].id);
    }
  }

  async getSpecificMeasure(measureId: string) {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      if (signal.aborted) return;
      const data = await this.apiService.getStatistics('layersMeasures');
      const measureData = data.find((m: any) => m['Measure ID'] === measureId);
      if (measureData) {
        if (signal.aborted) return;
        const measure = {
          id: measureData['Measure ID'],
          name: measureData['Measure Name'],
          filters: measureData.Filters.split(',').map((f: string) => f.trim()),
          blockedFilters: this.categoryService.parseBlockedFilters(measureData['Blocked Filters']),
          xAxis: measureData['X Axis Default'],
          yAxis: measureData['Y Axis Default'],
          value: measureData['Default Value Attribute'],
          relations: measureData['Measure_Relations'],
          graphType: measureData['Graph'],
          categoryId: measureData.Category_ID
        };
        this.onSelectCategory(measure.categoryId);
        this.filterGroups.set(measure.filters);
        this.measures.update(m => [...m, measure]);
        this.updateActiveGraph('measure', measureId);
        this.setGraphData(this.measures().find(m => m.id === measureId)!);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        throw error;
      }
    }
  }

  onFiltersChange(event: any) {
    if (!event || event.length === 0) return;


    this.filterGroups.update(groups => {
      const updatedGroups = groups.map(group => {
        const updatedGroup = event.find((e: FilterGroup) => e.filter.id === group.filter.id && e.measureId === group.measureId);
        return updatedGroup || group;
      });
      return updatedGroups;
    });


    const currentGraphData = this.graphData();
    const measureIds = event.map((e: FilterGroup) => e.measureId).filter((id: string, index: number, self: string[]) => self.indexOf(id) === index);


    const chipTitle = currentGraphData?.title;
    const chipDescription = currentGraphData?.description;
    const chipSubtitles = currentGraphData?.subtitles;

    if (measureIds.length > 1) {

      this.setMultiMeasureGraphData(
        measureIds.map((id: string) => this.measures().find((m: Measure) => m.id === id)!).filter((m: Measure) => m),
        chipTitle,
        chipDescription
      );
    } else {

      const measureId = event[0].measureId;
      this.updateActiveGraph('measure', measureId);
      this.setGraphData(
        this.measures().find(m => m.id === measureId)!,
        chipTitle,
        chipDescription,
        chipSubtitles
      );
    }
  }

  getLabelColor(labelTitle: string, group: FilterGroup, measure: Measure, offset: number = 0): string {
    const colors = graphColors;
    const allFilterGroups = this.filterGroups().filter(fg => fg.measureId === measure.id);

    let cumulativeIdx = offset;

    for (const filterId of measure.filters) {
      const fg = allFilterGroups.find(g => g.filter.id === filterId);
      if (!fg) continue;

      if (fg.filter.id === group.filter.id) {
        const labelIdx = fg.filter.labels.findIndex(l => l.title === labelTitle);
        if (labelIdx !== -1) {
          cumulativeIdx += labelIdx;
        }
        break;
      }
      cumulativeIdx += fg.filter.labels.length;
    }

    return colors[cumulativeIdx % colors.length];
  }

  async setGraphData(measure: Measure, chipTitle?: string, chipDescription?: string, chipSubtitles?: string) {
    try {
      const colors = graphColors;

      let measureFilterGroups = this.filterGroups().filter(fg => fg.measureId === measure.id);
      if (measureFilterGroups.length === 0) {
        await this.categoryService.getView(measure.id);
        this.setFilterGroups(measure);
        measureFilterGroups = this.filterGroups().filter(fg => fg.measureId === measure.id);
      };

      const categories = measureFilterGroups.find(fg => fg.filter.id === measure.xAxis)!;
      const seriesFilterGroups = measureFilterGroups.filter(fg => fg.filter.property !== categories.filter.property);
      const activeSeriesFilterGroups = seriesFilterGroups.filter(fg => fg.filter.labels?.some(l => l.data.checked));

      let series: any[] = [];
      let graphType = measure.graphType;

      if (activeSeriesFilterGroups.length === 2) {
        const firstFilterGroup = activeSeriesFilterGroups[0];
        const secondFilterGroup = activeSeriesFilterGroups[1];

        const firstFilterLabels = firstFilterGroup.filter.labels.filter(l => l.data.checked);
        const secondFilterLabels = secondFilterGroup.filter.labels.filter(l => l.data.checked);

        series = [];

        firstFilterLabels.forEach(firstLabel => {
          series.push({
            groupTitle: firstFilterGroup.filter.name,
            name: firstLabel.title,
            data: this.categoryService.getSeriesData(measure, categories, [firstFilterGroup], firstLabel),
            color: this.getLabelColor(firstLabel.title, firstFilterGroup, measure)
          });

          secondFilterLabels.forEach(secondLabel => {
            const data = this.categoryService.getSeriesData(
              measure,
              categories,
              [firstFilterGroup, secondFilterGroup],
              secondLabel,
              firstLabel
            );

            series.push({
              name: secondLabel.title,
              stack: firstLabel.title,
              data: data,
              color: this.getLabelColor(secondLabel.title, secondFilterGroup, measure),
              groupTitle: secondFilterGroup.filter.name
            });
          });
        });

        graphType = 'stacked-column';
      } else {
        let seriesLabels = activeSeriesFilterGroups.flatMap(fg => fg.filter.labels.filter(l => l.data.checked));

        if (seriesLabels.length === 0 && measureFilterGroups.length === 1) {
          series = [{
            groupTitle: measure.name,
            name: measure.name,
            data: this.categoryService.getNoSeriesData(measure, categories, seriesFilterGroups),
            color: colors[0]
          }]
        } else {
          series = seriesLabels.map(label => {
            const filterGroup = seriesFilterGroups.find(fg => fg.filter.labels?.includes(label))!;
            return {
              groupTitle: filterGroup.filter.name,
              name: label.title,
              data: this.categoryService.getSeriesData(measure, categories, seriesFilterGroups, label),
              color: this.getLabelColor(label.title, filterGroup, measure)
            };
          });
        }
      }
      const newGraphData = {
        categoryId: measure.categoryId,
        title: chipTitle || measure.name,
        description: chipDescription,
        subtitles: chipSubtitles,
        type: graphType,
        categories,
        series: this.normalizeSeriesData(series),
        filterGroups: this.filterGroups()
      };
      this.graphData.set(newGraphData);
      this.loadingGraph.set(false);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        this.loadingGraph.set(false);
        this.errorService.setGraphError(true);
        console.error('[CategoryComponent] setGraphData error:', error);
      }
    }
  }

  setMultiMeasureGraphData(measures: Measure[], chipTitle?: string, chipDescription?: string) {
    if (measures.length === 0) return;
    if (measures.length === 1) {
      this.setGraphData(measures[0], chipTitle, chipDescription);
      return;
    }

    const colors = graphColors;

    const firstMeasure = measures[0];
    const allFilterGroups = this.filterGroups();
    const measureFilterGroups = allFilterGroups.filter(fg => fg.measureId === firstMeasure.id);
    const categories = measureFilterGroups.find(fg => fg.filter.id === firstMeasure.xAxis)!;


    const sharedFilterIds = measures.reduce((acc, measure) => {
      const ids = allFilterGroups.filter(fg => fg.measureId === measure.id).map(fg => fg.filter.id);
      return acc.filter(id => ids.includes(id));
    }, allFilterGroups.filter(fg => fg.measureId === measures[0].id).map(fg => fg.filter.id));

    const sharedFilterGroups = sharedFilterIds
      .map(id => allFilterGroups.find(fg => fg.filter.id === id && fg.measureId === firstMeasure.id))
      .filter(fg => fg) as FilterGroup[];

    const series: any[] = [];


    const activeFilters = sharedFilterGroups.filter(fg =>
      fg.filter.id !== categories.filter.id &&
      fg.filter.labels?.some(l => l.data.checked)
    );

    const hasActiveFilters = activeFilters.length > 0;
    let checkedLabels: any[] = [];

    if (hasActiveFilters) {
      const filterGroup = activeFilters[0];
      checkedLabels = filterGroup.filter.labels.filter(l => l.data.checked);
    }


    measures.forEach((measure, idx) => {
      const measureName = `מדד ${idx + 1}`;
      const stackName = `measure${idx}`;


      const data = this.categoryService.getNoSeriesData(measure, categories, []);
      series.push({
        name: measureName,
        data: data,
        color: colors[idx % colors.length]
      });


      if (hasActiveFilters) {
        const filterGroup = activeFilters[0];
        checkedLabels.forEach(label => {
          const stackData = this.categoryService.getSeriesData(measure, categories, [filterGroup], label);
          series.push({
            name: label.title,
            stack: stackName,
            data: stackData,
            color: this.getLabelColor(label.title, filterGroup, firstMeasure, measures.length)
          });
        });
      }
    });

    const measureIds = measures.map(m => m.id);
    const graphType = hasActiveFilters ? 'stacked-column' : firstMeasure.graphType;
    const newGraphData = {
      categoryId: firstMeasure.categoryId,
      title: chipTitle || measures.map(m => m.name).join(' + '),
      description: chipDescription,
      subtitles: chipTitle ? measures.map(m => m.name).join('#') : undefined,
      measureIds: measureIds,
      type: graphType,
      categories: categories,
      series: this.normalizeSeriesData(series),
      filterGroups: sharedFilterGroups
    };

    this.graphData.set(newGraphData);
  }

  handleChipSelection(chip: Chip) {
    if (!chip['Measure ID']) return;
    const measureIds = chip['Measure ID'].split(',').map((id: string) => id.trim());
    const measures = measureIds.map(id => this.measures().find(m => m.id === id)).filter(m => m) as Measure[];
    if (measures.length === 0) return;

    const firstMeasure = measures[0];
    const allFilterGroups = this.filterGroups();
    const chipFilterIds = chip.Filter_ID.split(',').map(f => f.trim());


    const sharedFilterIds = measures.reduce((acc, measure) => {
      const ids = allFilterGroups.filter(fg => fg.measureId === measure.id).map(fg => fg.filter.id);
      return acc.filter(id => ids.includes(id));
    }, allFilterGroups.filter(fg => fg.measureId === measures[0].id).map(fg => fg.filter.id));


    this.filterGroups.update(groups => {
      return groups.map(group => {
        const belongsToChipMeasure = measureIds.includes(group.measureId);

        if (belongsToChipMeasure) {
          const isSharedFilter = sharedFilterIds.includes(group.filter.id);
          const isChipFilter = chipFilterIds.includes(group.filter.id);


          const updatedLabels = group.filter.labels?.map(label => ({
            ...label,
            data: { ...label.data, checked: false }
          }));


          if (isChipFilter) {
            updatedLabels?.slice(0, 10).forEach(label => label.data.checked = true);
          }


          if (group.filter.id === firstMeasure.xAxis) {
            updatedLabels?.slice(0, 10).forEach(label => label.data.checked = true);
          }

          return {
            ...group,
            filter: {
              ...group.filter,
              labels: updatedLabels,
              disabled: !isSharedFilter,
              expanded: false
            }
          };
        }
        return group;
      });
    });


    if (measures.length > 1) {
      this.setMultiMeasureGraphData(measures, chip.Chip_Name, chip.Chip_Description);
    } else {
      this.setGraphData(measures[0], chip.Chip_Name, chip.Chip_Description, measures.map(m => m.name).join('#'));
    }
  }

  async reloadGraph() {
  }

  onGraphSaved() {
    this.updateSavedCategories();
  }

  updateActiveGraph(type: 'chip' | 'savedGraph' | 'measure', id: string) {
    this.chips.update(chips => chips.map(c => ({ ...c, isActive: false })));
    this.savedGraphs.update(graphs => graphs.map(g => ({ ...g, isActive: false })));

    if (type === 'chip') {
      this.chips.update(chips => chips.map(c => ({ ...c, isActive: c.Chip_ID === id })));
    } else if (type === 'savedGraph') {
      this.savedGraphs.update(graphs => graphs.map(g => ({ ...g, isActive: g.id === id })));
    }
  }

  onSelectSavedGraph(id: string) {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const savedData = this.savedGraphs().find(graph => graph.id === id);
    if (savedData) {
      const updatedSavedGraphs = this.savedGraphs().map(graph => ({ ...graph, isActive: false }));
      updatedSavedGraphs.find(graph => graph.id === id)!.isActive = true;
      this.savedGraphs.set(updatedSavedGraphs);
      this.updateActiveGraph('savedGraph', id);
      this.onSelectCategory(savedData.data.categoryId);
      this.filterGroups.set(savedData.data.filterGroups);
      this.graphData.set(savedData.data);
    }
  }

  removeSavedGraph(id: string) {
    this.cookieService.removeGraph(id);
    this.updateSavedCategories();
  }

  async getContent() {
    try {
      const data = await this.apiService.getStatistics('dimRelevantContent');
      const content = data.map((item: any) => ({
        id: item.Article_ID,
        categoryId: item.Category_ID,
        title: item['כותרת מאמר'],
        subtitle: item['נכתב ע"י'],
        description: item['תיאור מאמר'],
        link: item['לינק למאמר'],
        img: item.ImageSource
      }))
      this.articles.set(content);
      this.linkedItems.set(content.filter((i: any) => i.categoryId === this.selectedCategory()?.Category_ID));
      return content;
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        throw error;
      }
    }
  }
}
