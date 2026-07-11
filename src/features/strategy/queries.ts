import { getDb } from "@/lib/db";
import { resolveConfiguredTargetValue } from "./calculations";
import {
  STRATEGIC_PLAN_END_YEAR,
  STRATEGIC_PLAN_START_YEAR,
  type ConfigurationStatus,
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

export interface StrategyReadOptions {
  year?: number;
  includeArchived?: boolean;
}

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

export function getStrategicGoalRecordBySlug(
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

export function getMeasurementConfigRecord(
  id: number,
): PersistedMeasurementConfig | null {
  const row = getDb()
    .prepare("SELECT * FROM kpi_measurement_configs WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? asMeasurementConfig(row) : null;
}

export function getComponentRecord(id: number): PersistedComponent | null {
  const row = getDb()
    .prepare("SELECT * FROM kpi_components WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? asComponent(row) : null;
}

export function getTargetRecord(id: number): PersistedTarget | null {
  const row = getDb()
    .prepare("SELECT * FROM kpi_targets WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? asTarget(row) : null;
}

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

function effectiveTargetClause(): string {
  return `(
    (target_scope = 'annual' AND reporting_year = ?) OR
    target_scope = 'full_plan'
  )`;
}

export function listEffectiveTargetsForKpi(
  kpiId: number,
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived"> = {},
): PersistedTarget[] {
  if (year < STRATEGIC_PLAN_START_YEAR || year > STRATEGIC_PLAN_END_YEAR) {
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

export function listEffectiveTargetsForComponent(
  componentId: number,
  year: number,
  options: Pick<StrategyReadOptions, "includeArchived"> = {},
): PersistedTarget[] {
  if (year < STRATEGIC_PLAN_START_YEAR || year > STRATEGIC_PLAN_END_YEAR) {
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

export interface StrategicGoalListFilter extends StrategyReadOptions {
  priority_id?: number;
  priority_slug?: string;
  configuration_status?: ConfigurationStatus;
}

export function listStrategicGoals(
  filter: StrategicGoalListFilter = {},
): StrategicGoalReadModel[] {
  const year = filter.year ?? 2026;
  const where = ["g.plan_start_year <= ?", "g.plan_end_year >= ?"];
  const params: Array<string | number> = [year, year];
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

export function getStrategicGoal(
  id: number,
  options: StrategyReadOptions = {},
): StrategicGoalReadModel | null {
  const goal = getStrategicGoalRecord(id);
  if (!goal) return null;
  if (!options.includeArchived && goal.archived_at !== null) return null;
  if (!options.includeArchived) {
    const priority = getDb()
      .prepare("SELECT archived_at FROM categories WHERE id = ?")
      .get(goal.priority_id) as { archived_at?: string | null } | undefined;
    if (priority?.archived_at != null) return null;
  }
  const year = options.year ?? 2026;
  if (year < goal.plan_start_year || year > goal.plan_end_year) return null;
  return {
    ...goal,
    members: listGoalMembers(goal.id, year, options),
  };
}

export function getStrategicGoalBySlug(
  slug: string,
  options: StrategyReadOptions = {},
): StrategicGoalReadModel | null {
  const goal = getStrategicGoalRecordBySlug(slug);
  return goal ? getStrategicGoal(goal.id, options) : null;
}

export interface ConfigurationGapFilter {
  year?: number;
  priority_id?: number;
  goal_id?: number;
  configuration_status?: ConfigurationStatus;
  owner?: string;
  target_year?: number;
  reporting_frequency?: StrategyReportingFrequency;
}

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

function allConfigurationRows(
  filter: ConfigurationGapFilter,
): ConfigurationGapRow[] {
  const year = filter.year ?? 2026;
  const goals = listStrategicGoals({
    year,
    ...(filter.priority_id === undefined
      ? {}
      : { priority_id: filter.priority_id }),
  });
  const rows: ConfigurationGapRow[] = [];
  for (const goal of goals) {
    if (filter.goal_id !== undefined && goal.id !== filter.goal_id) continue;
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
      const hasCalculableTarget =
        member.targets.some(
          (target) =>
            resolveConfiguredTargetValue({
              measurementType: config.measurement_type,
              targetValue: target.target_value,
              structuredTarget: target.structured_target,
              targetDescription: target.target_description,
              configurationStatus: target.configuration_status,
            }) !== null,
        ) ||
        member.components.some((component) =>
          component.targets.some(
            (target) =>
              resolveConfiguredTargetValue({
                measurementType: component.measurement_type,
                targetValue: target.target_value,
                structuredTarget: target.structured_target,
                targetDescription: target.target_description,
                configurationStatus: target.configuration_status,
              }) !== null,
          ),
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
    }
  }
  return rows;
}

export function listConfigurationGaps(
  filter: ConfigurationGapFilter = {},
): ConfigurationGapRow[] {
  return allConfigurationRows(filter).filter(
    (row) => row.exclusion_reasons.length > 0,
  );
}

export function getConfigurationGapCounts(
  filter: ConfigurationGapFilter = {},
): ConfigurationGapCounts {
  const all = allConfigurationRows(filter);
  const excludedGoals = new Set(
    all
      .filter((row) => row.exclusion_reasons.length > 0)
      .map((row) => row.goal_id),
  );
  const year = filter.year ?? 2026;
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
    goals_excluded_from_completion: excludedGoals.size,
    archived_kpis: archivedKpis,
  };
}
