import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import type { StrategicGoalEditorRecord } from "@/components/strategic-goal-editor-model";
import { getCurrentUserReadOnly } from "@/features/auth/session";
import { STRATEGIC_PLAN_REPORTING_YEARS } from "@/features/strategy";
import { listStrategicGoals } from "@/features/strategy/server";
import { StrategicGoalsEditorClient } from "./StrategicGoalsEditorClient";

export const dynamic = "force-dynamic";

export default async function StrategicGoalsEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; goal?: string }>;
}) {
  const user = await getCurrentUserReadOnly();
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/setup-password");
  if (user.role !== "admin") redirect("/dashboard/overview");

  const resolvedSearchParams = await searchParams;
  const requestedYear = Number(resolvedSearchParams.year);
  const defaultYear = Math.max(2025, Math.min(new Date().getFullYear(), 2029));
  const reportingYear =
    STRATEGIC_PLAN_REPORTING_YEARS.find((year) => year === requestedYear) ??
    defaultYear;
  const goals = listStrategicGoals({
    year: reportingYear,
    includeArchived: true,
  });
  const initialGoals: StrategicGoalEditorRecord[] = goals.map((goal) => ({
    ...goal,
    members: goal.members.map((member) => ({
      id: member.id,
      name: member.kpi.name,
      role: member.role,
      weight: member.weight,
      displayOrder: member.display_order,
      effectiveFromYear: member.effective_from_year,
      effectiveToYear: member.effective_to_year,
      configurationStatus: member.configuration?.configuration_status ?? null,
    })),
  }));
  const requestedGoalId = Number(resolvedSearchParams.goal);
  const initialSelectedGoalId = initialGoals.some(
    (goal) => goal.id === requestedGoalId,
  )
    ? requestedGoalId
    : null;

  return (
    <AppShell user={user}>
      <StrategicGoalsEditorClient
        initialGoals={initialGoals}
        initialSelectedGoalId={initialSelectedGoalId}
        reportingYear={reportingYear}
      />
    </AppShell>
  );
}
