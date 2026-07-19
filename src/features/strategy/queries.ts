import { getDb } from "@/lib/db";
import { getActiveInstallation } from "@/features/installation/server";
import { resolveStrategicReportingYear } from "./reporting-cycle";
import type { GoalKpiInput } from "./calculations";
import {
  calculateStrategicGoalCompletion,
  type StrategicGoalCompletionDefinition,
} from "./goal-completion";
import { resolveEffectiveTargetPolicy } from "./target-policy";
import {
  type ConfigurationStatus,
  type GoalCompletionRule as GoalCompletionRuleName,
  type GoalManualStatus,
  type MeasurementType,
  type StrategyAuditEntityType,
  type StrategyReportingFrequency,
} from "./types";
import {
  asComponent,
  asGoalMembership,
  asKpiIdentity,
  asMeasurementConfig,
  asStrategicGoal,
  asTarget,
  type ConfigurationGapCounts,
  type ConfigurationGapRow,
  type PersistedComponent,
  type PersistedMeasurementConfig,
  type PersistedStrategicGoal,
  type PersistedTarget,
  type StrategicGoalMemberReadModel,
  type StrategicGoalReadModel,
  type StrategyComponentWithTargets,
} from "./records";

interface StrategyReadOptions {
  year?: number;
  includeArchived?: boolean;
}

/** Retrieves year. */
function queryYear(requested: number | undefined): number {
  if (requested !== undefined) return requested;
  return resolveStrategicReportingYear(undefined, getActiveInstallation().years);
}

interface StrategicAuditIdentity {
  entity_type: StrategyAuditEntityType;
  entity_id: number;
}

/** Every durable strategic entity ever owned by a KPI, across effective years. */
export function listStrategicAuditIdentitiesForKpi(
  kpiId: number,
): StrategicAuditIdentity[] {
  const rows = getDb()
    .prepare(
      `SELECT 'kpi' AS entity_type, ? AS entity_id
       UNION SELECT 'measurement_config', id FROM kpi_measurement_configs WHERE kpi_id = ?
       UNION SELECT 'kpi_config', id FROM kpi_measurement_configs WHERE kpi_id = ?
       UNION SELECT 'component', id FROM kpi_components WHERE kpi_id = ?
       UNION SELECT 'kpi_component', id FROM kpi_components WHERE kpi_id = ?
       UNION SELECT 'target', id FROM kpi_targets
         WHERE kpi_id = ? OR component_id IN (SELECT id FROM kpi_components WHERE kpi_id = ?)
       UNION SELECT 'kpi_target', id FROM kpi_targets
         WHERE kpi_id = ? OR component_id IN (SELECT id FROM kpi_components WHERE kpi_id = ?)
       UNION SELECT 'distribution_band', id FROM distribution_bands WHERE kpi_id = ?
       UNION SELECT 'kpi_observation', id FROM kpi_observations WHERE kpi_id = ?
       UNION SELECT 'kpi_component_entry', entry.id
         FROM kpi_component_entries entry
         JOIN kpi_components component ON component.id = entry.component_id
         WHERE component.kpi_id = ?
       UNION SELECT 'distribution_observation', id
         FROM distribution_observations WHERE kpi_id = ?
       UNION SELECT 'goal_membership', id FROM goal_kpis WHERE kpi_id = ?
       UNION SELECT 'goal_kpi', id FROM goal_kpis WHERE kpi_id = ?
       UNION SELECT 'strategic_goal', goal.id
         FROM strategic_goals goal
         JOIN goal_kpis membership ON membership.goal_id = goal.id
         WHERE membership.kpi_id = ?
       UNION SELECT 'goal', goal.id
         FROM strategic_goals goal
         JOIN goal_kpis membership ON membership.goal_id = goal.id
         WHERE membership.kpi_id = ?`,
    )
    .all(
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
      kpiId,
    ) as Array<{ entity_type: StrategyAuditEntityType; entity_id: number }>;
  return rows.map((row) => ({
    entity_type: row.entity_type,
    entity_id: Number(row.entity_id),
  }));
}

/** Retrieves strategic goal record. */
export function getStrategicGoalRecord(
  id: number,
): PersistedStrategicGoal | null {
  const row = getDb()
    .prepare(
      `SELECT g.*, c.slug AS priority_slug, c.name AS priority_name
       FROM strategic_goals g
       JOIN categories c ON c.id = g.priority_id
       WHERE g.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  return row ? asStrategicGoal(row) : null;
}

/** Retrieves strategic goal record by slug. */
function getStrategicGoalRecordBySlug(
  slug: string,
): PersistedStrategicGoal | null {
  const row = getDb()
    .prepare(
      `SELECT g.*, c.slug AS priority_slug, c.name AS priority_name
       FROM strategic_goals g
       JOIN categories c ON c.id = g.priority_id
       WHERE g.slug = ?`,
    )
    .get(slug) as Record<string, unknown> | undefined;
  return row ? asStrategicGoal(row) : null;
}

/** Retrieves measurement config record. */
export function getMeasurementConfigRecord(
  id: number,
): PersistedMeasurementConfig | null {
  const row = getDb()
    .prepare("SELECT * FROM kpi_measurement_configs WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? asMeasurementConfig(row) : null;
}

/** Retrieves component record. */
export function getComponentRecord(id: number): PersistedComponent | null {
  const row = getDb()
    .prepare("SELECT * FROM kpi_components WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? asComponent(row) : null;
}

/** Retrieves target record. */
export function getTargetRecord(id: number): PersistedTarget | null {
  const row = getDb()
    .prepare("SELECT * FROM kpi_targets WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? asTarget(row) : null;
}

/** Retrieves effective measurement config. */
export function getEffectiveMeasurementConfig(
  kpiId: number,
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived"> = {},
): PersistedMeasurementConfig | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM kpi_measurement_configs
       WHERE kpi_id = ?
         AND effective_from_year <= ?
         AND (effective_to_year IS NULL OR effective_to_year >= ?)
         ${options.includeArchived ? "" : "AND archived_at IS NULL"}
       ORDER BY effective_from_year DESC, id DESC
       LIMIT 1`,
    )
    .get(kpiId, year, year) as Record<string, unknown> | undefined;
  return row ? asMeasurementConfig(row) : null;
}

/** Retrieves effective measurement configs. */
export function listEffectiveMeasurementConfigs(
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived"> = {},
): PersistedMeasurementConfig[] {
  const rows = getDb()
    .prepare(
      `SELECT config.*
       FROM kpi_measurement_configs config
       WHERE config.effective_from_year <= ?
         AND (config.effective_to_year IS NULL OR config.effective_to_year >= ?)
         ${options.includeArchived ? "" : "AND config.archived_at IS NULL"}
         AND NOT EXISTS (
           SELECT 1 FROM kpi_measurement_configs newer
           WHERE newer.kpi_id = config.kpi_id
             AND newer.effective_from_year <= ?
             AND (newer.effective_to_year IS NULL OR newer.effective_to_year >= ?)
             ${options.includeArchived ? "" : "AND newer.archived_at IS NULL"}
             AND (
               newer.effective_from_year > config.effective_from_year OR
               (newer.effective_from_year = config.effective_from_year AND newer.id > config.id)
             )
         )
       ORDER BY config.kpi_id`,
    )
    .all(year, year, year, year) as Record<string, unknown>[];
  return rows.map(asMeasurementConfig);
}

/** Implements the effective target clause operation. */
function effectiveTargetClause(): string {
  return `(
    (target_scope = 'annual' AND reporting_year = ?) OR
    target_scope = 'full_plan'
  )`;
}

/** Retrieves effective targets for kpi. */
export function listEffectiveTargetsForKpi(
  kpiId: number,
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived"> = {},
): PersistedTarget[] {
  const plan = getActiveInstallation().plan;
  if (year < plan.startYear || year > plan.endYear) {
    return [];
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM kpi_targets
       WHERE kpi_id = ? AND component_id IS NULL
         AND ${effectiveTargetClause()}
         ${options.includeArchived ? "" : "AND archived_at IS NULL"}
       ORDER BY CASE target_scope WHEN 'annual' THEN 0 ELSE 1 END,
                reporting_year, target_year, id`,
    )
    .all(kpiId, year) as Record<string, unknown>[];
  return rows.map(asTarget);
}

/** Retrieves effective targets for component. */
function listEffectiveTargetsForComponent(
  componentId: number,
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived"> = {},
): PersistedTarget[] {
  const plan = getActiveInstallation().plan;
  if (year < plan.startYear || year > plan.endYear) {
    return [];
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM kpi_targets
       WHERE component_id = ? AND kpi_id IS NULL
         AND ${effectiveTargetClause()}
         ${options.includeArchived ? "" : "AND archived_at IS NULL"}
       ORDER BY CASE target_scope WHEN 'annual' THEN 0 ELSE 1 END,
                reporting_year, target_year, id`,
    )
    .all(componentId, year) as Record<string, unknown>[];
  return rows.map(asTarget);
}

/** Retrieves components for configuration. */
export function listComponentsForConfiguration(
  configurationId: number,
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived"> = {},
): StrategyComponentWithTargets[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM kpi_components
       WHERE configuration_id = ?
         ${options.includeArchived ? "" : "AND archived_at IS NULL"}
       ORDER BY display_order, id`,
    )
    .all(configurationId) as Record<string, unknown>[];
  return rows.map((row) => {
    const component = asComponent(row);
    return {
      ...component,
      targets: listEffectiveTargetsForComponent(component.id, year, options),
    };
  });
}

/** Retrieves goal members. */
function listGoalMembers(
  goalId: number,
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived">,
): StrategicGoalMemberReadModel[] {
  const rows = getDb()
    .prepare(
      `SELECT membership.*,
              k.slug AS kpi_slug, k.name AS kpi_name, k.unit AS kpi_unit,
              k.category_id,
              c.slug AS category_slug, c.name AS category_name
       FROM goal_kpis membership
       JOIN kpis k ON k.id = membership.kpi_id
       JOIN categories c ON c.id = k.category_id
       WHERE membership.goal_id = ?
         AND membership.effective_from_year <= ?
         AND (membership.effective_to_year IS NULL OR membership.effective_to_year >= ?)
         ${
           options.includeArchived
             ? ""
             : `AND membership.archived_at IS NULL
                AND k.archived_at IS NULL
                AND c.archived_at IS NULL`
         }
       ORDER BY membership.display_order, membership.id`,
    )
    .all(goalId, year, year) as Record<string, unknown>[];

  return rows.map((row) => {
    const membership = asGoalMembership(row);
    const configuration = getEffectiveMeasurementConfig(
      membership.kpi_id,
      year,
      options,
    );
    return {
      ...membership,
      kpi: asKpiIdentity(row),
      configuration,
      targets: listEffectiveTargetsForKpi(membership.kpi_id, year, options),
      components: configuration
        ? listComponentsForConfiguration(configuration.id, year, options)
        : [],
    };
  });
}

interface StrategicGoalListFilter extends StrategyReadOptions {
  priority_id?: number;
  priority_slug?: string;
  configuration_status?: ConfigurationStatus;
}

/** Retrieves strategic goals. */
export function listStrategicGoals(
  filter: StrategicGoalListFilter = {},
): StrategicGoalReadModel[] {
  const year = queryYear(filter.year);
  const planId = getActiveInstallation().plan.id;
  const where = [
    "g.plan_start_year <= ?",
    "g.plan_end_year >= ?",
    "c.plan_id = ?",
  ];
  const params: Array<string | number> = [year, year, planId];
  if (!filter.includeArchived) {
    where.push("g.archived_at IS NULL");
    where.push("c.archived_at IS NULL");
  }
  if (filter.priority_id !== undefined) {
    where.push("g.priority_id = ?");
    params.push(filter.priority_id);
  }
  if (filter.priority_slug !== undefined) {
    where.push("c.slug = ?");
    params.push(filter.priority_slug);
  }
  if (filter.configuration_status !== undefined) {
    where.push("g.configuration_status = ?");
    params.push(filter.configuration_status);
  }
  const rows = getDb()
    .prepare(
      `SELECT g.*, c.slug AS priority_slug, c.name AS priority_name
       FROM strategic_goals g
       JOIN categories c ON c.id = g.priority_id
       WHERE ${where.join(" AND ")}
       ORDER BY c.sort_order, g.sort_order, g.id`,
    )
    .all(...params) as Record<string, unknown>[];
  return rows.map((row) => {
    const goal = asStrategicGoal(row);
    return {
      ...goal,
      members: listGoalMembers(goal.id, year, filter),
    };
  });
}

/** Retrieves strategic goal. */
function getStrategicGoal(
  id: number,
  options: StrategyReadOptions = {},
): StrategicGoalReadModel | null {
  const goal = getStrategicGoalRecord(id);
  if (!goal) return null;
  if (!options.includeArchived && goal.archived_at !== null) return null;
  const priority = getDb()
    .prepare("SELECT plan_id, archived_at FROM categories WHERE id = ?")
    .get(goal.priority_id) as
    | { plan_id: number; archived_at?: string | null }
    | undefined;
  if (priority?.plan_id !== getActiveInstallation().plan.id) return null;
  if (!options.includeArchived && priority.archived_at != null) return null;
  const year = queryYear(options.year);
  if (year < goal.plan_start_year || year > goal.plan_end_year) return null;
  return {
    ...goal,
    members: listGoalMembers(goal.id, year, options),
  };
}

/** Retrieves strategic goal by slug. */
export function getStrategicGoalBySlug(
  slug: string,
  options: StrategyReadOptions = {},
): StrategicGoalReadModel | null {
  const goal = getStrategicGoalRecordBySlug(slug);
  return goal ? getStrategicGoal(goal.id, options) : null;
}

interface ConfigurationGapFilter {
  year?: number;
  priority_id?: number;
  goal_id?: number;
  configuration_status?: ConfigurationStatus;
  owner?: string;
  target_year?: number;
  reporting_frequency?: StrategyReportingFrequency;
}

/** Implements the missing measurement configuration operation. */
function missingMeasurementConfiguration(
  kpiId: number,
  year: number,
): PersistedMeasurementConfig {
  return {
    id: 0,
    kpi_id: kpiId,
    effective_from_year: year,
    effective_to_year: null,
    measurement_type: null,
    unit: null,
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    reporting_frequency: null,
    aggregation_method: null,
    board_level_status: null,
    calculation_precision: 1,
    configuration_status: "needs_definition",
    unresolved_question: "Create a measurement configuration for this KPI.",
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: null,
    allow_score_over_max: false,
    archived_at: null,
    created_by: null,
    created_at: "",
    updated_by: null,
    updated_at: "",
  };
}

export interface ConfigurationGoalCompletionRow {
  goal_id: number;
  /** Registers a goal whose effective membership set is genuinely empty. */
  goal_only?: boolean;
  goal_configuration_status?: ConfigurationStatus;
  goal_completion_rule?: GoalCompletionRuleName;
  goal_threshold_count?: number | null;
  goal_threshold_percentage?: number | null;
  goal_manual_status?: GoalManualStatus | null;
  goal_unresolved_question?: string | null;
  kpi_id?: number;
  kpi_name?: string;
  role: "required" | "informational";
  weight?: number;
  effective_configuration_status?: ConfigurationStatus;
  exclusion_reasons: string[];
}

interface ConfigurationGapCollection {
  rows: ConfigurationGapRow[];
  completionRows: ConfigurationGoalCompletionRow[];
}

/** Determines whether has calculable effective target. */
function hasCalculableEffectiveTarget({
  targets,
  year,
  measurementType,
  configurationStatus,
}: {
  targets: readonly PersistedTarget[];
  year: number;
  measurementType: MeasurementType | null;
  configurationStatus: ConfigurationStatus;
}): boolean {
  const decision = resolveEffectiveTargetPolicy({
    targets,
    reportingYear: year,
    measurementType,
    parentConfigurationStatus: configurationStatus,
  }).effective;
  return (
    decision.target !== null &&
    decision.value !== null &&
    (decision.calculationConfigurationStatus === "ready" ||
      decision.calculationConfigurationStatus === "active")
  );
}

/** Determines whether has aggregation complete target. */
function hasAggregationCompleteTarget(
  member: StrategicGoalMemberReadModel,
  config: PersistedMeasurementConfig,
  year: number,
): boolean {
  const parentTargetReady = hasCalculableEffectiveTarget({
    targets: member.targets,
    year,
    measurementType: config.measurement_type,
    configurationStatus: config.configuration_status,
  });
  if (config.measurement_type !== "multi_component") {
    return parentTargetReady;
  }

  const everyComponentTargetReady =
    member.components.length > 0 &&
    member.components.every((component) =>
      hasCalculableEffectiveTarget({
        targets: component.targets,
        year,
        measurementType: component.measurement_type,
        configurationStatus: component.configuration_status,
      }),
    );

  switch (config.aggregation_method) {
    case "all_complete":
      // The aggregate value itself cannot be calculated until every active
      // component can be evaluated against its own target.
      return everyComponentTargetReady;
    case "average":
    case "weighted_average":
    case "sum":
      // These methods support either a direct parent target or a complete set
      // of component targets from which parent completion can be derived.
      return parentTargetReady || everyComponentTargetReady;
    case "ratio":
      // Numerator/denominator component targets do not define a target for the
      // resulting ratio; the aggregated ratio needs a parent target.
      return parentTargetReady;
    case "none":
    case null:
      return parentTargetReady;
  }
}

/** Implements the all configuration rows operation. */
function allConfigurationRows(
  filter: ConfigurationGapFilter,
): ConfigurationGapCollection {
  const year = queryYear(filter.year);
  const goals = listStrategicGoals({
    year,
    ...(filter.priority_id === undefined
      ? {}
      : { priority_id: filter.priority_id }),
  });
  const rows: ConfigurationGapRow[] = [];
  const completionRows: ConfigurationGoalCompletionRow[] = [];
  for (const goal of goals) {
    if (filter.goal_id !== undefined && goal.id !== filter.goal_id) continue;
    if (goal.members.length === 0) {
      completionRows.push({
        goal_id: goal.id,
        goal_only: true,
        goal_configuration_status: goal.configuration_status,
        goal_completion_rule: goal.completion_rule,
        goal_threshold_count: goal.threshold_count,
        goal_threshold_percentage: goal.threshold_percentage,
        goal_manual_status: goal.manual_status,
        goal_unresolved_question: goal.unresolved_question,
        role: "informational",
        exclusion_reasons: [],
      });
    }
    for (const member of goal.members) {
      const config =
        member.configuration ??
        missingMeasurementConfiguration(member.kpi_id, year);
      if (
        filter.configuration_status !== undefined &&
        config.configuration_status !== filter.configuration_status
      ) {
        continue;
      }
      if (filter.owner !== undefined && config.owner !== filter.owner) continue;
      if (
        filter.reporting_frequency !== undefined &&
        config.reporting_frequency !== filter.reporting_frequency
      ) {
        continue;
      }
      const targetYears = Array.from(
        new Set([
          ...member.targets.map((target) => target.target_year),
          ...member.components.flatMap((component) =>
            component.targets.map((target) => target.target_year),
          ),
        ]),
      ).sort((a, b) => a - b);
      if (
        filter.target_year !== undefined &&
        !targetYears.includes(filter.target_year)
      ) {
        continue;
      }
      const missingMeasurementType = config.measurement_type === null;
      // `none` is an intentional aggregation method: multi-component KPIs may
      // expose independent, unlike-unit results without a misleading parent
      // total. Only a genuinely absent method is a formula gap.
      const missingFormula =
        config.measurement_type !== null &&
        config.aggregation_method === null;
      const missingComponents =
        config.measurement_type === "multi_component" &&
        member.components.length === 0;
      const hasCalculableTarget = hasAggregationCompleteTarget(
        member,
        config,
        year,
      );
      const missingTarget = !hasCalculableTarget;
      const missingDenominator =
        (config.measurement_type === "percentage" ||
          config.measurement_type === "ratio") &&
        config.denominator_label === null &&
        config.fixed_denominator === null;
      const reasons: string[] = [];
      if (config.configuration_status === "draft") reasons.push("draft");
      if (config.configuration_status === "needs_definition") {
        reasons.push("needs_definition");
      }
      if (config.configuration_status === "needs_target") {
        reasons.push("needs_target");
      }
      if (missingMeasurementType) reasons.push("missing_measurement_type");
      if (missingFormula) reasons.push("missing_formula");
      if (missingComponents) reasons.push("missing_components");
      if (missingTarget) reasons.push("missing_target");
      if (missingDenominator) reasons.push("missing_denominator");
      if (config.unresolved_question?.trim()) reasons.push("unresolved_question");
      rows.push({
        kpi: member.kpi,
        goal_id: goal.id,
        goal_slug: goal.slug,
        goal_name: goal.name,
        priority_id: goal.priority_id,
        priority_slug: goal.priority_slug,
        priority_name: goal.priority_name,
        membership_role: member.role,
        configuration: config,
        target_years: targetYears,
        missing_measurement_type: missingMeasurementType,
        missing_formula: missingFormula,
        missing_components: missingComponents,
        missing_target: missingTarget,
        missing_denominator: missingDenominator,
        missing_target_year: missingTarget,
        exclusion_reasons: reasons,
      });
      completionRows.push({
        goal_id: goal.id,
        goal_configuration_status: goal.configuration_status,
        goal_completion_rule: goal.completion_rule,
        goal_threshold_count: goal.threshold_count,
        goal_threshold_percentage: goal.threshold_percentage,
        goal_manual_status: goal.manual_status,
        goal_unresolved_question: goal.unresolved_question,
        kpi_id: member.kpi_id,
        kpi_name: member.kpi.name,
        role: member.role,
        weight: member.weight,
        effective_configuration_status: gapCompletionConfigurationStatus({
          configurationStatus: config.configuration_status,
          missingMeasurementType,
          missingFormula,
          missingComponents,
          missingTarget,
          missingDenominator,
        }),
        exclusion_reasons: reasons,
      });
    }
  }
  return { rows, completionRows };
}

/** Retrieves configuration gaps. */
export function listConfigurationGaps(
  filter: ConfigurationGapFilter = {},
): ConfigurationGapRow[] {
  return allConfigurationRows(filter).rows.filter(
    (row) => row.exclusion_reasons.length > 0,
  );
}

/** Retrieves configuration gap counts. */
export function getConfigurationGapCounts(
  filter: ConfigurationGapFilter = {},
): ConfigurationGapCounts {
  const { rows: all, completionRows } = allConfigurationRows(filter);
  const excludedGoals = countGoalsExcludedByConfiguration(completionRows);
  const year = queryYear(filter.year);
  const archivedParams: Array<string | number> = [year, year];
  const archivedWhere = [
    "config.effective_from_year <= ?",
    "(config.effective_to_year IS NULL OR config.effective_to_year >= ?)",
    "config.archived_at IS NOT NULL",
  ];
  if (filter.priority_id !== undefined) {
    archivedWhere.push("category.id = ?");
    archivedParams.push(filter.priority_id);
  }
  if (filter.goal_id !== undefined) {
    archivedWhere.push("goal.id = ?");
    archivedParams.push(filter.goal_id);
  }
  if (filter.owner !== undefined) {
    archivedWhere.push("config.owner = ?");
    archivedParams.push(filter.owner);
  }
  if (filter.reporting_frequency !== undefined) {
    archivedWhere.push("config.reporting_frequency = ?");
    archivedParams.push(filter.reporting_frequency);
  }
  const archivedKpis = Number(
    (
      getDb()
        .prepare(
          `SELECT COUNT(DISTINCT config.kpi_id) AS count
           FROM kpi_measurement_configs config
           JOIN kpis kpi ON kpi.id = config.kpi_id
           JOIN categories category ON category.id = kpi.category_id
           LEFT JOIN goal_kpis membership ON membership.kpi_id = kpi.id
           LEFT JOIN strategic_goals goal ON goal.id = membership.goal_id
           WHERE ${archivedWhere.join(" AND ")}`,
        )
        .get(...archivedParams) as { count: number }
    ).count,
  );
  return {
    ready_kpis: all.filter(
      (row) => row.configuration.configuration_status === "ready",
    ).length,
    active_kpis: all.filter(
      (row) => row.configuration.configuration_status === "active",
    ).length,
    kpis_needing_targets: all.filter(
      (row) =>
        row.configuration.configuration_status === "needs_target" ||
        row.missing_target,
    ).length,
    kpis_needing_definitions: all.filter(
      (row) =>
        row.configuration.configuration_status === "needs_definition" ||
        row.missing_measurement_type ||
        row.missing_formula ||
        row.missing_components ||
        row.missing_denominator,
    ).length,
    goals_excluded_from_completion: excludedGoals,
    archived_kpis: archivedKpis,
  };
}

/** Calculates goals excluded by configuration. */
export function countGoalsExcludedByConfiguration(
  rows: ConfigurationGoalCompletionRow[],
): number {
  const grouped = new Map<number, {
    goal: StrategicGoalCompletionDefinition;
    kpis: GoalKpiInput[];
  }>();

  rows.forEach((row, index) => {
    const group = grouped.get(row.goal_id) ?? {
      goal: {
        id: row.goal_id,
        completion_rule: row.goal_completion_rule ?? "all_required_kpis",
        threshold_count: row.goal_threshold_count ?? null,
        threshold_percentage: row.goal_threshold_percentage ?? null,
        manual_status: row.goal_manual_status ?? null,
        configuration_status: row.goal_configuration_status ?? "active",
        unresolved_question: row.goal_unresolved_question ?? null,
      },
      kpis: [],
    };
    if (!row.goal_only) {
      const configurationStatus = row.effective_configuration_status ??
        inferCompletionConfigurationStatus(row.exclusion_reasons);
      group.kpis.push({
        id: String(row.kpi_id ?? `${row.goal_id}:${index}`),
        label: row.kpi_name,
        role: row.role,
        configurationStatus,
        progress:
          configurationStatus === "active" || configurationStatus === "ready"
            ? 0
            : null,
        weight: row.weight ?? 1,
      });
    }
    grouped.set(row.goal_id, group);
  });

  return Array.from(grouped.values()).filter(({ goal, kpis }) =>
    !calculateStrategicGoalCompletion({ goal, kpis }).eligible
  ).length;
}

/** Implements the gap completion configuration status operation. */
function gapCompletionConfigurationStatus({
  configurationStatus,
  missingMeasurementType,
  missingFormula,
  missingComponents,
  missingTarget,
  missingDenominator,
}: {
  configurationStatus: ConfigurationStatus;
  missingMeasurementType: boolean;
  missingFormula: boolean;
  missingComponents: boolean;
  missingTarget: boolean;
  missingDenominator: boolean;
}): ConfigurationStatus {
  if (configurationStatus !== "ready" && configurationStatus !== "active") {
    return configurationStatus;
  }
  if (
    missingMeasurementType ||
    missingFormula ||
    missingComponents ||
    missingDenominator
  ) {
    return "needs_definition";
  }
  if (missingTarget) return "needs_target";
  return configurationStatus;
}

/** Implements the infer completion configuration status operation. */
function inferCompletionConfigurationStatus(
  reasons: string[],
): ConfigurationStatus {
  if (reasons.includes("archived")) return "archived";
  if (reasons.includes("draft")) return "draft";
  if (
    reasons.includes("needs_definition") ||
    reasons.includes("missing_measurement_type") ||
    reasons.includes("missing_formula") ||
    reasons.includes("missing_components") ||
    reasons.includes("missing_denominator")
  ) {
    return "needs_definition";
  }
  if (reasons.includes("needs_target") || reasons.includes("missing_target")) {
    return "needs_target";
  }
  return "active";
}
