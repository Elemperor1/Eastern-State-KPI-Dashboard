"use client";

import { Badge, Card, EmptyState, Table } from "@/components/ui";
import type { StrategicAuditEvent } from "@/features/strategy";

export function StrategicAuditTable({
  events,
}: {
  events: StrategicAuditEvent[];
}) {
  return (
    <Card as="section" className="overflow-hidden" aria-labelledby="strategic-audit-title">
      <div className="border-b border-ink-100 p-5 lg:px-6">
        <h2 id="strategic-audit-title" className="text-xl font-semibold text-ink-900">
          Strategic configuration history
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Snapshot labels and before/after values remain readable after an entity is archived or removed.
        </p>
      </div>
      {events.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="No strategic changes recorded"
            description="Configuration, target, component, and strategic-value changes will appear here."
          />
        </div>
      ) : (
        <Table minWidth="1040px">
          <caption className="sr-only">Strategic configuration and value audit events</caption>
          <thead>
            <tr>
              <th>When</th>
              <th>Entity</th>
              <th>Action</th>
              <th>Strategic context</th>
              <th>Previous</th>
              <th>New</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="align-top">
                <td className="whitespace-nowrap text-xs tabular-nums text-ink-500">
                  {formatDate(event.occurred_at)}
                </td>
                <td>
                  <p className="font-semibold text-ink-900">{event.entity_display_name}</p>
                  <p className="mt-1 text-xs text-ink-500">{displayToken(event.entity_type)} #{event.entity_id}</p>
                </td>
                <td><Badge variant={event.event_type === "archive" || event.event_type === "delete" ? "warning" : event.event_type === "restore" ? "success" : "info"}>{displayToken(event.event_type)}</Badge></td>
                <td className="max-w-64 text-sm leading-6 text-ink-700">
                  {[event.parent_priority_name, event.parent_goal_name].filter(Boolean).join(" · ") || "No parent snapshot"}
                </td>
                <td className="max-w-80 whitespace-pre-wrap break-words text-xs leading-5 text-ink-600">{snapshot(event.previous_value)}</td>
                <td className="max-w-80 whitespace-pre-wrap break-words text-xs leading-5 text-ink-600">{snapshot(event.new_value)}</td>
                <td className="max-w-48 break-words text-xs text-ink-500">{event.actor_email_snapshot ?? "System"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
function snapshot(value: StrategicAuditEvent["previous_value"]): string {
  if (value === null) return "—";
  const text = JSON.stringify(value, null, 2);
  return text.length > 900 ? `${text.slice(0, 900)}…` : text;
}

function displayToken(value: string): string {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value.endsWith("Z") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
