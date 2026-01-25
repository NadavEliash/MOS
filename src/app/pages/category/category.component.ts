import { Component, inject, signal, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GraphComponent } from '../../components/graph/graph.component';
import { CategoryService, Category, Chip } from '../../services/category.service';
import { CookieService } from '../../services/cookie.service';
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
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  
  readonly categories = this.categoryService.categories;
  readonly measures = this.categoryService.measures;
  chips = signal<Chip[]>([]);
  selectedCategory = signal<Category | undefined>(undefined);
  categoryGroups = signal<any[]>([]);
  filterGroups = signal<FilterGroup[]>([]);
  graphData = signal<GraphData | undefined>(undefined);
  savedGraphs = signal<Graph[]>([]);
  articles = signal<any[]>([]);
  linkedItems = signal<any[]>([]);

  constructor() {
    effect(() => {
      this.chips.set(this.categoryService.chips().slice(0,5));
    })
    
    effect(() => {
      this.selectedCategory.set(this.categoryService.selectedCategory());
      this.linkedItems.set(this.articles().filter((i: any) => i.categoryId === this.selectedCategory()?.Category_ID));
    })
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
    this.categoryService.selectedMeasure.set(undefined);
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
    this.graphData.set(undefined);
    this.categoryService.setSelectedCategory(this.categories()!.find(c => c.Category_ID === id)?.Category_ID!);    
    await this.categoryService.getChips(id);

    this.filterGroups.set([]);
    const measures = await this.categoryService.getMeasures(id);
    const chipMeasures = measures.filter(m => this.chips()[0]['Measure ID']?.includes(m.id));

    for (const measure of chipMeasures) {      
      await this.categoryService.getView(measure.id);
      this.setFilterGroups(measure);
    };
    
    if (resetGraph) {
      this.onSelectChip(this.chips()[0].Chip_ID);
    }
    
    const otherMeasures = measures.filter(m => !this.chips()[0]['Measure ID']?.includes(m.id));
    for (const measure of otherMeasures) {
      await this.categoryService.getView(measure.id);
      this.setFilterGroups(measure);
    };
  }
  
  onSelectChip(id: string) {
    let updatedChips = this.chips();
    if (updatedChips.find(chip => chip.isActive)) {
      updatedChips.find(chip => chip.isActive)!.isActive = false;
    } 
    updatedChips.find(chip => chip.Chip_ID === id)!.isActive = true;
    this.chips.set(updatedChips);
    this.updateActiveGraph('chip', id);
    
    const chip = this.chips().find(chip => chip.Chip_ID === id);
    if (chip) {
      // Set selected measure to trigger expansion in filters component
      const measureIds = chip['Measure ID']?.split(',');
      if (measureIds?.length > 0) {
        this.categoryService.setSelectedMeasure(measureIds[0]);
      }
      this.setMultiGraphData(chip);
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
    
    if ( !measure.blockedFilters ) return blocked;
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
          const index = filterGroupsForMeasure.findIndex(fg => fg.filter.id === group.filter.id);
          if (index !== -1) {
            const labels = updatedLabels[index]?.map(label => ({ 
              title: label.title, 
              data: label.data, 
            }));
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
    if (!measureId) {
      this.graphData.set(undefined);
      return;
    }
    this.categoryService.setSelectedMeasure(measureId);
    this.updateActiveGraph('measure', measureId);
    this.setGraphData(this.measures().find(m => m.id === measureId)!);
  }

  async getSpecificMeasure(measureId: string) {
    const data = await this.apiService.getStatistics('layersMeasures');
    const measureData = data.find((m: any) => m['Measure ID'] === measureId);
    if (measureData) {
      const measure = {
        id: measureData['Measure ID'],
        name: measureData['Measure Name'],
        filters: measureData.Filters.split(', '),
        blockedFilters: measureData['Blocked Filters']?.split(', '),
        xAxis: measureData['X Axis Default'],
        yAxis: measureData['Y Axis Default'],
        value: measureData['Default Value Attribute'],
        relations: measureData['Measure_Relations'],
        graphType: measureData['Graph'],
        categoryId: measureData.Category_ID
      };
      this.measures.update(m => [...m, measure]);
      this.updateActiveGraph('measure', measureId);
      this.setGraphData(this.measures().find(m => m.id === measureId)!);
    }
  }
  
  onFiltersChange(event: any) {
    // Update the filterGroups signal with the modified data from the filters component
    this.filterGroups.update(groups => {
      const updatedGroups = groups.map(group => {
        const updatedGroup = event.find((e: FilterGroup) => e.filter.id === group.filter.id && e.measureId === group.measureId);
        return updatedGroup || group;
      });
      return updatedGroups;
    });
    
    const measureId = event[0].measureId;
    this.updateActiveGraph('measure', measureId);
    this.setGraphData(this.measures().find(m => m.id === measureId)!);
  }

  async setGraphData(measure: Measure, secondMeasure?: Measure) {
    const colors = graphColors;
    let colorIndex = 0;

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
      
      // Assign colors to first filter labels
      const firstFilterColorMap = new Map<string, string>();
      firstFilterLabels.forEach((label, idx) => {
        firstFilterColorMap.set(label.title, colors[idx % colors.length]);
      });
      
      // Assign colors to second filter labels (offset by first filter count)
      const secondFilterColorMap = new Map<string, string>();
      const secondColorOffset = firstFilterLabels.length;
      secondFilterLabels.forEach((label, idx) => {
        secondFilterColorMap.set(label.title, colors[(secondColorOffset + idx) % colors.length]);
      });

      // For each first filter label, create:
      // 1. A regular bar showing total for that first filter label
      // 2. A stacked bar showing breakdown of that same first filter label by second filter
      series = [];
      
      // For each first filter label, create the regular bar followed by its stacked breakdown
      firstFilterLabels.forEach(firstLabel => {
        // Regular bar for this first filter label (no stack property)
        series.push({
          groupTitle: firstFilterGroup.filter.name,
          name: firstLabel.title,
          data: this.categoryService.getSeriesData(measure, categories, [firstFilterGroup], firstLabel),
          color: firstFilterColorMap.get(firstLabel.title)!
        });

        // Immediately add stacked bars showing breakdown of this first filter label by second filter
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
            stack: firstLabel.title, // Each first filter label gets its own stacked breakdown
            data: data,
            color: secondFilterColorMap.get(secondLabel.title)!,
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
          colorIndex++;
          const filterGroup = seriesFilterGroups.find(fg => fg.filter.labels?.includes(label));
          return {
            groupTitle: filterGroup?.filter.name,
            name: label.title,
            data: this.categoryService.getSeriesData(measure, categories, seriesFilterGroups, label),
            color: colors[colorIndex % colors.length]
          };
        });
      }
    }
    const newGraphData = {
      categoryId: measure.categoryId,
      title: measure.name,
      type: graphType,
      categories,
      series,
      filterGroups: this.filterGroups()
    };
    this.graphData.set(newGraphData);
  }

  setMultiGraphData(chip: Chip) {
    if (!chip['Measure ID']) return;
    const measureIds = chip['Measure ID'].split(',');
    const measures = measureIds.map(id => this.measures().find(m => m.id === id)).filter(m => m) as Measure[];
    if (measures.length === 0) return;

    const firstMeasure = measures[0];
    const colors = graphColors;
    let colorIndex = 0;

    const allFilterGroups = this.filterGroups();
    const measureFilterGroups = allFilterGroups.filter(fg => fg.measureId === firstMeasure.id);
    const categories = measureFilterGroups.find(fg => fg.filter.id === firstMeasure.xAxis)!;

    const sharedFilterIds = measures.reduce((acc, measure) => {
      const ids = allFilterGroups.filter(fg => fg.measureId === measure.id).map(fg => fg.filter.id);
      return acc.filter(id => ids.includes(id));
    }, allFilterGroups.filter(fg => fg.measureId === measures[0].id).map(fg => fg.filter.id));

    const sharedFilterGroups = sharedFilterIds.map(id => allFilterGroups.find(fg => fg.filter.id === id && fg.measureId === firstMeasure.id)).filter(fg => fg) as FilterGroup[];
    
    const chipFilterIds = chip.Filter_ID.split(',').map(f => f.trim());
    
    // Update filterGroups: uncheck all labels, then check only those in chip.Filter_ID
    this.filterGroups.update(groups => {
      return groups.map(group => {
        // Check if this filter group belongs to one of the chip's measures
        const belongsToChipMeasure = measureIds.includes(group.measureId);
        
        if (belongsToChipMeasure) {
          const isSharedFilter = sharedFilterIds.includes(group.filter.id);
          const isChipFilter = chipFilterIds.includes(group.filter.id);
          
          // Uncheck all labels first
          const updatedLabels = group.filter.labels?.map(label => ({
            ...label,
            data: { ...label.data, checked: false }
          }));
          
          // Check labels for chip filters (first 10 labels)
          if (isChipFilter) {
            updatedLabels?.slice(0, 10).forEach(label => label.data.checked = true);
          }
          
          // Check xAxis labels (categories)
          if (group.filter.id === firstMeasure.xAxis) {
            updatedLabels.slice(0, 10).forEach(label => label.data.checked = true);
          }
          
          return {
            ...group,
            filter: {
              ...group.filter,
              labels: updatedLabels,
              disabled: !isSharedFilter, // Disable if not in shared filters
              expanded: isChipFilter || group.filter.id === firstMeasure.xAxis
            }
          };
        }
        return group;
      });
    });
    
    const series: any[] = [];
    
    measures.forEach((measure, idx) => {
      const measureName = measures.length > 1 ? 'מדד ' + (idx + 1) : '';
      chipFilterIds.forEach(filterId => {
        const filterData = this.categoryService.getMeasureTotalDataByFilter(measure, filterId, categories);
        for (const [index, data] of filterData.entries()) {
          if (index === 10) break;          
          colorIndex++;
          series.push({
            name: `${measureName} ${data.filterValue}`,
            data: data.values,
            color: colors[colorIndex % colors.length]
          });
        }
      });
    });

    const newGraphData = {
      categoryId: firstMeasure.categoryId,
      title: chip.Chip_Name,
      subtitles: measures.map(m => m.name).join('#'),
      description: chip.Chip_Description,
      type: firstMeasure.graphType,
      categories: categories,
      series: series,
      filterGroups: sharedFilterGroups
    };

    this.graphData.set(newGraphData);
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
    const data = await this.apiService.getStatistics('dimRelevantContent');
    const content = data.map((item: any) => ({
      id: item.Article_ID,
      categoryId: item.Category_ID,
      title: item['כותרת מאמר'],
      subtitle: item['נכתב ע\"י'],
      description: item['תיאור מאמר'],
      link: item['לינק למאמר'],
      img: item.ImageSource
    }))
    this.articles.set(content);
    this.linkedItems.set(content.filter((i: any) => i.categoryId === this.selectedCategory()?.Category_ID));
    return content;
  }
}
