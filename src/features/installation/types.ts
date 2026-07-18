export interface ActiveInstallation {
  organization: {
    id: number;
    slug: string;
    name: string;
    shortName: string;
    status: "active";
    updatedAt: string;
  };
  plan: {
    id: number;
    organizationId: number;
    slug: string;
    name: string;
    description: string | null;
    startYear: number;
    endYear: number;
    status: "active";
    revision: number;
    sourceReference: string | null;
    updatedAt: string;
  };
  years: number[];
}

export interface InstallationAuditEvent {
  id: number;
  entityType: "organization" | "strategic_plan";
  entityId: number;
  eventType: "create" | "update" | "archive" | "restore";
  entityDisplayName: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  actorId: number | null;
  actorEmailSnapshot: string | null;
  occurredAt: string;
}
