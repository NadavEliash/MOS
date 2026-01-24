export interface Measure {
  id: string;
  name: string;
  filters: string[];
  blockedFilters: string[] | string[][];
  relations: string[];
  graphType: string;
  xAxis: string;
  yAxis: string;
  value: string;
  categoryId: string;
}

export interface FilterGroup {
  measureId: string;
  title: string;
  expanded: boolean;
  filter: Filter;
}

export interface Filter {
  id: string;
  name: string;
  property: string;
  expanded?: boolean;
  labels: Label[];
  blocked?: string[];
  disabled?: boolean;
}

export interface Label {
  title: string;
  data: {
    values: number[];
    checked: boolean;
  }
}

export interface Graph {
  id: string;
  title: string;
  subtitle: string;
  data: any;
  isActive?: boolean;
}

export interface GraphData {
  categoryId: string
  title: string;
  type: string;
  description?: string;
  categories: FilterGroup; 
  series: { 
    name: string; 
    data: number[]; 
    color?: string;
    stack?: string;
  }[];
  filterGroups: FilterGroup[];
}