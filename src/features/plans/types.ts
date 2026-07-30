export type StrategicPlanLifecycleState =
  | "draft"
  | "active"
  | "archived"
  | "cancelled";

export type StrategicPlanCreationMethod =
  | "original"
  | "blank"
  | "structural_clone";

export interface StrategicPlanSummary {
  id: number;
  organizationId: number;
  predecessorPlanId: number | null;
  slug: string;
  name: string;
  description: string | null;
  startYear: number;
  endYear: number;
  lifecycleState: StrategicPlanLifecycleState;
  creationMethod: StrategicPlanCreationMethod;
  revision: number;
  wholePlanRevision: number;
  cloneSourceRevision: number | null;
  approvalSource: string | null;
  sourceChangedAt: string | null;
  archivedAt: string | null;
  cancelledAt: string | null;
  activatedAt: string | null;
  activationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ReadinessLevel = "hard_rule" | "requirement" | "warning";

export interface PlanReadinessItem {
  key: string;
  level: ReadinessLevel;
  section:
    | "plan_details"
    | "plan_structure"
    | "targets_board"
    | "check_activate";
  title: string;
  guidance: string;
  affectedCount?: number;
  overridden?: boolean;
  overrideReason?: string | null;
}

export type ReadinessOutcome =
  | "ready"
  | "ready_with_warnings"
  | "needs_decisions"
  | "cannot_activate";

export interface PlanReadinessEvaluation {
  planId: number;
  wholePlanRevision: number;
  evaluatedAt: string;
  outcome: ReadinessOutcome;
  hardRules: PlanReadinessItem[];
  requirements: PlanReadinessItem[];
  warnings: PlanReadinessItem[];
  canActivate: boolean;
}

export interface PlanSectionReview {
  section: "plan_details" | "plan_structure" | "targets_board";
  status: "needs_review" | "approved";
  predecessorRevision: number | null;
  reviewedAt: string | null;
  updatedAt: string;
}

export interface PlanLineageDisclosure {
  id: number;
  itemKind: string;
  successorItemId: number;
  predecessorItemId: number;
  relationshipType: "copied_from" | "merged_from" | "split_from";
  predecessorName: string;
  predecessorContext: Record<string, unknown>;
}

export interface PlanLineageSource {
  itemKind: "priority" | "goal" | "kpi";
  itemId: number;
  itemName: string;
  context: string;
}

export interface DraftMeasureSummary {
  id: number;
  name: string;
  unit: string;
  reportingFrequency: string;
  owner: string | null;
  requiresTarget: boolean;
  firstYearTargetReady: boolean;
  firstYearTarget: {
    id: number;
    value: number | null;
    sourceReference: string | null;
    configurationStatus: string;
    updatedAt: string;
  } | null;
  predecessorTargets: Array<{
    id: number;
    targetScope: "annual" | "full_plan";
    reportingYear: number | null;
    targetYear: number;
    value: number | null;
    description: string | null;
    sourceReference: string | null;
  }>;
  copiedFromName: string | null;
  updatedAt: string;
}

export interface DraftGoalSummary {
  id: number;
  name: string;
  owner: string | null;
  measures: DraftMeasureSummary[];
  copiedFromName: string | null;
  updatedAt: string;
}

export interface DraftPrioritySummary {
  id: number;
  name: string;
  goals: DraftGoalSummary[];
  copiedFromName: string | null;
  updatedAt: string;
}

export interface DraftBoardSummary {
  revision: number;
  reviewStatus: "needs_review" | "approved" | "intentional_empty";
  priorities: Array<{
    id: number;
    priorityId: number;
    priorityName: string;
    displayTitle: string;
    reviewStatus: "needs_review" | "approved";
    statements: Array<{
      id: number;
      text: string;
      measures: Array<{ id: number; name: string }>;
    }>;
  }>;
}

export interface DraftQuestionSummary {
  itemKind: "goal" | "measurement_config" | "component";
  itemId: number;
  itemName: string;
  question: string;
  updatedAt: string;
  classification: "must_resolve" | "follow_up" | null;
  explanation: string | null;
}

export interface PlanManagerModel {
  active: StrategicPlanSummary;
  draft: StrategicPlanSummary | null;
  archived: StrategicPlanSummary[];
  cancelled: StrategicPlanSummary[];
  sectionReviews: PlanSectionReview[];
  lineage: PlanLineageDisclosure[];
  lineageSources: PlanLineageSource[];
  draftStructure: DraftPrioritySummary[];
  draftBoard: DraftBoardSummary | null;
  draftQuestions: DraftQuestionSummary[];
  readiness: PlanReadinessEvaluation | null;
  successorPlanningEnabled: boolean;
}

export interface PlanActivationResult {
  activationId: string;
  predecessorPlanId: number;
  successorPlanId: number;
  status: "verified" | "committed_verification_failed";
  committedAt: string;
  verifiedAt: string | null;
  idempotent: boolean;
}

export type PlanLifecycleAction =
  | "create_blank"
  | "create_structural_clone"
  | "cancel"
  | "activate"
  | "archive"
  | "activation_recovered";

export interface PlanLifecycleEventRecord {
  id: number;
  eventId: string;
  planId: number;
  planName: string;
  predecessorPlanId: number | null;
  predecessorName: string | null;
  action: PlanLifecycleAction;
  beforeState: StrategicPlanLifecycleState | null;
  afterState: StrategicPlanLifecycleState;
  checkedPlanRevision: number | null;
  checkedPredecessorRevision: number | null;
  actorEmail: string | null;
  activationId: string | null;
  result: Record<string, unknown>;
  occurredAt: string;
}
