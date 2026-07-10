import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import type { ConfigurationGapPageData } from "@/components/configuration-gap-model";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import {
  getConfigurationGapCounts,
  listConfigurationGaps,
} from "@/features/strategy/server";
import { ConfigurationGapsClient } from "./ConfigurationGapsClient";

export const dynamic = "force-dynamic";

function unavailableData(reportingYear: number): ConfigurationGapPageData {
  return {
    rows: [],
    counts: {
      readyKpis: 0,
      activeKpis: 0,
      kpisNeedingTargets: 0,
      kpisNeedingDefinitions: 0,
      goalsExcludedFromCompletion: 0,
    },
    reportingYear,
    error:
      "Configuration-gap reporting could not be loaded. No readiness conclusion has been made; try again after the strategic configuration is available.",
  };
}

export default async function ConfigurationGapsPage() {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const reportingYear = Math.max(
    2025,
    Math.min(new Date().getFullYear(), 2029),
  );
  let data: ConfigurationGapPageData;

  try {
    const rows = listConfigurationGaps({ year: reportingYear });
    const counts = getConfigurationGapCounts({ year: reportingYear });
    data = {
      rows: rows.map((row) => ({
        id: `${row.goal_id}:${row.kpi.id}`,
        kpiId: row.kpi.id,
        kpiName: row.kpi.name,
        kpiSlug: row.kpi.slug,
        priorityId: row.priority_id,
        priorityName: row.priority_name,
        goalId: row.goal_id,
        goalName: row.goal_name,
        configurationStatus: row.configuration.configuration_status,
        reportingFrequency: row.configuration.reporting_frequency,
        targetYears: row.target_years,
        unresolvedQuestion: row.configuration.unresolved_question,
        owner: row.configuration.owner,
        dueDate: row.configuration.due_date,
        lastReviewedDate: row.configuration.last_reviewed_date,
        missingMeasurementType: row.missing_measurement_type,
        missingFormula: row.missing_formula,
        missingComponents: row.missing_components,
        missingTarget: row.missing_target,
        missingDenominator: row.missing_denominator,
        missingTargetYear: row.missing_target_year,
        editorHref: `/admin/kpis/${row.kpi.id}`,
      })),
      counts: {
        readyKpis: counts.ready_kpis,
        activeKpis: counts.active_kpis,
        kpisNeedingTargets: counts.kpis_needing_targets,
        kpisNeedingDefinitions: counts.kpis_needing_definitions,
        goalsExcludedFromCompletion:
          counts.goals_excluded_from_completion,
      },
      reportingYear,
      error: null,
    };
  } catch (error) {
    console.error("[configuration-gaps] Failed to build read model", error);
    data = unavailableData(reportingYear);
  }

  return (
    <AppShell user={user}>
      <ConfigurationGapsClient data={data} />
    </AppShell>
  );
}
