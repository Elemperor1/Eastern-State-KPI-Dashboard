import { getDb, transaction } from "@/lib/db";
import { recordStrategicAuditEvent } from "./audit";

const SOURCE_REFERENCE = "Eastern State Strategic Dashboard 2025-2029 (8.1.25)";
const LEGACY_QUESTION =
  "Finalize city and state support targets as portions of contributed revenue.";
const RATIO_QUESTION =
  "Finalize the government-support target as a portion of contributed revenue.";

type GovernmentSupportRatioRepair =
  | "already_current"
  | "not_applicable"
  | "repaired";

interface StrategicMigrationReconciliationResult {
  governmentSupportRatio: GovernmentSupportRatioRepair;
  canonicalGoalMetadata: number;
  canonicalMemberships: number;
  canonicalMeasurementMetadata: number;
  canonicalTargets: number;
}

interface GovernmentConfigRow extends Record<string, unknown> {
  id: number;
  kpi_id: number;
  kpi_name: string;
  kpi_archived_at: string | null;
  kpi_is_active: number;
  priority_name: string | null;
  priority_archived_at: string | null;
  goal_name: string | null;
  goal_archived_at: string | null;
  membership_id: number | null;
  membership_archived_at: string | null;
}

interface ComponentRow extends Record<string, unknown> {
  id: number;
  slug: string;
}

/**
 * Apply narrowly fingerprinted data corrections that accompany an additive
 * schema migration. This is deliberately not the canonical seed synchronizer:
 * populated databases own their configured rules, formulas, targets, and
 * workflow metadata.
 */
export function reconcileStrategicMigrationData(): StrategicMigrationReconciliationResult {
  return transaction(() => ({
    governmentSupportRatio: repairLegacyGovernmentSupportRatio(),
    canonicalGoalMetadata: repairCanonicalGoalMetadata(),
    canonicalMemberships: repairCanonicalMemberships(),
    canonicalMeasurementMetadata: repairCanonicalMeasurementMetadata(),
    canonicalTargets: repairCanonicalPreservationTarget(),
  }));
}

const SINGLE_MEMBER_QUESTION =
  "The source assigns only one KPI to this goal; confirm a second KPI or approve the exception to the 2-5 KPI rule.";

interface GoalMetadataRepair {
  slug: string;
  oldDescription: string;
  newDescription: string;
  oldStatus: string;
  newStatus: string;
  oldQuestion: string | null;
  newQuestion: string | null;
}

const GOAL_METADATA_REPAIRS: GoalMetadataRepair[] = [
  {
    slug: "career-pipelines-employment",
    oldDescription: "Measure employment and career advancement after program completion.",
    newDescription:
      "Measure employment and career advancement after program completion and connect participants through public events and job fairs.",
    oldStatus: "needs_definition",
    newStatus: "active",
    oldQuestion: SINGLE_MEMBER_QUESTION,
    newQuestion: null,
  },
  {
    slug: "workforce-awareness-recognition",
    oldDescription:
      "Track public events, external recognition, and awareness among people not currently engaged.",
    newDescription:
      "Track external recognition and awareness among people not currently engaged.",
    oldStatus: "active",
    newStatus: "active",
    oldQuestion: null,
    newQuestion: null,
  },
  {
    slug: "justice-education-partnerships-recognition",
    oldDescription: "Develop active school partnerships for justice education.",
    newDescription:
      "Develop active school partnerships and sustain repeat school and educator engagement in justice education.",
    oldStatus: "needs_definition",
    newStatus: "active",
    oldQuestion: SINGLE_MEMBER_QUESTION,
    newQuestion: null,
  },
  {
    slug: "criminal-justice-dialogue",
    oldDescription:
      "Measure educator confidence, repeat engagement, and audience representation.",
    newDescription:
      "Measure educator confidence and audience representation in criminal-justice dialogue.",
    oldStatus: "active",
    newStatus: "active",
    oldQuestion: null,
    newQuestion: null,
  },
  {
    slug: "architecture-contemporary-education",
    oldDescription: "Develop architecture-focused interpretation and programs.",
    newDescription:
      "Develop architecture-focused interpretation and extend contemporary justice education through digital programs and resources.",
    oldStatus: "needs_definition",
    newStatus: "needs_definition",
    oldQuestion: SINGLE_MEMBER_QUESTION,
    newQuestion:
      "Confirm how digital justice-education reach should be attributed between architecture interpretation and the broader schools-and-educators program.",
  },
  {
    slug: "optimize-facilities",
    oldDescription: "Measure site-space use for revenue and mission programs.",
    newDescription:
      "Measure site-space use for revenue, mission programs, and accessible reduced-price, free, or pay-what-you-wish events.",
    oldStatus: "needs_definition",
    newStatus: "active",
    oldQuestion: SINGLE_MEMBER_QUESTION,
    newQuestion: null,
  },
  {
    slug: "community-civic-hub",
    oldDescription:
      "Grow sponsorship, grants, accessible events, public support, and new donors.",
    newDescription: "Grow sponsorship, grants, public support, and new donors.",
    oldStatus: "active",
    newStatus: "active",
    oldQuestion: null,
    newQuestion: null,
  },
];

/** Implements the repair canonical goal metadata operation. */
function repairCanonicalGoalMetadata(): number {
  const db = getDb();
  let repaired = 0;
  for (const repair of GOAL_METADATA_REPAIRS) {
    const row = db.prepare(
      `SELECT goal.*, priority.name AS priority_name
       FROM strategic_goals goal
       JOIN categories priority ON priority.id = goal.priority_id
       WHERE goal.slug = ?`,
    ).get(repair.slug) as Record<string, unknown> | undefined;
    if (
      !row ||
      row.description !== repair.oldDescription ||
      row.configuration_status !== repair.oldStatus ||
      (row.unresolved_question ?? null) !== repair.oldQuestion ||
      row.plan_start_year !== 2025 ||
      row.plan_end_year !== 2029 ||
      row.completion_rule !== "all_required_kpis" ||
      row.source_reference !== SOURCE_REFERENCE ||
      row.archived_at !== null ||
      row.updated_by !== null
    ) {
      continue;
    }
    db.prepare(
      `UPDATE strategic_goals
       SET description = ?, configuration_status = ?, unresolved_question = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      repair.newDescription,
      repair.newStatus,
      repair.newQuestion,
      Number(row.id),
    );
    recordStrategicAuditEvent({
      entity_type: "strategic_goal",
      entity_id: Number(row.id),
      event_type: "update",
      entity_display_name: String(row.name),
      parent_priority_name: String(row.priority_name),
      previous_value: {
        description: repair.oldDescription,
        configuration_status: repair.oldStatus,
        unresolved_question: repair.oldQuestion,
      },
      new_value: {
        description: repair.newDescription,
        configuration_status: repair.newStatus,
        unresolved_question: repair.newQuestion,
      },
      source_reference: SOURCE_REFERENCE,
    });
    repaired += 1;
  }
  return repaired;
}

interface MembershipRepair {
  kpiSlug: string;
  oldGoalSlug: string;
  newGoalSlug: string;
  oldDisplayOrder: number;
  newDisplayOrder: number;
}

const MEMBERSHIP_REPAIRS: MembershipRepair[] = [
  {
    kpiSlug: "workforce-public-events-job-fairs",
    oldGoalSlug: "workforce-awareness-recognition",
    newGoalSlug: "career-pipelines-employment",
    oldDisplayOrder: 0,
    newDisplayOrder: 1,
  },
  {
    kpiSlug: "justice-ed-returning-schools-educators",
    oldGoalSlug: "criminal-justice-dialogue",
    newGoalSlug: "justice-education-partnerships-recognition",
    oldDisplayOrder: 1,
    newDisplayOrder: 1,
  },
  {
    kpiSlug: "justice-ed-online-digital-attendance",
    oldGoalSlug: "schools-educators-justice-education",
    newGoalSlug: "architecture-contemporary-education",
    oldDisplayOrder: 2,
    newDisplayOrder: 1,
  },
  {
    kpiSlug: "reduced-price-free-pwyw-events",
    oldGoalSlug: "community-civic-hub",
    newGoalSlug: "optimize-facilities",
    oldDisplayOrder: 1,
    newDisplayOrder: 1,
  },
];

/** Implements the repair canonical memberships operation. */
function repairCanonicalMemberships(): number {
  const db = getDb();
  let repaired = 0;
  for (const repair of MEMBERSHIP_REPAIRS) {
    const row = db.prepare(
      `SELECT membership.*, kpi.name AS kpi_name,
              old_goal.name AS old_goal_name,
              target_goal.id AS target_goal_id,
              target_goal.name AS target_goal_name,
              priority.name AS priority_name
       FROM goal_kpis membership
       JOIN kpis kpi ON kpi.id = membership.kpi_id
       JOIN strategic_goals old_goal ON old_goal.id = membership.goal_id
       JOIN strategic_goals target_goal ON target_goal.slug = ?
       JOIN categories priority ON priority.id = target_goal.priority_id
       WHERE kpi.slug = ? AND old_goal.slug = ?`,
    ).get(repair.newGoalSlug, repair.kpiSlug, repair.oldGoalSlug) as
      | Record<string, unknown>
      | undefined;
    if (
      !row ||
      row.is_required !== 1 ||
      Number(row.weight) !== 1 ||
      row.display_order !== repair.oldDisplayOrder ||
      row.effective_from_year !== 2025 ||
      row.effective_to_year !== 2029 ||
      row.archived_at !== null ||
      row.created_by !== null ||
      row.updated_by !== null ||
      db.prepare(
        `SELECT 1 FROM goal_kpis
         WHERE kpi_id = ? AND id <> ? AND archived_at IS NULL
           AND effective_from_year <= 2029
           AND (effective_to_year IS NULL OR effective_to_year >= 2025)
         LIMIT 1`,
      ).get(Number(row.kpi_id), Number(row.id))
    ) {
      continue;
    }
    db.prepare(
      `UPDATE goal_kpis
       SET goal_id = ?, display_order = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(Number(row.target_goal_id), repair.newDisplayOrder, Number(row.id));
    recordStrategicAuditEvent({
      entity_type: "goal_membership",
      entity_id: Number(row.id),
      event_type: "update",
      entity_display_name: `${String(row.kpi_name)} membership`,
      parent_priority_name: String(row.priority_name),
      parent_goal_name: String(row.target_goal_name),
      previous_value: {
        goal_id: Number(row.goal_id),
        goal_slug: repair.oldGoalSlug,
        display_order: repair.oldDisplayOrder,
      },
      new_value: {
        goal_id: Number(row.target_goal_id),
        goal_slug: repair.newGoalSlug,
        display_order: repair.newDisplayOrder,
      },
      source_reference: SOURCE_REFERENCE,
    });
    repaired += 1;
  }
  return repaired;
}

interface MeasurementMetadataRepair {
  kpiSlug: string;
  oldUnit: string;
  newUnit: string;
  oldPrecision: number;
  newPrecision: number;
  oldQuestion?: string;
  newQuestion?: string;
}

const MEASUREMENT_METADATA_REPAIRS: MeasurementMetadataRepair[] = [
  {
    kpiSlug: "justice-ed-states-represented",
    oldUnit: "states",
    newUnit: "%",
    oldPrecision: 1,
    newPrecision: 1,
    oldQuestion: "Finalize the target number or percentage of states represented.",
    newQuestion: "Finalize the target percentage of states represented.",
  },
  {
    kpiSlug: "multi-year-grants-pledges-value",
    oldUnit: "USD",
    newUnit: "USD",
    oldPrecision: 1,
    newPrecision: 2,
  },
  {
    kpiSlug: "revenue-by-stream",
    oldUnit: "%",
    newUnit: "USD",
    oldPrecision: 1,
    newPrecision: 2,
  },
];

/** Implements the repair canonical measurement metadata operation. */
function repairCanonicalMeasurementMetadata(): number {
  const db = getDb();
  let repaired = 0;
  for (const repair of MEASUREMENT_METADATA_REPAIRS) {
    const row = db.prepare(
      `SELECT config.*, kpi.name AS kpi_name, priority.name AS priority_name,
              goal.name AS goal_name
       FROM kpi_measurement_configs config
       JOIN kpis kpi ON kpi.id = config.kpi_id
       JOIN categories priority ON priority.id = kpi.category_id
       LEFT JOIN goal_kpis membership
         ON membership.kpi_id = kpi.id AND membership.archived_at IS NULL
        AND membership.effective_from_year <= 2025
        AND (membership.effective_to_year IS NULL OR membership.effective_to_year >= 2025)
       LEFT JOIN strategic_goals goal ON goal.id = membership.goal_id
       WHERE kpi.slug = ? AND config.effective_from_year = 2025`,
    ).get(repair.kpiSlug) as Record<string, unknown> | undefined;
    if (
      !row ||
      row.unit !== repair.oldUnit ||
      row.calculation_precision !== repair.oldPrecision ||
      (repair.oldQuestion !== undefined && row.unresolved_question !== repair.oldQuestion) ||
      row.effective_to_year !== 2029 ||
      row.source_reference !== SOURCE_REFERENCE ||
      row.archived_at !== null ||
      row.updated_by !== null
    ) {
      continue;
    }
    const nextQuestion = repair.newQuestion ?? (row.unresolved_question as string | null);
    db.prepare(
      `UPDATE kpi_measurement_configs
       SET unit = ?, calculation_precision = ?, unresolved_question = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(repair.newUnit, repair.newPrecision, nextQuestion, Number(row.id));
    recordStrategicAuditEvent({
      entity_type: "measurement_config",
      entity_id: Number(row.id),
      event_type: "update",
      entity_display_name: `${String(row.kpi_name)} measurement configuration`,
      parent_priority_name: row.priority_name == null ? null : String(row.priority_name),
      parent_goal_name: row.goal_name == null ? null : String(row.goal_name),
      previous_value: {
        unit: repair.oldUnit,
        calculation_precision: repair.oldPrecision,
        unresolved_question: row.unresolved_question as string | null,
      },
      new_value: {
        unit: repair.newUnit,
        calculation_precision: repair.newPrecision,
        unresolved_question: nextQuestion,
      },
      source_reference: SOURCE_REFERENCE,
    });
    repaired += 1;
  }
  return repaired;
}

/** Implements the repair canonical preservation target operation. */
function repairCanonicalPreservationTarget(): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT config.id AS config_id, config.configuration_status AS config_status,
            config.unresolved_question AS config_question,
            target.id AS target_id, target.configuration_status AS target_status,
            target.target_value, target.structured_target_json,
            target.target_description, target.source_reference AS target_source_reference,
            target.external_target_year, target.reporting_year,
            kpi.name AS kpi_name, priority.name AS priority_name, goal.name AS goal_name
     FROM kpis kpi
     JOIN kpi_measurement_configs config ON config.kpi_id = kpi.id
     JOIN kpi_targets target ON target.kpi_id = kpi.id
     JOIN categories priority ON priority.id = kpi.category_id
     LEFT JOIN goal_kpis membership
       ON membership.kpi_id = kpi.id AND membership.archived_at IS NULL
      AND membership.effective_from_year <= 2025
      AND (membership.effective_to_year IS NULL OR membership.effective_to_year >= 2025)
     LEFT JOIN strategic_goals goal ON goal.id = membership.goal_id
     WHERE kpi.slug = 'preservation-awards-recognitions'
       AND config.effective_from_year = 2025 AND config.effective_to_year = 2029
       AND config.measurement_type = 'milestone' AND config.source_reference = ?
       AND config.reporting_frequency = 'cumulative'
       AND config.aggregation_method = 'none' AND config.calculation_precision = 1
       AND config.archived_at IS NULL AND config.updated_by IS NULL
       AND target.target_scope = 'full_plan' AND target.target_year = 2029
       AND target.archived_at IS NULL AND target.updated_by IS NULL`,
  ).get(SOURCE_REFERENCE) as Record<string, unknown> | undefined;
  if (
    !row ||
    row.config_status !== "ready" ||
    row.config_question !== null ||
    row.target_status !== "ready" ||
    row.target_value !== null ||
    row.structured_target_json !== null ||
    row.target_description !== "Receive preservation recognition by 2029." ||
    row.target_source_reference !== SOURCE_REFERENCE ||
    row.external_target_year !== 0 ||
    row.reporting_year !== null
  ) {
    return 0;
  }
  const question =
    "Finalize a calculable recognition target while retaining the 2029 intent.";
  db.prepare(
    `UPDATE kpi_measurement_configs
     SET configuration_status = 'needs_target', unresolved_question = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(question, Number(row.config_id));
  db.prepare(
    `UPDATE kpi_targets
     SET configuration_status = 'needs_target', updated_at = datetime('now')
     WHERE id = ?`,
  ).run(Number(row.target_id));
  recordStrategicAuditEvent({
    entity_type: "measurement_config",
    entity_id: Number(row.config_id),
    event_type: "update",
    entity_display_name: `${String(row.kpi_name)} measurement configuration`,
    parent_priority_name: String(row.priority_name),
    parent_goal_name: row.goal_name == null ? null : String(row.goal_name),
    previous_value: { configuration_status: "ready", unresolved_question: null },
    new_value: { configuration_status: "needs_target", unresolved_question: question },
    source_reference: SOURCE_REFERENCE,
  });
  recordStrategicAuditEvent({
    entity_type: "target",
    entity_id: Number(row.target_id),
    event_type: "update",
    entity_display_name: `${String(row.kpi_name)} full-plan target`,
    parent_priority_name: String(row.priority_name),
    parent_goal_name: row.goal_name == null ? null : String(row.goal_name),
    previous_value: { configuration_status: "ready", target_value: null },
    new_value: { configuration_status: "needs_target", target_value: null },
    source_reference: SOURCE_REFERENCE,
  });
  return 1;
}

/** Implements the repair legacy government support ratio operation. */
function repairLegacyGovernmentSupportRatio(): GovernmentSupportRatioRepair {
  const db = getDb();
  const configs = db.prepare(
    `SELECT config.*, kpi.name AS kpi_name,
            kpi.archived_at AS kpi_archived_at,
            kpi.is_active AS kpi_is_active,
            priority.name AS priority_name,
            priority.archived_at AS priority_archived_at,
            goal.name AS goal_name,
            goal.archived_at AS goal_archived_at,
            membership.id AS membership_id,
            membership.archived_at AS membership_archived_at
     FROM kpi_measurement_configs config
     JOIN kpis kpi ON kpi.id = config.kpi_id
     JOIN categories priority ON priority.id = kpi.category_id
     LEFT JOIN goal_kpis membership
       ON membership.kpi_id = kpi.id
      AND membership.effective_from_year <= 2025
      AND (membership.effective_to_year IS NULL OR membership.effective_to_year >= 2025)
     LEFT JOIN strategic_goals goal ON goal.id = membership.goal_id
     WHERE kpi.slug = 'government-support-percentage'
     ORDER BY config.effective_from_year, config.id`,
  ).all() as GovernmentConfigRow[];

  if (configs.length !== 1) return "not_applicable";
  const config = configs[0]!;
  const components = db.prepare(
    "SELECT * FROM kpi_components WHERE configuration_id = ? ORDER BY display_order, id",
  ).all(config.id) as ComponentRow[];

  if (isCurrentGovernmentRatio(config, components)) return "already_current";
  if (!isExactLegacyGovernmentSignature(config, components)) {
    return "not_applicable";
  }
  if (hasFirstClassGovernmentData(config, components)) {
    return "not_applicable";
  }

  const oldConfig = {
    aggregation_method: "sum",
    unresolved_question: LEGACY_QUESTION,
  };
  db.prepare(
    `UPDATE kpi_measurement_configs
     SET aggregation_method = 'ratio', unresolved_question = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(RATIO_QUESTION, config.id);
  recordStrategicAuditEvent({
    entity_type: "measurement_config",
    entity_id: config.id,
    event_type: "update",
    entity_display_name: `${config.kpi_name} measurement configuration`,
    parent_priority_name: config.priority_name,
    parent_goal_name: config.goal_name,
    previous_value: oldConfig,
    new_value: {
      aggregation_method: "ratio",
      unresolved_question: RATIO_QUESTION,
    },
    source_reference: SOURCE_REFERENCE,
  });

  for (const component of components) {
    db.prepare(
      `UPDATE kpi_components
       SET aggregation_role = 'numerator', unresolved_question = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
    ).run(RATIO_QUESTION, component.id);
    recordStrategicAuditEvent({
      entity_type: "component",
      entity_id: component.id,
      event_type: "update",
      entity_display_name: String(component.label),
      parent_priority_name: config.priority_name,
      parent_goal_name: config.goal_name,
      previous_value: {
        aggregation_role: "value",
        unresolved_question: LEGACY_QUESTION,
      },
      new_value: {
        aggregation_role: "numerator",
        unresolved_question: RATIO_QUESTION,
      },
      source_reference: SOURCE_REFERENCE,
    });
  }

  const inserted = db.prepare(
    `INSERT INTO kpi_components (
       kpi_id, configuration_id, slug, label, measurement_type, unit,
       aggregation_role, weight, display_order, configuration_status,
       unresolved_question, created_by, updated_by
     ) VALUES (?, ?, 'contributed-revenue', 'Contributed revenue', 'currency',
       'USD', 'denominator', 1, 2, 'needs_target', ?, NULL, NULL)`,
  ).run(config.kpi_id, config.id, RATIO_QUESTION);
  const componentId = Number(inserted.lastInsertRowid);
  recordStrategicAuditEvent({
    entity_type: "component",
    entity_id: componentId,
    event_type: "create",
    entity_display_name: "Contributed revenue",
    parent_priority_name: config.priority_name,
    parent_goal_name: config.goal_name,
    previous_value: null,
    new_value: {
      configuration_id: config.id,
      kpi_id: config.kpi_id,
      slug: "contributed-revenue",
      label: "Contributed revenue",
      measurement_type: "currency",
      unit: "USD",
      aggregation_role: "denominator",
      weight: 1,
      display_order: 2,
      configuration_status: "needs_target",
      unresolved_question: RATIO_QUESTION,
    },
    source_reference: SOURCE_REFERENCE,
  });

  return "repaired";
}

/** Determines whether is current government ratio. */
function isCurrentGovernmentRatio(
  config: GovernmentConfigRow,
  components: ComponentRow[],
): boolean {
  if (config.aggregation_method !== "ratio" || components.length !== 3) {
    return false;
  }
  const roles = new Map(
    components.map((component) => [component.slug, component.aggregation_role]),
  );
  return roles.get("city-support") === "numerator" &&
    roles.get("state-support") === "numerator" &&
    roles.get("contributed-revenue") === "denominator";
}

/** Determines whether is exact legacy government signature. */
function isExactLegacyGovernmentSignature(
  config: GovernmentConfigRow,
  components: ComponentRow[],
): boolean {
  if (
    config.kpi_archived_at !== null ||
    config.kpi_is_active !== 1 ||
    config.priority_archived_at !== null ||
    config.goal_archived_at !== null ||
    config.membership_id === null ||
    config.membership_archived_at !== null ||
    config.effective_from_year !== 2025 ||
    config.effective_to_year !== 2029 ||
    config.measurement_type !== "multi_component" ||
    config.unit !== "%" ||
    config.numerator_label !== null ||
    config.denominator_label !== null ||
    config.fixed_denominator !== null ||
    config.baseline_value !== null ||
    config.reporting_frequency !== "annual" ||
    config.aggregation_method !== "sum" ||
    config.board_level_status !== "not_reported" ||
    config.calculation_precision !== 1 ||
    config.configuration_status !== "needs_target" ||
    config.unresolved_question !== LEGACY_QUESTION ||
    config.source_reference !== SOURCE_REFERENCE ||
    config.allow_score_over_max !== 0 ||
    config.archived_at !== null ||
    components.length !== 2
  ) {
    return false;
  }

  return matchesLegacyComponent(components[0], {
    slug: "city-support",
    label: "City government support",
    displayOrder: 0,
  }) && matchesLegacyComponent(components[1], {
    slug: "state-support",
    label: "State government support",
    displayOrder: 1,
  });
}

/** Implements the matches legacy component operation. */
function matchesLegacyComponent(
  component: ComponentRow | undefined,
  expected: { slug: string; label: string; displayOrder: number },
): boolean {
  return component !== undefined &&
    component.slug === expected.slug &&
    component.label === expected.label &&
    component.measurement_type === "currency" &&
    component.unit === "USD" &&
    component.numerator_label === null &&
    component.denominator_label === null &&
    component.fixed_denominator === null &&
    component.baseline_value === null &&
    component.previous_period_value === null &&
    component.aggregation_role === "value" &&
    component.weight === 1 &&
    component.display_order === expected.displayOrder &&
    component.configuration_status === "needs_target" &&
    component.unresolved_question === LEGACY_QUESTION &&
    component.archived_at === null;
}

/** Determines whether has first class government data. */
function hasFirstClassGovernmentData(
  config: GovernmentConfigRow,
  components: ComponentRow[],
): boolean {
  const db = getDb();
  const observation = db.prepare(
    "SELECT 1 FROM kpi_observations WHERE configuration_id = ? LIMIT 1",
  ).get(config.id);
  const distributionObservation = db.prepare(
    "SELECT 1 FROM distribution_observations WHERE configuration_id = ? LIMIT 1",
  ).get(config.id);
  const componentIds = components.map((component) => component.id);
  const componentEntry = componentIds.length === 0
    ? undefined
    : db.prepare(
        `SELECT 1 FROM kpi_component_entries
         WHERE component_id IN (${componentIds.map(() => "?").join(",")}) LIMIT 1`,
      ).get(...componentIds);
  const target = componentIds.length === 0
    ? db.prepare("SELECT 1 FROM kpi_targets WHERE kpi_id = ? LIMIT 1").get(config.kpi_id)
    : db.prepare(
        `SELECT 1 FROM kpi_targets
         WHERE kpi_id = ? OR component_id IN (${componentIds.map(() => "?").join(",")})
         LIMIT 1`,
      ).get(config.kpi_id, ...componentIds);
  const distributionBand = componentIds.length === 0
    ? db.prepare(
        "SELECT 1 FROM distribution_bands WHERE kpi_id = ? LIMIT 1",
      ).get(config.kpi_id)
    : db.prepare(
        `SELECT 1 FROM distribution_bands
         WHERE kpi_id = ? OR component_id IN (${componentIds.map(() => "?").join(",")})
         LIMIT 1`,
      ).get(config.kpi_id, ...componentIds);
  return observation !== undefined ||
    distributionObservation !== undefined ||
    componentEntry !== undefined ||
    target !== undefined ||
    distributionBand !== undefined;
}
