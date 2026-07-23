"use client";

import { Badge, EmptyState, Table } from "@/components/ui";
import type { StrategicAuditEvent } from "@/features/strategy";

export type SetupAuditEvent = Omit<
  StrategicAuditEvent,
  "entity_type" | "previous_value" | "new_value"
> & {
  entity_type:
    | StrategicAuditEvent["entity_type"]
    | "organization"
    | "strategic_plan"
    | "board_reporting_scope";
  previous_value: unknown;
  new_value: unknown;
};

/** Renders the strategic audit table interface. */
export function StrategicAuditTable({
  events,
}: {
  events: SetupAuditEvent[];
}) {
  return (
    <div className="overflow-hidden border-y border-ink-200">
      {events.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No setup changes recorded"
            description="Changes to organization, plan, measures, goals, and targets will appear here."
          />
        </div>
      ) : (
        <Table minWidth="860px">
          <caption className="sr-only">Recent plan and result changes</caption>
          <thead>
            <tr>
              <th>When</th>
              <th>Change</th>
              <th>Area</th>
              <th>By</th>
              <th><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={`${event.entity_type}-${event.id}`} className="align-top">
                <td className="whitespace-nowrap text-xs tabular-nums text-ink-500">
                  {formatDate(event.occurred_at)}
                </td>
                <td>
                  <p className="font-semibold text-ink-900">{event.entity_display_name}</p>
                  <p className="mt-1 text-xs text-ink-500">{eventTypeLabel(event.entity_type)}</p>
                </td>
                <td className="max-w-64 text-sm leading-6 text-ink-700">
                  {[event.parent_priority_name, event.parent_goal_name].filter(Boolean).join(" · ") || "General"}
                </td>
                <td className="max-w-48 wrap-break-word text-xs text-ink-500">{event.actor_email_snapshot ?? "System"}</td>
                <td className="text-right">
                  <details className="text-left">
                    <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold text-brand-800">
                      View details
                    </summary>
                    <div className="mt-3 w-[min(38rem,75vw)] space-y-3 rounded-lg bg-ink-50 p-3 text-xs leading-5 text-ink-700">
                      <Badge variant={event.event_type === "archive" || event.event_type === "delete" ? "warning" : event.event_type === "restore" ? "success" : "info"}>{displayToken(event.event_type)}</Badge>
                      <div>
                        <p className="font-semibold text-ink-900">Before</p>
                        <pre className="mt-1 whitespace-pre-wrap wrap-break-word font-sans">{snapshot(event.previous_value)}</pre>
                      </div>
                      <div>
                        <p className="font-semibold text-ink-900">After</p>
                        <pre className="mt-1 whitespace-pre-wrap wrap-break-word font-sans">{snapshot(event.new_value)}</pre>
                      </div>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

/** Implements the event type label operation. */
function eventTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    kpi_observation: "Reported value",
    kpi_component_entry: "Reported input",
    distribution_observation: "Reported groups",
    measurement_config: "Measure setup",
    kpi_component: "Measure input",
    distribution_band: "Reporting group",
    target: "Target",
    strategic_goal: "Goal",
    goal_membership: "Goal measure",
    kpi: "Measure",
    category: "Priority",
    organization: "Organization",
    strategic_plan: "Strategic plan",
    board_reporting_scope: "Board visibility",
  };
  return labels[value] ?? displayToken(value);
}
/** Implements the snapshot operation. */
function snapshot(value: unknown): string {
  if (value === null) return "—";
  const text = JSON.stringify(value, null, 2);
  return text.length > 900 ? `${text.slice(0, 900)}…` : text;
}

/** Implements the display token operation. */
function displayToken(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

/** Formats date. */
function formatDate(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
