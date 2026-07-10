"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Ban,
  CheckCircle2,
  FileQuestion,
  Target,
} from "lucide-react";
import { ConfigurationGapTable } from "@/components/ConfigurationGapTable";
import {
  EMPTY_CONFIGURATION_GAP_FILTERS,
  UNASSIGNED_CONFIGURATION_GAP_OWNER,
  buildConfigurationGapFilterOptions,
  filterConfigurationGaps,
  getConfigurationGapStatusLabel,
  hasConfigurationGapFilters,
  parseOptionalInteger,
  type ConfigurationGapFilters,
  type ConfigurationGapPageData,
  type ConfigurationGapStatus,
} from "@/components/configuration-gap-model";
import {
  Badge,
  Button,
  Card,
  FilterToolbar,
  FormField,
  Input,
  PageHeader,
  Select,
  StatusBanner,
} from "@/components/ui";

function displayOptionLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (first) => first.toLocaleUpperCase());
}

export function ConfigurationGapsClient({
  data,
}: {
  data: ConfigurationGapPageData;
}) {
  const [filters, setFilters] = useState<ConfigurationGapFilters>(
    EMPTY_CONFIGURATION_GAP_FILTERS,
  );
  const options = useMemo(
    () => buildConfigurationGapFilterOptions(data.rows),
    [data.rows],
  );
  const filteredRows = useMemo(
    () => filterConfigurationGaps(data.rows, filters),
    [data.rows, filters],
  );
  const filtersAreActive = hasConfigurationGapFilters(filters);

  const summaries = [
    {
      label: "Ready KPIs",
      value: data.counts.readyKpis,
      detail: "Definition complete",
      icon: CheckCircle2,
    },
    {
      label: "Active KPIs",
      value: data.counts.activeKpis,
      detail: "Included in reporting",
      icon: Activity,
    },
    {
      label: "Need targets",
      value: data.counts.kpisNeedingTargets,
      detail: "Excluded until resolved",
      icon: Target,
    },
    {
      label: "Need definitions",
      value: data.counts.kpisNeedingDefinitions,
      detail: "Formula or inputs incomplete",
      icon: FileQuestion,
    },
    {
      label: "Excluded goals",
      value: data.counts.goalsExcludedFromCompletion,
      detail: "Not counted as incomplete",
      icon: Ban,
    },
  ];

  function updateFilter<K extends keyof ConfigurationGapFilters>(
    key: K,
    value: ConfigurationGapFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="page-content page-content-wide page-enter">
      <PageHeader
        eyebrow="Admin · Strategy"
        title="Configuration gaps"
        subtitle={`Review the unresolved definitions and targets that affect ${data.reportingYear} strategic-plan reporting. This surface is read-only.`}
        actions={<Badge variant="info">Read only</Badge>}
      />

      {data.error ? (
        <div role="alert">
          <StatusBanner variant="error">{data.error}</StatusBanner>
        </div>
      ) : null}

      <section aria-labelledby="configuration-gap-summary-title" className="mb-6">
        <h2 id="configuration-gap-summary-title" className="sr-only">
          Configuration readiness summary
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {summaries.map(({ label, value, detail, icon: Icon }) => (
            <Card key={label} as="article" className="p-4 lg:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
                  {label}
                </p>
                <Icon className="size-4 text-brand-700" aria-hidden />
              </div>
              <p className="text-3xl font-semibold tabular-nums text-ink-900">
                {data.error ? <span aria-label="Unavailable">—</span> : value}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-500">
                {data.error ? "Unavailable" : detail}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <Card as="section" className="mb-6 overflow-hidden" aria-labelledby="configuration-gap-filter-title">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4 lg:px-6">
          <div>
            <h2 id="configuration-gap-filter-title" className="text-base font-semibold text-ink-900">
              Filter gaps
            </h2>
            <p className="mt-1 text-xs text-ink-500">
              Narrow by plan structure, ownership, or reporting configuration.
            </p>
          </div>
          <p className="text-xs tabular-nums text-ink-500" aria-live="polite">
            Showing {filteredRows.length} of {data.rows.length}
          </p>
        </div>

        <FilterToolbar className="rounded-none bg-transparent px-5 pb-5 pt-0 shadow-none lg:px-6">
          <FormField label="Search" htmlFor="configuration-gap-query" className="w-full sm:min-w-64 sm:flex-1">
            <Input
              id="configuration-gap-query"
              type="search"
              value={filters.query}
              onChange={(event) => updateFilter("query", event.target.value)}
              placeholder="KPI, goal, owner, or gap"
            />
          </FormField>

          <FormField label="Strategic priority" htmlFor="configuration-gap-priority" className="w-full sm:w-52">
            <Select
              id="configuration-gap-priority"
              value={filters.priorityId ?? ""}
              onChange={(event) =>
                updateFilter("priorityId", parseOptionalInteger(event.target.value))
              }
            >
              <option value="">All priorities</option>
              {options.priorities.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Goal" htmlFor="configuration-gap-goal" className="w-full sm:w-52">
            <Select
              id="configuration-gap-goal"
              value={filters.goalId ?? ""}
              onChange={(event) =>
                updateFilter("goalId", parseOptionalInteger(event.target.value))
              }
            >
              <option value="">All goals</option>
              {options.goals.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Status" htmlFor="configuration-gap-status" className="w-full sm:w-44">
            <Select
              id="configuration-gap-status"
              value={filters.status ?? ""}
              onChange={(event) =>
                updateFilter(
                  "status",
                  (event.target.value || null) as ConfigurationGapStatus | null,
                )
              }
            >
              <option value="">All statuses</option>
              {options.statuses.map((status) => (
                <option key={status} value={status}>
                  {getConfigurationGapStatusLabel(status)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Owner" htmlFor="configuration-gap-owner" className="w-full sm:w-44">
            <Select
              id="configuration-gap-owner"
              value={filters.owner ?? ""}
              onChange={(event) => updateFilter("owner", event.target.value || null)}
            >
              <option value="">All owners</option>
              {options.hasUnassignedOwner ? (
                <option value={UNASSIGNED_CONFIGURATION_GAP_OWNER}>Unassigned</option>
              ) : null}
              {options.owners.map((owner) => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Target year" htmlFor="configuration-gap-target-year" className="w-full sm:w-40">
            <Select
              id="configuration-gap-target-year"
              value={filters.targetYear ?? ""}
              onChange={(event) =>
                updateFilter(
                  "targetYear",
                  event.target.value === "missing"
                    ? "missing"
                    : parseOptionalInteger(event.target.value),
                )
              }
            >
              <option value="">All target years</option>
              {options.hasMissingTargetYear ? (
                <option value="missing">Missing target year</option>
              ) : null}
              {options.targetYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Reporting frequency" htmlFor="configuration-gap-frequency" className="w-full sm:w-48">
            <Select
              id="configuration-gap-frequency"
              value={filters.reportingFrequency ?? ""}
              onChange={(event) =>
                updateFilter("reportingFrequency", event.target.value || null)
              }
            >
              <option value="">All frequencies</option>
              {options.reportingFrequencies.map((frequency) => (
                <option key={frequency} value={frequency}>
                  {displayOptionLabel(frequency)}
                </option>
              ))}
            </Select>
          </FormField>

          {filtersAreActive ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters(EMPTY_CONFIGURATION_GAP_FILTERS)}
            >
              Clear filters
            </Button>
          ) : null}
        </FilterToolbar>
      </Card>

      <ConfigurationGapTable
        rows={filteredRows}
        totalRows={data.rows.length}
        reportingYear={data.reportingYear}
        hasActiveFilters={filtersAreActive}
        loadFailed={Boolean(data.error)}
      />
    </div>
  );
}
