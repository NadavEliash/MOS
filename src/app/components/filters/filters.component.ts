import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, effect, inject, signal, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphData, FilterGroup as InputFilterGroup, Measure as InputMeasure, Label } from '../../interfaces';
import { CategoryService } from '../../services/category.service';
import { GraphComponent } from '../graph/graph.component';
import { CookieService } from '../../services/cookie.service';

export interface MeasureView {
  id: string;
  name: string;
  expanded: boolean;
}

@Component({
  selector: 'app-Filters',
  standalone: true,
  imports: [CommonModule, GraphComponent],
  templateUrl: './filters.component.html',
  styleUrls: ['./filters.component.scss']
})
export class FiltersComponent implements OnChanges {
  @Input('categoryGroups') categoryGroups: any[] = [];
  @Input('measures') measuresInput: InputMeasure[] = [];
  @Input('filterGroups') filterGroupsInput: InputFilterGroup[] = [];
  @Input('expendMeasure') expendMeasure: string = '';
  @Input('graphData') graphData: GraphData | undefined = undefined;
  @Input('isLoading') isLoading: boolean = false;

  @Output() selectionChange = new EventEmitter<InputFilterGroup[]>();
  @Output() selectMeasure = new EventEmitter<string>();
  @Output() selectMultipleMeasures = new EventEmitter<string[]>();
  @Output() graphSaved = new EventEmitter<void>();

  @ViewChild(GraphComponent) graphComponent!: GraphComponent;

  private categoryService = inject(CategoryService);
  private cookieService = inject(CookieService);

  currentGraphData = signal<GraphData | undefined>(undefined);

  measures: MeasureView[] = [];
  groupedMeasures: any[] = [];
  showGrouped: boolean = true;
  selectedGroupName: string = '';
  data: GraphData | undefined = undefined;

  private measureExpandedState = new Map<string, boolean>();
  searchTerms = new Map<string, string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['measuresInput']) {
      this.measures = this.measuresInput
        .filter((measure, idx, measures) => idx === measures.findIndex((m) => m.id === measure.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          expanded: this.measureExpandedState.get(m.id) || false,
        }));

      this.groupedMeasures = this.categoryService.groupedMeasures().filter(group =>
        group.measures?.some((mid: string) => this.measuresInput?.some(m => m.id === mid))
      ).map(group => ({
        ...group,
        measures: group.measures.filter((mid: string) => this.measuresInput.some(m => m.id === mid))
      })).filter(group => group.measures.length > 1);

      this.showGrouped = this.groupedMeasures.length > 0;
      this.selectedGroupName = '';

      if (this.data) {
        const selectedMeasure = this.measures.find(m => m.id === this.data?.categories?.measureId);
        if (this.showGrouped) {
          this.selectGroup(this.groupedMeasures.find(g => g.measures.includes(selectedMeasure?.id)));
        }
        this.measures.find((m: MeasureView) => m.id === selectedMeasure?.id)!.expanded = true;
      };
    }

    if (changes['filterGroupsInput']) {
      const filterGroups = changes['filterGroupsInput'].currentValue;
      if (filterGroups) {
        const isMultiMeasureGraph = this.data?.measureIds && this.data.measureIds.length > 1;

        if (isMultiMeasureGraph) {
          const sharedFilterIds = this.data!.measureIds!.reduce((acc: string[], measureId: string) => {
            const ids = filterGroups.filter((fg: InputFilterGroup) => fg.measureId === measureId).map((fg: InputFilterGroup) => fg.filter.id);
            return acc.length === 0 ? ids : acc.filter(id => ids.includes(id));
          }, []);
          filterGroups.forEach((group: InputFilterGroup) => {
            if (this.data!.measureIds!.includes(group.measureId)) {
              group.filter.disabled = !sharedFilterIds.includes(group.filter.id);
            }
          });
        }
        this.measures.forEach(m => this.updateBlockedFilters(m.id));
      }
    }

    if (changes['graphData']) {
      const data = changes['graphData'].currentValue;
      if (data) {
        this.currentGraphData.set(data);
        this.data = data;
        const selectedMeasure = this.measures.find(m => m.id === this.data?.categories?.measureId);
        if (this.showGrouped) {
          this.selectGroup(this.groupedMeasures.find(g => g.measures.includes(selectedMeasure?.id)));
        }

        if (data.measureIds && data.measureIds.length > 0) {
          data.measureIds.forEach((measureId: string) => {
            const measure = this.measures.find(m => m.id === measureId);
            if (measure) {
              measure.expanded = true;
            }
          });
        } else if (selectedMeasure) {
          this.measures.find((m: MeasureView) => m.id === selectedMeasure.id)!.expanded = true;
        }
      } else {
        this.currentGraphData.set(undefined);
        this.data = undefined;
      }
    }
  }

  ngOnDestroy() {
    this.currentGraphData.set(undefined);
    this.data = undefined;
  }

  getFilterGroupsForMeasure(measureId: string): InputFilterGroup[] {
    return this.filterGroupsInput.filter(fg => fg.measureId === measureId);
  }

  toggleMeasure(measure: MeasureView) {
    if (!measure) return;

    const isActive = this.isMeasureActive(measure.id);

    if (isActive) {
      measure.expanded = !measure.expanded;
      return;
    }

    const isMultiMeasureGraph = this.data?.measureIds && this.data.measureIds.length > 1;

    if (isMultiMeasureGraph) {
      this.measures.forEach(m => m.expanded = false);
      this.currentGraphData.set(undefined);
      this.data = undefined;
      this.selectMeasure.emit('');
      return;
    }

    const otherExpanded = this.measures.find(m => m.expanded && m.id !== measure.id);

    if (!otherExpanded) {
      measure.expanded = true;
      this.selectMeasure.emit(measure.id);
    } else {
      const otherMeasureData = this.measuresInput.find(m => m.id === otherExpanded.id);
      const currentMeasureData = this.measuresInput.find(m => m.id === measure.id);

      const hasRelation =
        otherMeasureData?.relations?.includes(measure.id) ||
        currentMeasureData?.relations?.includes(otherExpanded.id);

      if (hasRelation) {
        measure.expanded = true;
        const expandedMeasureIds = this.measures.filter(m => m.expanded).map(m => m.id);
        this.selectMultipleMeasures.emit(expandedMeasureIds);
      } else {
        otherExpanded.expanded = false;
        measure.expanded = true;
        this.selectMeasure.emit(measure.id);
      }
    }
  }

  isMeasureActive(measureId: string): boolean {
    if (!this.data) return false;
    if (this.data.measureIds?.includes(measureId)) return true;
    return this.data.categories?.measureId === measureId;
  }

  getActiveFilterSummary(measureId: string): { name: string, value: string }[] {
    const groups = this.getFilterGroupsForMeasure(measureId);
    return groups
      .map(group => {
        const activeLabels = this.getFilteredLabels(group)
          .filter(l => l.data.checked)
          .map(l => l.title)
          .join(', ');

        if (activeLabels) {
          return { name: group.filter.name, value: activeLabels };
        }
        return null;
      })
      .filter((item): item is { name: string, value: string } => item !== null);
  }

  selectGroup(group: any) {
    this.selectedGroupName = group?.name;
    this.showGrouped = false;
    this.measures = this.measuresInput
      .filter(m => group.measures?.includes(m.id))
      .filter((measure, idx, measures) => idx === measures.findIndex((m) => m.id === measure.id))
      .map(m => ({
        id: m.id,
        name: m.name,
        expanded: false,
      }));
  }

  toggleFilterGroup(group: InputFilterGroup) {
    group.filter.expanded = !(group.filter.expanded ?? false);
  }

  onCheckboxChange(label: Label) {
    const isMultiMeasureGraph = this.data?.measureIds && this.data.measureIds.length > 1;
    const newCheckedState = !label.data.checked;

    if (isMultiMeasureGraph) {
      const sourceFilterGroup = this.filterGroupsInput.find(fg => fg.filter.labels?.includes(label));
      if (!sourceFilterGroup) return;

      const filterId = sourceFilterGroup.filter.id;
      const labelTitle = label.title;

      this.data!.measureIds!.forEach(measureId => {
        const filterGroup = this.filterGroupsInput.find(fg =>
          fg.measureId === measureId && fg.filter.id === filterId
        );

        if (filterGroup) {
          const matchingLabel = filterGroup.filter.labels?.find(l => l.title === labelTitle);
          if (matchingLabel) {
            matchingLabel.data.checked = newCheckedState;
          }
        }
      });

      this.data!.measureIds!.forEach(measureId => {
        this.updateBlockedFilters(measureId);
      });
      const allMeasureFilterGroups = this.filterGroupsInput.filter(fg =>
        this.data!.measureIds!.includes(fg.measureId)
      );
      this.selectionChange.emit(allMeasureFilterGroups);
    } else {
      label.data.checked = newCheckedState;
      const measureId = this.filterGroupsInput.find(fg => fg.filter.labels?.includes(label))?.measureId;
      if (measureId) {
        this.updateBlockedFilters(measureId);
      }
      this.selectionChange.emit(this.filterGroupsInput.filter(fg => fg.measureId === measureId));
    }
  }

  resetFilters() {
    this.filterGroupsInput.forEach(fg => {
      fg.filter.labels?.forEach(l => l.data.checked = false);
    });
    this.measures.forEach(m => this.updateBlockedFilters(m.id));
    if (!this.showGrouped && this.groupedMeasures.length > 0) {
      this.measures.forEach(m => m.expanded = false);
      this.showGrouped = true;
      this.selectedGroupName = '';

      this.measures = this.measuresInput
        .filter((measure, idx, measures) => idx === measures.findIndex((m) => m.id === measure.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          expanded: false,
        }));
    } else {
      this.measures.forEach(m => m.expanded = false);
    }

    this.currentGraphData.set(undefined);
    this.data = undefined;
    this.selectMeasure.emit('');
  }

  hasManyLabels(group: InputFilterGroup): boolean {
    return group.filter.labels?.length > 15;
  }

  isAnyFilteredSelected(group: InputFilterGroup): boolean {
    return group.filter.labels?.some(label => label.data.checked) ?? false;
  }

  toggleSelectAll(group: InputFilterGroup): void {
    const anySelected = this.isAnyFilteredSelected(group);

    if (anySelected) {
      group.filter.labels.forEach(label => {
        label.data.checked = false;
      });
    } else {
      const filteredLabels = this.getFilteredLabels(group);
      filteredLabels.forEach(label => {
        label.data.checked = true;
      });
    }
    this.selectionChange.emit(this.filterGroupsInput.filter(fg => fg.measureId === group.measureId));
  }

  onSearchChange(event: Event, filterId: string) {
    const inputElement = event.target as HTMLInputElement;
    this.searchTerms.set(filterId, inputElement.value);
  }

  clearSearch(filterId: string) {
    this.searchTerms.set(filterId, '');
  }

  getFilteredLabels(group: InputFilterGroup): Label[] {
    const searchTerm = this.searchTerms.get(group.filter.id);
    if (!searchTerm) {
      return group.filter.labels;
    }
    return group.filter.labels.filter(label =>
      label.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  getSelectedLabelsNotMatching(group: InputFilterGroup): Label[] {
    const searchTerm = this.searchTerms.get(group.filter.id);
    if (!searchTerm) return [];

    const filtered = this.getFilteredLabels(group);
    return group.filter.labels.filter(label =>
      label.data.checked && !filtered.some(f => f.title === label.title)
    );
  }

  private updateBlockedFilters(measureId: string): void {
    const measure = this.measuresInput.find(m => m.id === measureId);
    const filterGroupsForMeasure = this.filterGroupsInput.filter(fg => fg.measureId === measureId);

    filterGroupsForMeasure.forEach(group => group.filter.disabled = false);

    const activeFilterIds = new Set(
      filterGroupsForMeasure
        .filter(g => g.filter.labels?.some(l => l.data.checked))
        .map(g => g.filter.id)
    );

    const activeNonXAxisFilterIds = measure?.xAxis
      ? new Set([...activeFilterIds].filter(id => id !== measure.xAxis))
      : activeFilterIds;
    if (activeNonXAxisFilterIds.size === 2) {
      filterGroupsForMeasure.forEach(group => {
        if (!activeFilterIds.has(group.filter.id)) {
          group.filter.disabled = true;
        }
      });
      return;
    }

    if (!measure || !measure.blockedFilters || measure.blockedFilters.length === 0 || activeFilterIds.size === 0) {
      return;
    }

    let blockedGroups: string[][];
    if (measure.blockedFilters.length > 0 && typeof measure.blockedFilters[0] === 'string') {
      blockedGroups = [measure.blockedFilters as string[]];
    } else {
      blockedGroups = measure.blockedFilters as string[][];
    }

    blockedGroups.forEach((group: string[]) => {
      const fixedGroup = group.map(id => id.replace('[', ''));
      const isGroupActive = fixedGroup.some(id => activeFilterIds.has(id));

      if (isGroupActive) {
        fixedGroup.forEach(filterId => {
          if (!activeFilterIds.has(filterId)) {
            const groupToDisable = filterGroupsForMeasure.find(g => g.filter.id === filterId);
            if (groupToDisable) {
              groupToDisable.filter.disabled = true;
            }
          }
        });
      }
    });
  }

  onGraphSaved() {
    this.graphSaved.emit();
  }

  hasActiveSelection(group: InputFilterGroup): boolean {
    return group.filter.labels?.some(l => l.data.checked) ?? false;
  }
}
