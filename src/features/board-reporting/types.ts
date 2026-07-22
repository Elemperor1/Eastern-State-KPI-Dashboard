export interface BoardReportingMeasure {
  id: number;
  slug: string;
  name: string;
}

export interface BoardReportingStatement {
  id: number;
  text: string;
  displayOrder: number;
  measures: BoardReportingMeasure[];
}

export interface BoardReportingPriority {
  id: number;
  priorityId: number;
  prioritySlug: string;
  priorityName: string;
  displayTitle: string;
  displayOrder: number;
  statements: BoardReportingStatement[];
}

export interface BoardReportingScope {
  id: number;
  planId: number;
  revision: number;
  priorities: BoardReportingPriority[];
}

export interface BoardReportingPriorityOption {
  id: number;
  slug: string;
  name: string;
  measures: BoardReportingMeasure[];
}

export interface BoardReportingAdminModel {
  scope: BoardReportingScope;
  availablePriorities: BoardReportingPriorityOption[];
}
