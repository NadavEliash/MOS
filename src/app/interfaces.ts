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
  calculation: string;
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
  disabledReason?: string;
}

export interface Label {
  title: string;
  data: {
    filterId: string;
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
  categoryId: string;
  title: string;
  subtitles?: string;
  type: string;
  description?: string;
  measureIds?: string[];
  categories: FilterGroup; 
  series: { 
    name: string; 
    data: number[]; 
    color?: string;
    stack?: string;
  }[];
  filterGroups: FilterGroup[];
}
