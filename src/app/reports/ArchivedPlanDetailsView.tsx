import { Badge, Card, Table } from "@/components/ui";
import type { BoardReportPageData } from "@/features/reporting/types";

/** Presents the complete read-only hierarchy, Targets, and results for one era. */
export function ArchivedPlanDetailsView({
  data,
}: {
  data: BoardReportPageData;
}) {
  return (
    <section aria-labelledby="archived-plan-details-heading">
      <div className="mb-6">
        <h2
          id="archived-plan-details-heading"
          className="text-xl font-semibold text-ink-950"
        >
          Plan details
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink-600">
          Read-only Priorities, Goals, Measures, Targets, and recorded results
          reconstructed from this Strategic Plan’s preserved definitions.
        </p>
      </div>
      <div className="space-y-6">
        {data.report.priorities.map((priority) => (
          <Card key={priority.id} as="article" className="p-5">
            <h3 className="text-lg font-semibold text-ink-950">
              {priority.name}
            </h3>
            <div className="mt-5 space-y-6">
              {priority.goals.map((goal) => (
                <section key={goal.id} aria-labelledby={`archived-goal-${goal.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4
                      id={`archived-goal-${goal.id}`}
                      className="font-semibold text-ink-900"
                    >
                      {goal.name}
                    </h4>
                    <Badge>{goal.completionStatus.replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="mt-3 rounded-lg border border-ink-200">
                    <Table minWidth="760px">
                      <thead>
                        <tr>
                          <th scope="col">Measure</th>
                          <th scope="col">Recorded result</th>
                          <th scope="col">Annual Target</th>
                          <th scope="col">Full-Plan Target</th>
                          <th scope="col">Definition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goal.kpis.map((measure) => (
                          <tr key={measure.id}>
                            <th scope="row">
                              <span className="font-semibold text-ink-900">
                                {measure.name}
                              </span>
                              <span className="mt-1 block text-xs font-normal text-ink-500">
                                {measure.reportingFrequency.replaceAll("_", " ")}
                                {measure.unit ? ` · ${measure.unit}` : ""}
                              </span>
                            </th>
                            <td>{measure.result.displayValue || "Not reported"}</td>
                            <td>
                              {measure.annualProgress?.hasTarget
                                ? measure.annualProgress.targetDisplayText
                                : "No Annual Target"}
                            </td>
                            <td>
                              {measure.fullPlanProgress?.hasTarget
                                ? measure.fullPlanProgress.targetDisplayText
                                : "No Full-Plan Target"}
                            </td>
                            <td>
                              {measure.configurationStatus.replaceAll("_", " ")}
                              {measure.components.length > 0 ? (
                                <span className="mt-1 block text-xs text-ink-500">
                                  Inputs:{" "}
                                  {measure.components
                                    .map((component) => component.label)
                                    .join(", ")}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </section>
              ))}
            </div>
          </Card>
        ))}
        {data.report.priorities.length === 0 ? (
          <Card variant="quiet" className="p-5 text-sm text-ink-600">
            No reportable Priority, Goal, or Measure was preserved for this
            reporting period.
          </Card>
        ) : null}
      </div>
    </section>
  );
}
