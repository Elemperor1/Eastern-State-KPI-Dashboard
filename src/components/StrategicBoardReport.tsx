"use client";

import type {
  BoardComponentViewModel,
  DemographicDistributionViewModel,
  GoalCompletionSummaryViewModel,
  RevenueBreakdownViewModel,
  StrategicBoardGoalViewModel,
  StrategicBoardKpiViewModel,
  StrategicBoardPriorityViewModel,
  StrategicBoardReportViewModel,
  TargetProgressViewModel,
} from "@/features/reporting/strategic-board-report";
import { cn } from "@/lib/utils";
import {
  Badge,
  Card,
  Chip,
  EmptyState,
  PrintReportFooter,
  PrintReportHeader,
  Progress,
  Table,
  type BadgeProps,
} from "@/components/ui";
import {
  boardReportProgressAriaText,
  countStrategicBoardReportStructure,
  formatBoardReportCurrency,
  formatBoardReportMetricValue,
  formatBoardReportNumber,
  formatBoardReportPercentage,
  formatBoardReportTarget,
  formatBoardReportToken,
} from "./strategic-board-report-presentation";

export interface StrategicBoardReportProps {
  report: StrategicBoardReportViewModel;
  id?: string;
  className?: string;
}

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

function statusVariant(status: string): BadgeVariant {
  if (["active", "complete", "exceeded", "ok", "on_track"].includes(status)) {
    return "success";
  }
  if (["ready", "in_progress"].includes(status)) return "info";
  if (["missing", "needs_target", "target_not_finalized"].includes(status)) {
    return "incomplete";
  }
  if (["at_risk", "needs_definition"].includes(status)) return "warning";
  if (["invalid", "off_track"].includes(status)) {
    return "error";
  }
  return "default";
}

function StatusBadge({ label, value }: { label: string; value: string }) {
  const display = formatBoardReportToken(value);
  return (
    <Badge variant={statusVariant(value)} label={label} aria-label={`${label}: ${display}`}>
      {display}
    </Badge>
  );
}

function SummaryMetric({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string | number;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-words font-semibold tabular-nums text-ink-900",
          compact ? "text-sm leading-5" : "text-2xl",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ReasonList({
  reasons,
  emptyLabel,
  ariaLabel,
}: {
  reasons: string[];
  emptyLabel: string;
  ariaLabel: string;
}) {
  if (reasons.length === 0) {
    return <p className="text-sm leading-6 text-ink-500">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-1.5 text-sm leading-6 text-ink-700" aria-label={ariaLabel}>
      {reasons.map((reason, index) => (
        <li key={`${reason}-${index}`} className="break-words">
          <span aria-hidden>•</span> {reason}
        </li>
      ))}
    </ul>
  );
}

function CompletionSummary({
  summary,
  label,
  showExcludedReasons = true,
}: {
  summary: GoalCompletionSummaryViewModel;
  label: string;
  showExcludedReasons?: boolean;
}) {
  return (
    <div className="mt-5 border-t border-ink-100 pt-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Goal completion
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">
            {formatBoardReportPercentage(summary.completionPercentage)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-ink-900">{summary.countLabel}</p>
          <p className="mt-1 text-xs text-ink-500">
            {summary.excludedGoalsCount} not counted
          </p>
        </div>
      </div>
      {summary.completionPercentage !== null ? (
        <Progress
          value={summary.completionPercentage}
          className="mt-3 h-2.5"
          aria-label={`${label} goal completion`}
          aria-valuetext={formatBoardReportPercentage(
            summary.completionPercentage,
          )}
        />
      ) : (
        <div
          className="mt-3 h-2.5 rounded-full bg-ink-100"
          role="status"
          aria-label={`${label} goal completion is not reported`}
        />
      )}
      {showExcludedReasons && summary.excludedGoalsCount > 0 ? (
        <div className="mt-4 rounded-lg bg-accent-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-700">
            Goals not counted
          </p>
          <ReasonList
            reasons={summary.excludedGoalReasons}
            emptyLabel="Detailed exclusion reasons were not supplied."
            ariaLabel={`${label} goals not counted`}
          />
        </div>
      ) : null}
    </div>
  );
}

export function StrategicBoardReport({
  report,
  id = "strategic-board-report",
  className,
}: StrategicBoardReportProps) {
  const counts = countStrategicBoardReportStructure(report);
  const selectedYear = report.selectedYear?.toString() ?? "Not specified";

  return (
    <div
      id={id}
      data-strategic-board-report
    >
      <article
        className={cn("space-y-8 bg-white", className)}
        aria-label={`${report.organizationName} strategic board report`}
        data-raster-export-text
      >
        <PrintReportHeader
          className="!block"
          eyebrow="Strategic plan · Board report"
          title={report.organizationName}
          subtitle="Results, targets, progress, and items that need attention."
          filters={[
            { label: "Reporting year", value: selectedYear },
            { label: "Reporting period", value: report.reportingPeriod },
            { label: "Priorities", value: String(counts.priorities) },
            { label: "Goals", value: String(counts.goals) },
            { label: "Measures", value: String(counts.kpis) },
          ]}
        />

      <Card
        as="section"
        variant="elevated"
        className="break-inside-avoid p-5 lg:p-6"
        aria-labelledby={`${id}-executive-summary`}
        data-pdf-keep-together
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <p className="section-eyebrow">Organization-wide status</p>
            <h2
              id={`${id}-executive-summary`}
              className="break-words text-2xl font-semibold tracking-[-0.02em] text-ink-900"
            >
              Executive summary
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink-600">
              Goal progress follows the rules set in Setup. Goals without enough
              information remain visible and are not counted as failed.
            </p>
          </div>
          <Badge
            variant={report.unresolvedReasons.length > 0 ? "warning" : "success"}
            label="Reporting status"
          >
            {report.unresolvedReasons.length > 0
              ? `${report.unresolvedReasons.length} need attention`
              : "Nothing needs attention"}
          </Badge>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-5">
          <SummaryMetric label="Strategic priorities" value={counts.priorities} />
          <SummaryMetric label="Strategic goals" value={counts.goals} />
          <SummaryMetric label="Measures" value={counts.kpis} />
          <SummaryMetric label="Reporting year" value={selectedYear} />
          <SummaryMetric label="Reporting period" value={report.reportingPeriod} />
        </dl>
        <CompletionSummary
          summary={report.organizationGoalCompletion}
          label={report.organizationName}
          showExcludedReasons={false}
        />

        <div className="mt-5 border-t border-ink-100 pt-5">
          <h3 className="text-base font-semibold text-ink-900">
            Reporting completeness
          </h3>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            {report.unresolvedReasons.length > 0
              ? `${report.unresolvedReasons.length} items need attention. Detailed reasons are shown with each affected goal and measure below.`
              : "All reporting requirements represented in this report are complete."}
          </p>
        </div>
      </Card>

      {report.priorities.length === 0 ? (
        <Card className="break-inside-avoid p-10" data-pdf-keep-together>
          <EmptyState
            title="No strategic priorities available"
            description="No priorities are available for the selected year."
          />
        </Card>
      ) : (
        report.priorities.map((priority, priorityIndex) => (
          <PrioritySection
            key={priority.id}
            priority={priority}
            priorityIndex={priorityIndex}
            reportId={id}
          />
        ))
      )}

        <PrintReportFooter className="!block" />
      </article>
    </div>
  );
}

function PrioritySection({
  priority,
  priorityIndex,
  reportId,
}: {
  priority: StrategicBoardPriorityViewModel;
  priorityIndex: number;
  reportId: string;
}) {
  const headingId = `${reportId}-priority-${priorityIndex}`;
  return (
    <section className="space-y-5" aria-labelledby={headingId}>
      <Card
        as="section"
        className="break-inside-avoid border-t-4 border-brand-600 p-5 lg:p-6"
        data-pdf-keep-together
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="section-eyebrow">Strategic priority {priorityIndex + 1}</p>
            <h2 id={headingId} className="break-words text-2xl font-semibold text-ink-900">
              {priority.name}
            </h2>
          </div>
          <span className="text-sm font-medium tabular-nums text-ink-600">
            {priority.goals.length} goal{priority.goals.length === 1 ? "" : "s"}
          </span>
        </div>
        <CompletionSummary summary={priority.goalCompletion} label={priority.name} />
      </Card>

      {priority.goals.length === 0 ? (
        <Card className="break-inside-avoid p-8" data-pdf-keep-together>
          <EmptyState
            title="No goals in this priority"
            description="No goals are available for this priority."
          />
        </Card>
      ) : (
        priority.goals.map((goal, goalIndex) => (
          <GoalSection
            key={goal.id}
            goal={goal}
            goalIndex={goalIndex}
            priorityIndex={priorityIndex}
            reportId={reportId}
          />
        ))
      )}
    </section>
  );
}

function GoalSection({
  goal,
  goalIndex,
  priorityIndex,
  reportId,
}: {
  goal: StrategicBoardGoalViewModel;
  goalIndex: number;
  priorityIndex: number;
  reportId: string;
}) {
  const headingId = `${reportId}-priority-${priorityIndex}-goal-${goalIndex}`;
  return (
    <section className="space-y-4" aria-labelledby={headingId}>
      <Card
        as="section"
        variant="quiet"
        className="break-inside-avoid p-5 lg:p-6"
        data-pdf-keep-together
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <p className="section-eyebrow">Strategic goal {goalIndex + 1}</p>
            <h3 id={headingId} className="break-words text-xl font-semibold text-ink-900">
              {goal.name}
            </h3>
          </div>
          <StatusBadge label="Goal status" value={goal.completionStatus} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryMetric
            label="Actual completion"
            value={formatBoardReportPercentage(goal.actualCompletionPercentage)}
          />
          <SummaryMetric label="Completed measures" value={goal.completedKpisCount} />
          <SummaryMetric label="Included measures" value={goal.totalEligibleKpisCount} />
          <SummaryMetric label="Measures not counted" value={goal.excludedKpisCount} />
        </dl>
        {goal.excludedKpisCount > 0 || goal.excludedReasons.length > 0 ? (
          <div className="mt-5 border-t border-ink-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-700">
              Measures not counted
            </p>
            <ReasonList
              reasons={goal.excludedReasons}
              emptyLabel="No reason was supplied."
              ariaLabel={`${goal.name} measures not counted`}
            />
          </div>
        ) : null}
      </Card>

      {goal.kpis.length === 0 ? (
        <Card className="break-inside-avoid p-8" data-pdf-keep-together>
          <EmptyState
            title="No measures in this goal"
            description="This goal has no saved measure results for the selected period."
          />
        </Card>
      ) : (
        goal.kpis.map((kpi, kpiIndex) => (
          <KpiSection
            key={kpi.id}
            kpi={kpi}
            kpiIndex={kpiIndex}
            goalId={headingId}
          />
        ))
      )}
    </section>
  );
}

function KpiSection({
  kpi,
  kpiIndex,
  goalId,
}: {
  kpi: StrategicBoardKpiViewModel;
  kpiIndex: number;
  goalId: string;
}) {
  const headingId = `${goalId}-kpi-${kpiIndex}`;
  return (
    <section className="space-y-3" aria-labelledby={headingId} data-board-kpi={kpi.id}>
      <Card
        as="article"
        className="break-inside-avoid overflow-hidden p-5 lg:p-6"
        data-pdf-keep-together
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <p className="section-eyebrow">Measure {kpiIndex + 1}</p>
            <h4 id={headingId} className="break-words text-xl font-semibold text-ink-900">
              {kpi.name}
            </h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge label="Board" value={kpi.boardStatus} />
            <StatusBadge
              label="Setup"
              value={kpi.configurationStatus}
            />
            <StatusBadge label="Result" value={kpi.result.state} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Calculated result
            </p>
            <p className="mt-1 break-words text-3xl font-semibold leading-tight text-ink-900">
              {kpi.result.displayValue}
            </p>
            {kpi.result.formulaExplanation ? (
              <div className="mt-4 rounded-lg bg-ink-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                  How this was calculated
                </p>
                <p className="mt-1 break-words text-sm leading-6 text-ink-700">
                  {kpi.result.formulaExplanation}
                </p>
              </div>
            ) : null}
          </div>
          <dl className="grid min-w-0 grid-cols-2 gap-4">
            <SummaryMetric
              label="Measurement type"
              value={formatBoardReportToken(kpi.measurementType)}
              compact
            />
            <SummaryMetric
              label="Reporting frequency"
              value={formatBoardReportToken(kpi.reportingFrequency)}
              compact
            />
            <SummaryMetric label="Unit" value={kpi.unit ?? "Not specified"} compact />
            <SummaryMetric
              label="Respondents"
              value={formatBoardReportNumber(kpi.result.respondentCount)}
              compact
            />
            <SummaryMetric
              label="Amount measured"
              value={formatBoardReportNumber(kpi.result.numerator)}
              compact
            />
            <SummaryMetric
              label="Total amount"
              value={formatBoardReportNumber(kpi.result.denominator)}
              compact
            />
          </dl>
        </div>

        {kpi.unresolvedReasons.length > 0 ? (
          <div className="mt-5 rounded-lg bg-accent-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-700">
              What needs attention
            </p>
            <ReasonList
              reasons={kpi.unresolvedReasons}
              emptyLabel="Nothing needs attention for this measure."
              ariaLabel={`${kpi.name} items that need attention`}
            />
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TargetProgressCard
          label="Annual target and pacing"
          progress={kpi.annualProgress}
          unit={kpi.unit}
        />
        <TargetProgressCard
          label="Full-plan target and progress"
          progress={kpi.fullPlanProgress}
          unit={kpi.unit}
        />
      </div>

      {kpi.components.length > 0 ? (
        <ComponentTable kpiName={kpi.name} components={kpi.components} />
      ) : null}
      {kpi.demographics ? (
        <DemographicTable kpiName={kpi.name} demographics={kpi.demographics} />
      ) : null}
      {kpi.revenueBreakdown ? (
        <RevenueTable kpiName={kpi.name} revenue={kpi.revenueBreakdown} />
      ) : null}
    </section>
  );
}

function TargetProgressCard({
  label,
  progress,
  unit,
}: {
  label: string;
  progress: TargetProgressViewModel | null;
  unit: string | null;
}) {
  return (
    <Card
      as="section"
      className="break-inside-avoid p-4 lg:p-5"
      data-pdf-keep-together
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h5 className="text-base font-semibold text-ink-900">{label}</h5>
        {progress ? (
          <StatusBadge label="Target status" value={progress.status} />
        ) : (
          <Badge variant="incomplete" label="Target status">No target record</Badge>
        )}
      </div>
      {progress ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <SummaryMetric
              label="Actual"
              value={formatBoardReportMetricValue(progress.actualValue, unit)}
            />
            <SummaryMetric
              label="Target"
              value={formatBoardReportTarget(progress, unit)}
            />
            <SummaryMetric
              label="Target year"
              value={progress.targetYear ?? "Not specified"}
            />
            <SummaryMetric
              label="Actual progress"
              value={formatBoardReportPercentage(
                progress.actualProgressPercentage,
              )}
            />
            {progress.pacingStatus !== null ? (
              <>
                <SummaryMetric
                  label="Year-to-date pacing target"
                  value={formatBoardReportMetricValue(
                    progress.pacingTarget,
                    unit,
                  )}
                />
                <SummaryMetric
                  label="Annual pacing status"
                  value={formatBoardReportToken(progress.pacingStatus)}
                />
              </>
            ) : null}
          </dl>
          {progress.displayProgressPercentage !== null ? (
            <Progress
              value={progress.displayProgressPercentage}
              className="mt-4 h-2.5"
              aria-label={label}
              aria-valuetext={boardReportProgressAriaText(progress)}
            />
          ) : (
            <div
              className="mt-4 h-2.5 rounded-full bg-ink-100"
              role="status"
              aria-label={`${label}: progress not calculated`}
            />
          )}
          <div className="mt-4 rounded-lg bg-ink-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
              Target description
            </p>
            <p className="mt-1 break-words text-sm font-semibold leading-6 text-ink-900">
              {progress.targetDisplayText}
            </p>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm leading-6 text-ink-500">
          No annual or full-plan target record was supplied for this scope.
        </p>
      )}
    </Card>
  );
}

function ComponentTable({
  kpiName,
  components,
}: {
  kpiName: string;
  components: BoardComponentViewModel[];
}) {
  return (
    <Card as="section" className="overflow-hidden" data-pdf-keep-together>
      <div className="border-b border-ink-100 p-4 lg:p-5">
        <h5 className="text-base font-semibold text-ink-900">Component results</h5>
        <p className="mt-1 text-xs text-ink-500">
          Components remain separate; no unrelated values are averaged here.
        </p>
      </div>
      <Table className="table-fixed">
        <caption className="sr-only">Component results for {kpiName}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[20%] text-left">Component</th>
            <th scope="col" className="w-[16%] text-left">Result</th>
            <th scope="col" className="w-[14%] text-left">Measurement</th>
            <th scope="col" className="w-[20%] text-left">Target</th>
            <th scope="col" className="w-[12%] text-left">Status</th>
            <th scope="col" className="w-[18%] text-left">Needs attention</th>
          </tr>
        </thead>
        <tbody>
          {components.map((component) => (
            <tr key={component.id} className="break-inside-avoid align-top" data-pdf-keep-together>
              <td className="break-words font-semibold text-ink-900">{component.label}</td>
              <td className="break-words">
                <p>{component.result.displayValue}</p>
                <div className="mt-2">
                  <StatusBadge label="Result" value={component.result.state} />
                </div>
                {component.result.formulaExplanation ? (
                  <p className="mt-1 text-xs leading-5 text-ink-500">
                    {component.result.formulaExplanation}
                  </p>
                ) : null}
              </td>
              <td className="break-words text-xs">
                {formatBoardReportToken(component.measurementType)}
                {component.unit ? <span className="mt-1 block text-ink-500">{component.unit}</span> : null}
              </td>
              <td className="break-words text-xs leading-5">
                {component.progress ? (
                  <>
                    <span className="font-semibold text-ink-900">
                      {formatBoardReportTarget(component.progress, component.unit)}
                    </span>
                    <span className="mt-1 block text-ink-500">
                      {component.progress.targetDisplayText}
                    </span>
                    <span className="mt-1 block text-ink-500">
                      Actual {formatBoardReportMetricValue(
                        component.progress.actualValue,
                        component.unit,
                      )} · {formatBoardReportPercentage(
                        component.progress.actualProgressPercentage,
                      )} progress · Target year {component.progress.targetYear ?? "not specified"}
                    </span>
                    <span className="mt-2 block">
                      <StatusBadge label="Target" value={component.progress.status} />
                    </span>
                  </>
                ) : (
                  "No target record"
                )}
              </td>
              <td>
                <StatusBadge label="Setup" value={component.configurationStatus} />
              </td>
              <td className="break-words text-xs leading-5">
                {component.unresolvedReasons.length > 0
                  ? component.unresolvedReasons.join("; ")
                  : "None supplied"}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function DemographicTable({
  kpiName,
  demographics,
}: {
  kpiName: string;
  demographics: DemographicDistributionViewModel;
}) {
  return (
    <Card as="section" className="overflow-hidden" data-pdf-keep-together>
      <div className="border-b border-ink-100 p-4 lg:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h5 className="text-base font-semibold text-ink-900">Demographic distribution</h5>
            <p className="mt-1 text-xs text-ink-500">
              Respondent total: {formatBoardReportNumber(demographics.respondentTotal)}
            </p>
            {demographics.derivedNonWhitePercentage !== null ? (
              <p className="mt-1 text-xs font-semibold text-ink-700">
                Derived non-white respondent share: {formatBoardReportPercentage(demographics.derivedNonWhitePercentage)}
              </p>
            ) : null}
          </div>
          <Chip>
            {demographics.mutuallyExclusive
              ? "Mutually exclusive bands"
              : "Overlapping bands"}
          </Chip>
        </div>
        <div className="mt-3 rounded-lg bg-accent-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-700">
            Respondent population caveat
          </p>
          <p className="mt-1 break-words text-sm leading-6 text-ink-700">
            {demographics.populationCaveat ??
              "A population-representation caveat was not supplied."}
          </p>
          {!demographics.mutuallyExclusive ? (
            <p className="mt-1 text-sm leading-6 text-ink-700">
              Respondents may appear in more than one band; band counts should
              not be summed as unique people.
            </p>
          ) : null}
        </div>
        {demographics.bands.length > 0 ? (
          <ul
            className="mt-4 grid gap-3"
            aria-label={`${kpiName} demographic distribution chart`}
          >
            {demographics.bands.map((band) => (
              <li key={band.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-semibold text-ink-900">{band.label}</span>
                  <span className="tabular-nums text-ink-600">
                    {formatBoardReportPercentage(band.percentage)}
                  </span>
                </div>
                {band.percentage === null ? (
                  <div
                    className="h-2 rounded-full bg-ink-100"
                    role="status"
                    aria-label={`${band.label}: respondent share not reported`}
                  />
                ) : (
                  <Progress
                    value={band.percentage}
                    className="h-2"
                    aria-label={`${band.label} respondent share`}
                    aria-valuetext={`${band.label}: ${formatBoardReportPercentage(band.percentage)}`}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Table className="table-fixed">
        <caption className="sr-only">Demographic bands for {kpiName}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[45%] text-left">Band</th>
            <th scope="col" className="w-[20%] text-left">Responses</th>
            <th scope="col" className="w-[20%] text-left">Share</th>
            <th scope="col" className="w-[15%] text-left">Notes</th>
          </tr>
        </thead>
        <tbody>
          {demographics.bands.length > 0 ? (
            demographics.bands.map((band) => (
              <tr key={band.id} className="break-inside-avoid align-top" data-pdf-keep-together>
                <td className="break-words font-semibold text-ink-900">{band.label}</td>
                <td className="tabular-nums">{formatBoardReportNumber(band.count)}</td>
                <td className="tabular-nums">{formatBoardReportPercentage(band.percentage)}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {band.isUnknown ? <Chip>Unknown</Chip> : null}
                    {band.isDeclined ? <Chip>Declined</Chip> : null}
                    {band.derivedGroup ? <Chip>{formatBoardReportToken(band.derivedGroup)}</Chip> : null}
                    {!band.isUnknown && !band.isDeclined && !band.derivedGroup ? (
                      <span className="text-xs text-ink-400">—</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr className="break-inside-avoid" data-pdf-keep-together>
              <td colSpan={4} className="text-center text-sm text-ink-500">
                No demographic bands were supplied.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </Card>
  );
}

function RevenueTable({
  kpiName,
  revenue,
}: {
  kpiName: string;
  revenue: RevenueBreakdownViewModel;
}) {
  return (
    <Card as="section" className="overflow-hidden" data-pdf-keep-together>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-100 p-4 lg:p-5">
        <div>
          <h5 className="text-base font-semibold text-ink-900">Revenue streams</h5>
          <p className="mt-1 text-xs text-ink-500">
            Values and shares are presented as supplied by the report model.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500">
            Total revenue
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
            {formatBoardReportCurrency(revenue.totalRevenue)}
          </p>
        </div>
      </div>
      <Table className="table-fixed">
        <caption className="sr-only">Revenue streams for {kpiName}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-1/2 text-left">Revenue stream</th>
            <th scope="col" className="w-1/4 text-left">Value</th>
            <th scope="col" className="w-1/4 text-left">Share</th>
          </tr>
        </thead>
        <tbody>
          {revenue.streams.length > 0 ? (
            revenue.streams.map((stream) => (
              <tr key={stream.id} className="break-inside-avoid align-top" data-pdf-keep-together>
                <td className="break-words font-semibold text-ink-900">{stream.label}</td>
                <td className="tabular-nums">{formatBoardReportCurrency(stream.value)}</td>
                <td className="tabular-nums">
                  {formatBoardReportPercentage(stream.sharePercentage)}
                </td>
              </tr>
            ))
          ) : (
            <tr className="break-inside-avoid" data-pdf-keep-together>
              <td colSpan={3} className="text-center text-sm text-ink-500">
                No revenue streams were supplied.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </Card>
  );
}
