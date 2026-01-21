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
  
  @Output() selectionChange = new EventEmitter<InputFilterGroup[]>();
  @Output() selectMeasure = new EventEmitter<string>();
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
        filterGroups.forEach((group: InputFilterGroup) => {
          if (group.filter.labels?.some(label => label.data.checked)) {  
            group.filter.expanded = true;
          }
        });
        this.measures.forEach(m => this.updateBlockedFilters(m.id));
      }
      if (this.data) {
        filterGroups.forEach((group: InputFilterGroup) => {
          if (group?.measureId === this.data?.categories?.measureId) {
            group.filter.labels?.forEach(label => { label.data.checked = this.data?.filterGroups?.find(fg => fg.filter.id === group.filter.id)?.filter.labels.find(l => l.title === label.title)?.data.checked ?? false })
          }
        });
      };
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
        this.measures.find((m: MeasureView) => m.id === selectedMeasure?.id)!.expanded = true;  
        data.filterGroups.forEach((group: InputFilterGroup) => {
          if (group?.measureId === this.data?.categories?.measureId) {
            group.filter.labels?.forEach(label => { label.data.checked = this.data?.filterGroups?.find(fg => fg.filter.id === group.filter.id)?.filter.labels.find(l => l.title === label.title)?.data.checked ?? false })
          }
        });
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
    
    if (!measure.expanded) {
      const prev = this.measures.find(m => m.expanded);
      if (prev && !this.measuresInput.find(m => m.id === prev.id)?.relations?.includes(measure.id)) prev.expanded = false;
      this.selectMeasure.emit(measure.id);
    } else {
      this.selectMeasure.emit('');
    }
    measure.expanded = !measure.expanded;
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
    label.data.checked = !label.data.checked;
    const measureId = this.filterGroupsInput.find(fg => fg.filter.labels?.includes(label))?.measureId;
    if (measureId) {
        this.updateBlockedFilters(measureId);
    }
    this.selectionChange.emit(this.filterGroupsInput.filter(fg => fg.measureId === measureId));
  }

  resetFilters() {
    this.filterGroupsInput.forEach(fg => {
        fg.filter.labels?.forEach(l => l.data.checked = false);
    });
    this.measures.forEach(m => this.updateBlockedFilters(m.id));
    this.selectionChange.emit(this.filterGroupsInput);
  }

  hasManyLabals(group: InputFilterGroup): boolean {
    return group.filter.labels?.length > 10;
  }

  areAllSelected(group: InputFilterGroup): boolean {
    const filteredLabels = this.getFilteredLabels(group);
    return filteredLabels.length > 0 && filteredLabels.every(label => label.data.checked);
  }

  toggleSelectAll(group: InputFilterGroup): void {
    const filteredLabels = this.getFilteredLabels(group);
    const allSelected = this.areAllSelected(group);
    filteredLabels.forEach(label => {
      label.data.checked = !allSelected;
    });
    this.selectionChange.emit(this.filterGroupsInput.filter(fg => fg.measureId === group.measureId));
  }

  onSearchChange(event: Event, filterId: string) {
    const inputElement = event.target as HTMLInputElement;
    this.searchTerms.set(filterId, inputElement.value);
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

  private updateBlockedFilters(measureId: string): void {
    const measure = this.measuresInput.find(m => m.id === measureId);
    if (!measure || !measure.blockedFilters || measure.blockedFilters.length === 0) {
        return;
    }

    const filterGroupsForMeasure = this.filterGroupsInput.filter(fg => fg.measureId === measureId);
    filterGroupsForMeasure.forEach(group => group.filter.disabled = false);

    const activeFilterIds = new Set(
        filterGroupsForMeasure
            .filter(g => g.filter.labels?.some(l => l.data.checked))
            .map(g => g.filter.id)
    );

    if (activeFilterIds.size === 0) {
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
}
