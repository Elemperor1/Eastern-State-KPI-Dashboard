import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/lib/db";
import { createCategory } from "@/features/catalog/server";
import {
  bootstrapInstallation,
  getActiveInstallation,
  InstallationEditConflictError,
  InstallationNotConfiguredError,
  listInstallationAuditEvents,
  updateActiveInstallation,
} from "./server";

const bootstrap = {
  organization: {
    slug: "example-historic-site",
    name: "Example Historic Site",
    shortName: "Example",
  },
  plan: {
    slug: "strategic-plan-2025-2029",
    name: "Strategic Plan",
    description: "Initial persisted plan.",
    startYear: 2025,
    endYear: 2029,
    sourceReference: "Approved source",
  },
};

describe("database-backed installation and plan", () => {
  let directory: string;
  let originalDatabasePath: string | undefined;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "es-kpi-installation-"));
    originalDatabasePath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = path.join(directory, "installation.db");
    resetDb();
  });

  afterEach(() => {
    resetDb();
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("fails explicitly when the installation has not been initialized", () => {
    expect(() => getActiveInstallation()).toThrow(InstallationNotConfiguredError);
  });

  it("bootstraps once and never reconciles an initialized database from changed source input", () => {
    expect(bootstrapInstallation(bootstrap)).toMatchObject({ created: true });
    const first = getActiveInstallation();
    expect(first).toMatchObject({
      organization: {
        slug: "example-historic-site",
        name: "Example Historic Site",
        shortName: "Example",
      },
      plan: {
        slug: "strategic-plan-2025-2029",
        name: "Strategic Plan",
        startYear: 2025,
        endYear: 2029,
        revision: 1,
      },
      years: [2025, 2026, 2027, 2028, 2029],
    });

    expect(
      bootstrapInstallation({
        ...bootstrap,
        organization: { ...bootstrap.organization, name: "Changed source name" },
        plan: { ...bootstrap.plan, endYear: 2035 },
      }),
    ).toMatchObject({ created: false });
    expect(getActiveInstallation()).toEqual(first);
    expect(listInstallationAuditEvents()).toHaveLength(2);
  });

  it("owns every newly created strategic priority through the active plan foreign key", () => {
    const installation = bootstrapInstallation(bootstrap).installation;

    const priority = createCategory({
      slug: "example-priority",
      name: "Example priority",
    });

    expect(priority.plan_id).toBe(installation.plan.id);
    expect(
      getDb()
        .prepare("SELECT plan_id FROM categories WHERE id = ?")
        .get(priority.id),
    ).toEqual({ plan_id: installation.plan.id });
  });

  it("persists an audited edit across reopen and rejects a stale concurrent revision", () => {
    bootstrapInstallation(bootstrap);
    const actorId = Number(
      getDb()
        .prepare(
          `INSERT INTO users (email, name, password_hash, role)
           VALUES ('editor@example.org', 'Plan Editor', 'hash', 'admin')`,
        )
        .run().lastInsertRowid,
    );
    const current = getActiveInstallation();
    const updated = updateActiveInstallation(
      {
        expectedRevision: current.plan.revision,
        organizationName: "Example Historic Site and Museum",
        organizationShortName: "Example Museum",
        planName: "Strategic Plan 2025-2030",
        planDescription: "Board-approved extended plan.",
        startYear: 2025,
        endYear: 2030,
        sourceReference: "Board approval 2030",
      },
      actorId,
    );
    expect(updated.plan.revision).toBe(2);
    expect(updated.years).toEqual([2025, 2026, 2027, 2028, 2029, 2030]);
    expect(() =>
      updateActiveInstallation(
        {
          expectedRevision: current.plan.revision,
          organizationName: "Stale overwrite",
          organizationShortName: "Stale",
          planName: "Stale plan",
          planDescription: null,
          startYear: 2025,
          endYear: 2029,
          sourceReference: null,
        },
        actorId,
      ),
    ).toThrow(InstallationEditConflictError);

    resetDb();
    expect(getActiveInstallation()).toMatchObject({
      organization: {
        name: "Example Historic Site and Museum",
        shortName: "Example Museum",
      },
      plan: {
        name: "Strategic Plan 2025-2030",
        description: "Board-approved extended plan.",
        endYear: 2030,
        revision: 2,
        sourceReference: "Board approval 2030",
      },
    });
    expect(listInstallationAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "organization",
          eventType: "update",
          actorEmailSnapshot: "editor@example.org",
        }),
        expect.objectContaining({
          entityType: "strategic_plan",
          eventType: "update",
          actorEmailSnapshot: "editor@example.org",
        }),
      ]),
    );
  });

  it("audits the plan revision when an organization-only edit advances it", () => {
    bootstrapInstallation(bootstrap);
    const actorId = Number(
      getDb()
        .prepare(
          `INSERT INTO users (email, name, password_hash, role)
           VALUES ('identity-editor@example.org', 'Identity Editor', 'hash', 'admin')`,
        )
        .run().lastInsertRowid,
    );
    const current = getActiveInstallation();

    const updated = updateActiveInstallation(
      {
        expectedRevision: current.plan.revision,
        organizationName: "Example Museum",
        organizationShortName: "Museum",
        planName: current.plan.name,
        planDescription: current.plan.description,
        startYear: current.plan.startYear,
        endYear: current.plan.endYear,
        sourceReference: current.plan.sourceReference,
      },
      actorId,
    );

    expect(updated.plan.revision).toBe(current.plan.revision + 1);
    expect(listInstallationAuditEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: "strategic_plan",
          eventType: "update",
          previousValue: expect.objectContaining({ revision: current.plan.revision }),
          newValue: expect.objectContaining({ revision: current.plan.revision + 1 }),
        }),
      ]),
    );
  });

  it("blocks active out-of-range definitions but permits contraction after they are archived", () => {
    const installation = bootstrapInstallation(bootstrap).installation;
    const actorId = Number(
      getDb()
        .prepare(
          `INSERT INTO users (email, name, password_hash, role)
           VALUES ('range-editor@example.org', 'Range Editor', 'hash', 'admin')`,
        )
        .run().lastInsertRowid,
    );
    const priority = createCategory({ slug: "range-priority", name: "Range priority" });
    const kpiId = Number(
      getDb()
        .prepare(
          `INSERT INTO kpis (
             category_id, slug, name, unit, unit_type,
             reporting_frequency, direction, sort_order
           ) VALUES (?, 'range-kpi', 'Range KPI', 'count', 'count',
                     'annual', 'higher', 1)`,
        )
        .run(priority.id).lastInsertRowid,
    );
    const goalId = Number(
      getDb()
        .prepare(
          `INSERT INTO strategic_goals (
             priority_id, slug, name, plan_start_year, plan_end_year,
             configuration_status
           ) VALUES (?, 'range-goal', 'Range goal', 2025, 2029, 'active')`,
        )
        .run(priority.id).lastInsertRowid,
    );
    getDb()
      .prepare(
        `INSERT INTO kpi_measurement_configs (
           kpi_id, effective_from_year, effective_to_year,
           measurement_type, reporting_frequency, aggregation_method,
           configuration_status
         ) VALUES (?, 2025, 2029, 'count', 'annual', 'none', 'archived')`,
      )
      .run(kpiId);
    getDb()
      .prepare(
        `INSERT INTO distribution_bands (
           kpi_id, slug, label, effective_from_year, effective_to_year, archived_at
         ) VALUES (?, 'historic-band', 'Historic band', 2025, 2029, datetime('now'))`,
      )
      .run(kpiId);
    getDb()
      .prepare(
        `INSERT INTO kpi_targets (
           kpi_id, target_scope, reporting_year, target_year,
           target_value, configuration_status, archived_at
         ) VALUES (?, 'annual', 2029, 2029, 10, 'archived', datetime('now'))`,
      )
      .run(kpiId);

    const contraction = {
      expectedRevision: installation.plan.revision,
      organizationName: installation.organization.name,
      organizationShortName: installation.organization.shortName,
      planName: installation.plan.name,
      planDescription: installation.plan.description,
      startYear: 2026,
      endYear: 2028,
      sourceReference: installation.plan.sourceReference,
    };
    expect(() => updateActiveInstallation(contraction, actorId)).toThrow(
      "Strategic Goal effective ranges",
    );

    getDb()
      .prepare(
        `UPDATE strategic_goals
         SET configuration_status = 'archived', archived_at = datetime('now')
         WHERE id = ?`,
      )
      .run(goalId);

    expect(updateActiveInstallation(contraction, actorId)).toMatchObject({
      plan: { startYear: 2026, endYear: 2028, revision: 2 },
      years: [2026, 2027, 2028],
    });
  });
});
