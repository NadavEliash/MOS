import { inject, Injectable } from "@angular/core";
import { signal } from "@angular/core";
import { ApiService } from "./api.service";
import { ErrorService } from "./error.service";
import { FilterGroup, Label, Measure } from "../interfaces";

export interface Category {
  Category_ID: string;
  Category_Name: string;
  ['ToolTip/Hover']: string;
  Description: string;
  Link: string;
  group: string[];
  chips: string[];
  icon: string;
  isSaved: boolean;
}

export interface Chip {
  Category_ID: string;
  Category_Name: string;
  Chip_Description: string;
  Chip_ID: string;
  Chip_Name: string;
  Filter_ID: string;
  Filter_Name: string;
  Measure: string;
  ['Measure ID']: string;
  ['ToolTip/Hover']: string;
  isActive: boolean;
}

@Injectable({
  providedIn: "root"
})

export class CategoryService {
  private apiService = inject(ApiService);
  private errorService = inject(ErrorService);

  categories = signal<Category[] | null>(null);
  selectedCategory = signal<Category | undefined>(undefined);
  groupedMeasures = signal<any[]>([]);
  measures = signal<any[]>([]);
  selectedMeasure = signal<string | undefined>(undefined);
  views = signal<any[]>([]);
  chips = signal<Chip[]>([]);
  filters = signal<any[]>([]);
  selectedSavedGraph = signal<string | undefined>(undefined);

  private layersMeasures: any[] = [];
  private allChips: Chip[] = [];
  private pendingViewRequests = new Map<string, Promise<any>>();

  async getCategories(): Promise<Category[] | null> {
    if (this.categories()?.length! > 0) {
      return this.categories()!;
    };

    let newCategories: Category[] = [];
    await this.apiService.getStatistics('categories').then((data) => {
      newCategories = data.map((item: any) => ({
        ...item,
        chips: item.Chip_ID.split(', '),
        group: item['Group Category ID']?.split(', '),
        icon: `/icons/${item.Category_ID}.svg`,
        isSaved: false,
      }))
    });

    this.categories.set(newCategories);
    this.getGroupedMesures();
    return newCategories;
  }

  async getChips(id: string) {
    if (this.categories()) {
      if (!this.allChips.length) {
        this.allChips = await this.apiService.getStatistics('chips');
      }
      this.chips.set(this.allChips.filter((chip: any) => chip.Category_ID === id)
        .filter((chip: any) => chip['Measure ID'] && chip['Filter_ID'])
        .map((chip: any, idx: number) => { return { ...chip, isActive: false } }));
    }
  }

  async getGroupedMesures() {
    let groupedCategories: string[] = await this.apiService.getStatistics('groupCategories');
    const groupedMeasures = groupedCategories.map((category: any) => ({
      id: category['Group Category ID'],
      name: category['Group Category Name'],
      measures: category['MeasureIDs']?.replace('(', '').replace(')', '').trim().split(',').map((id: any) => id.trim())
    }));
    this.groupedMeasures.set(groupedMeasures);
  }

  async getMeasures(categoryId: string) {
    if (!this.layersMeasures.length) {
      this.layersMeasures = await this.apiService.getStatistics('layersMeasures')
    }
    const categoryMeasures = this.layersMeasures.filter((m: any) => m.Category_ID === categoryId).map((measure: any) => ({
      id: measure['Measure ID'],
      name: measure['Measure Name'],
      filters: measure.Filters.split(',').map((f: string) => f.trim()),
      blockedFilters: this.parseBlockedFilters(measure['Blocked Filters']),
      xAxis: measure['X Axis Default'],
      yAxis: measure['Y Axis Default'],
      value: measure['Default Value Attribute'],
      relations: measure['Measure_Relations'],
      graphType: measure['Graph'],
      categoryId: measure.Category_ID
    }));
    this.measures.set(categoryMeasures);
    return categoryMeasures;
  }

  parseBlockedFilters(str: string): any {
    if (!str) return null;
    const groups = str.match(/\[(.*?)\]/g);
    if (groups) {
      const parsedGroups = groups.map((group: string) =>
        group.replace('[', '').replace(']', '').split(',').map(s => s.trim())
      );
      return parsedGroups.length === 1 ? parsedGroups[0] : parsedGroups;
    }
    return str.split(',').map((s: string) => s.trim());
  }

  async getView(measureId: string) {
    if (this.views().some(v => v.id === measureId)) return;

    if (this.pendingViewRequests.has(measureId)) {
      return this.pendingViewRequests.get(measureId);
    }

    const requestPromise = this.apiService.getStatistics(measureId.replace(/\D+/g, ''))
      .then(view => {
        this.views().push({ id: measureId, data: view });
        this.pendingViewRequests.delete(measureId);
        return { id: measureId, data: view };
      })
      .catch(error => {
        this.pendingViewRequests.delete(measureId);
        this.errorService.setGraphError(true);
        throw error;
      });

    this.pendingViewRequests.set(measureId, requestPromise);
    return requestPromise;
  }

  async getFilters() {
    const data = await this.apiService.getStatistics('dimFilters');
    this.filters.set(data.map((item: any) => ({
      id: item.Filter_ID,
      name: item.Filter_Name,
      property: item.DB_Attributes
    })));
  }

  getLabels(measureId: string, filterGroups: any[]) {
    let updatedLabels: Label[][] = [];
    const view = this.views().find(v => v.id === measureId)?.data;
    const measure = this.measures()?.find(f => f.id === measureId);
    const defaultX = this.filters().find(f => f.id === measure?.xAxis)?.property;
    let defaultY = measure?.yAxis;

    filterGroups.forEach(filterGroup => {
      const property = this.filters()?.find(f => f.id === filterGroup.filter.id)?.property;
      if (!defaultY && property !== defaultX) defaultY = property;
      const labels = new Map<string, { values: number[], checked: boolean, filterId: string }>();
      if (!view) return;
      for (const item of view) {
        if (item[property]) {
          const title = item[property];
          if (!labels.has(title)) {
            labels.set(
              title, {
              filterId: filterGroup.filter.id,
              values: [],
              checked: property === defaultX || property === defaultY ? true : false
            });
          }
        }
      }
      if (labels.size > 0) {
        const labelsArray = Array.from(labels, ([title, data]) => ({ title, data }))
          .sort((a, b) => {
            return String(a.title).localeCompare(String(b.title), 'he', { numeric: true });
          });
        if (labelsArray.length > 10) {
          labelsArray.forEach((label, index) => {
            if ((property === defaultX || property === defaultY) && index < 10) {
              label.data.checked = true;
            } else {
              label.data.checked = false;
            }
          })
        }
        updatedLabels.push(labelsArray);
      }
    });
    return updatedLabels;
  }

  private isMeasureRate(measure: Measure): boolean {
    const viewData = this.views().find(v => v.id === measure.id)?.data;
    if (!viewData || viewData.length === 0) return false;

    const sampleSize = Math.min(100, viewData.length);
    const values = viewData.slice(0, sampleSize)
      .map((item: any) => item[measure.value])
      .filter((val: any) => val !== null && val !== undefined && !isNaN(val));

    if (values.length === 0) return false;

    return values.some((val: number) => val % 1 !== 0);
  }

  private normalizeRate(value: number): number {
    return value > 100 ? value / 10 : value;
  }

  getSeriesData(measure: Measure, categories: FilterGroup, filterGroups: FilterGroup[], label: Label, firstLabel?: Label): number[] {
    let seriesData: number[] = [];
    const viewData = this.views().find(v => v.id === measure.id)?.data;
    const xAxis = this.filters()?.find(f => f.id === categories?.filter.id)?.property;
    const filterGroup = filterGroups.find(fg => fg.filter.labels?.some(l => l.title === label.title));
    const moreFilterGroups = filterGroups.slice(1).filter(fg => fg.filter.labels?.some(l => l.data.checked));
    const moreFilterLabels = moreFilterGroups.map(fg => (fg.filter.labels?.filter(l => l.data.checked).map(l => l.title)));
    const isRate = this.isMeasureRate(measure);

    const firstFilterGroup = firstLabel ? filterGroups.find(fg => fg.filter.labels?.some(l => l.title === firstLabel.title)) : null;

    if (viewData && xAxis && filterGroup) {
      categories.filter.labels.forEach(l => {
        const matchingItems = viewData.filter((item: any) => {
          const mainCondition = item[xAxis] === l.title && item[filterGroup.filter.property] === label.title;

          const firstLabelCondition = firstLabel && firstFilterGroup
            ? item[firstFilterGroup.filter.property] === firstLabel.title
            : true;

          const additionalFiltersCondition = moreFilterGroups.every((fg, index) => {
            const labels = moreFilterLabels[index];
            if (fg.filter.property && labels && labels.length > 0) {
              return labels.includes(item[fg.filter.property]);
            }
            return true;
          });

          return mainCondition && firstLabelCondition && additionalFiltersCondition;
        });

        let value = 0;
        if (isRate) {
          if (matchingItems.length > 0) {
            const sum = matchingItems.reduce((acc: number, item: any) => acc + item[measure.value], 0);
            value = this.normalizeRate(sum / matchingItems.length);
          }
        } else {
          value = matchingItems.reduce((acc: number, item: any) => acc + item[measure.value], 0);
        }
        seriesData.push(value);
      });
    }

    return seriesData;
  }

  getNoSeriesData(measure: Measure, categories: FilterGroup, filterGroups: FilterGroup[] = []) {
    let seriesData: number[] = [];
    const viewData = this.views().find(v => v.id === measure.id)?.data;
    const xAxis = this.filters()?.find(f => f.id === categories?.filter.id)?.property;
    const isRate = this.isMeasureRate(measure);

    if (!viewData || !xAxis) return [];

    const firstFilterGroup = filterGroups.find(fg => fg.filter.property !== categories.filter.property);
    let blockedFilters: any[] = [];

    if (measure.blockedFilters === null) {
      blockedFilters = [];
    } else {
      measure.blockedFilters?.forEach(b => {
        if (Array.isArray(b) && b.includes(firstFilterGroup?.filter.id!)) {
          blockedFilters = [...blockedFilters, ...b];
        } else if (typeof b === 'string' && b.replace('[', '').replace(']', '') === firstFilterGroup?.filter.id) {
          blockedFilters = measure.blockedFilters.map(bl => (
            (bl as string).replace('[', '').replace(']', '')
          ));
        }
      })
    }

    blockedFilters = blockedFilters.filter(b => b !== firstFilterGroup?.filter.id).map(b => (
      this.filters()?.find(f => f.id === b)?.property
    ));
    categories?.filter.labels.forEach(l => {
      const matchingItems = viewData.filter((item: any) =>
        item[xAxis] === l.title && !blockedFilters.some(f => item[f])
      );

      let value = 0;
      if (isRate) {
        if (matchingItems.length > 0) {
          const sum = matchingItems.reduce((acc: number, item: any) => acc + item[measure.value], 0);
          value = this.normalizeRate(sum / matchingItems.length);
        }
      } else {
        value = matchingItems.reduce((acc: number, item: any) => acc + item[measure.value], 0);
      }
      seriesData.push(value);
    });
    return seriesData;
  }

  getGroupedStackedSeriesData(measure: Measure, categories: FilterGroup, firstFilterGroup: FilterGroup, secondFilterGroup: FilterGroup): { name: string; stack: string; data: number[]; firstFilterLabel: string; secondFilterLabel: string }[] {
    const viewData = this.views().find(v => v.id === measure.id)?.data;
    const xAxis = this.filters()?.find(f => f.id === categories?.filter.id)?.property;

    if (!viewData || !xAxis) {
      return [];
    }

    const series: { name: string; stack: string; data: number[]; firstFilterLabel: string; secondFilterLabel: string }[] = [];

    const firstFilterLabels = firstFilterGroup.filter.labels.filter(l => l.data.checked);
    const secondFilterLabels = secondFilterGroup.filter.labels.filter(l => l.data.checked);


    categories.filter.labels.forEach(xAxisLabel => {
      secondFilterLabels.forEach(secondLabel => {
        const seriesName = secondLabel.title;
        const stackName = xAxisLabel.title;
        const seriesData: number[] = [];

        firstFilterLabels.forEach(firstLabel => {
          const sum = viewData.reduce((acc: number, item: any) => {
            const xAxisCondition = item[xAxis] === xAxisLabel.title;
            const firstFilterCondition = item[firstFilterGroup.filter.property] === firstLabel.title;
            const secondFilterCondition = item[secondFilterGroup.filter.property] === secondLabel.title;

            if (xAxisCondition && firstFilterCondition && secondFilterCondition) {
              acc += item[measure.value];
            }
            return acc;
          }, 0);

          seriesData.push(sum);
        });

        series.push({
          name: seriesName,
          stack: stackName,
          data: seriesData,
          firstFilterLabel: xAxisLabel.title,
          secondFilterLabel: secondLabel.title
        });

      });
    });

    return series;
  }

  setSelectedCategory(id: string) {
    this.selectedCategory.set(this.categories()?.find(c => c.Category_ID === id)!);
  }

  setSelectedMeasure(id: string) {
    this.selectedMeasure.set(id);
  }

  setSelectedSavedGraph(id: string | undefined) {
    this.selectedSavedGraph.set(id);
  }
}
