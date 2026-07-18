import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ADMIN = {
  id: 7,
  email: "admin@easternstate.org",
  name: "Admin",
  role: "admin" as const,
  must_change_password: false,
};

const { requireAdminMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
}));

vi.mock("@/features/auth/session", () => ({
  requireAdmin: requireAdminMock,
  authErrorResponse: (error: { status?: number }) =>
    Response.json(
      { error: error.status === 403 ? "Forbidden" : "Unauthorized" },
      { status: error.status ?? 401 },
    ),
}));

const mocks = vi.hoisted(() => ({
  archiveComponent: vi.fn(),
  archiveMeasurementConfig: vi.fn(),
  archiveStrategicGoal: vi.fn(),
  archiveTarget: vi.fn(),
  createMeasurementConfiguration: vi.fn(),
  createSuccessorMeasurementConfiguration: vi.fn(),
  createSuccessorStrategicGoal: vi.fn(),
  createStrategicTarget: vi.fn(),
  createStrategyComponent: vi.fn(),
  getComponentRecord: vi.fn(),
  getMeasurementConfigRecord: vi.fn(),
  getStrategicGoalRecord: vi.fn(),
  getTargetRecord: vi.fn(),
  reorderStrategyComponents: vi.fn(),
  restoreComponent: vi.fn(),
  restoreMeasurementConfig: vi.fn(),
  restoreStrategicGoal: vi.fn(),
  restoreTarget: vi.fn(),
  updateMeasurementConfiguration: vi.fn(),
  updateStrategicGoalSettings: vi.fn(),
  updateStrategicTarget: vi.fn(),
  updateStrategyComponent: vi.fn(),
}));

vi.mock("@/features/strategy/server", async () => {
  const actual = await vi.importActual<typeof import("@/features/strategy/server")>(
    "@/features/strategy/server",
  );
  return { ...actual, ...mocks };
});
import {
  StrategyEditConflictError,
  StrategyEditNotFoundError,
  StrategyEditValidationError,
} from "@/features/strategy/server";
import {
  PATCH as patchConfigurations,
  POST as postConfigurations,
} from "./configurations/route";
import {
  PATCH as patchTargets,
  POST as postTargets,
} from "./targets/route";
import {
  PATCH as patchComponents,
  POST as postComponents,
} from "./components/route";
import { PATCH as patchGoals } from "./goals/route";

const CSRF_TOKEN = "test-csrf-token-0123456789abcdef";

function request(
  path: string,
  method: "POST" | "PATCH",
  body: object,
  options: { origin?: string; csrf?: boolean; contentType?: string } = {},
): NextRequest {
  const csrf = options.csrf ?? true;
  const headers: Record<string, string> = {
    "content-type": options.contentType ?? "application/json",
    origin: options.origin ?? "http://localhost",
  };
  if (csrf) {
    headers["x-csrf-token"] = CSRF_TOKEN;
    headers.cookie = `eastern_state_kpi_csrf=${CSRF_TOKEN}`;
  }
  return new NextRequest(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function configurationBody() {
  return {
    kpi_id: 12,
    measurement_type: "count",
    unit: "items",
    numerator_label: null,
    denominator_label: null,
    fixed_denominator: null,
    baseline_value: null,
    reporting_frequency: "annual",
    aggregation_method: "none",
    board_level_status: "not_reported",
    calculation_precision: 1,
    allow_score_over_max: false,
    effective_start_year: 2025,
    effective_end_year: 2029,
    configuration_status: "active",
    unresolved_question: null,
    owner: null,
    due_date: null,
    resolution_notes: null,
    source_reference: null,
    last_reviewed_date: null,
  };
}

beforeEach(() => {
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue(ADMIN);
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.createMeasurementConfiguration.mockReturnValue({ id: 21, kpi_id: 12 });
  mocks.createSuccessorMeasurementConfiguration.mockReturnValue({
    predecessor: { id: 21, effective_to_year: 2026 },
    successor: { id: 22, effective_from_year: 2027 },
  });
  mocks.createSuccessorStrategicGoal.mockReturnValue({
    predecessor: { id: 51, plan_end_year: 2026 },
    successor: { id: 52, plan_start_year: 2027 },
  });
  mocks.updateMeasurementConfiguration.mockReturnValue({ id: 21, unit: "visits" });
  mocks.getMeasurementConfigRecord.mockReturnValue({ id: 21, archived_at: null });
  mocks.createStrategicTarget.mockReturnValue({ id: 31, target_value: 0 });
  mocks.updateStrategicTarget.mockReturnValue({ id: 31, target_value: 5 });
  mocks.getTargetRecord.mockReturnValue({ id: 31, archived_at: null });
  mocks.createStrategyComponent.mockReturnValue({ id: 41, label: "Visits" });
  mocks.updateStrategyComponent.mockReturnValue({ id: 41, label: "Total visits" });
  mocks.reorderStrategyComponents.mockReturnValue([
    { id: 42, display_order: 0 },
    { id: 41, display_order: 1 },
  ]);
  mocks.getComponentRecord.mockReturnValue({ id: 41, archived_at: null });
  mocks.updateStrategicGoalSettings.mockReturnValue({
    id: 51,
    completion_rule: "threshold_count",
  });
  mocks.getStrategicGoalRecord.mockReturnValue({ id: 51, archived_at: null });
});

describe("strategic configuration admin routes", () => {
  it("authorizes and CSRF-checks before creating a strict configuration", async () => {
    const response = await postConfigurations(
      request("/api/strategy/configurations", "POST", configurationBody()),
    );
    expect(response.status).toBe(201);
    expect(mocks.createMeasurementConfiguration).toHaveBeenCalledWith(
      configurationBody(),
      ADMIN.id,
    );
    await expect(response.json()).resolves.toEqual({
      configuration: { id: 21, kpi_id: 12 },
    });

    const invalid = await postConfigurations(
      request("/api/strategy/configurations", "POST", {
        ...configurationBody(),
        unexpected: true,
      }),
    );
    expect(invalid.status).toBe(400);
    expect(mocks.createMeasurementConfiguration).toHaveBeenCalledTimes(1);
  });

  it("returns auth failures before CSRF/body failures and blocks forged origins", async () => {
    requireAdminMock.mockRejectedValueOnce({ status: 401 });
    const unauthorized = await postConfigurations(
      request(
        "/api/strategy/configurations",
        "POST",
        {},
        { csrf: false, origin: "https://attacker.example" },
      ),
    );
    expect(unauthorized.status).toBe(401);
    expect(mocks.createMeasurementConfiguration).not.toHaveBeenCalled();

    const forged = await postConfigurations(
      request(
        "/api/strategy/configurations",
        "POST",
        configurationBody(),
        { origin: "https://attacker.example" },
      ),
    );
    expect(forged.status).toBe(403);
    expect(mocks.createMeasurementConfiguration).not.toHaveBeenCalled();
  });

  it("dispatches configuration update/archive/restore actions", async () => {
    const update = await patchConfigurations(
      request("/api/strategy/configurations", "PATCH", {
        action: "update",
        update: { id: 21, unit: "visits" },
      }),
    );
    expect(update.status).toBe(200);
    expect(mocks.updateMeasurementConfiguration).toHaveBeenCalledWith(
      { id: 21, unit: "visits" },
      ADMIN.id,
    );

    await patchConfigurations(
      request("/api/strategy/configurations", "PATCH", {
        action: "archive",
        id: 21,
      }),
    );
    expect(mocks.archiveMeasurementConfig).toHaveBeenCalledWith(21, ADMIN.id);
    await patchConfigurations(
      request("/api/strategy/configurations", "PATCH", {
        action: "restore",
        id: 21,
      }),
    );
    expect(mocks.restoreMeasurementConfig).toHaveBeenCalledWith(21, ADMIN.id);
  });

  it("creates a successor configuration through one atomic admin action", async () => {
    const successor = {
      ...configurationBody(),
      effective_start_year: 2027,
      unit: "visitors",
    };
    const response = await patchConfigurations(
      request("/api/strategy/configurations", "PATCH", {
        action: "create_successor",
        predecessor_id: 21,
        successor,
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createSuccessorMeasurementConfiguration).toHaveBeenCalledWith(
      { predecessor_id: 21, successor },
      ADMIN.id,
    );
    await expect(response.json()).resolves.toEqual({
      predecessor: { id: 21, effective_to_year: 2026 },
      successor: { id: 22, effective_from_year: 2027 },
    });

    const outsidePlan = await patchConfigurations(
      request("/api/strategy/configurations", "PATCH", {
        action: "create_successor",
        predecessor_id: 21,
        successor: {
          ...successor,
          effective_start_year: 2030,
          effective_end_year: 2030,
        },
      }),
    );
    expect(outsidePlan.status).toBe(201);
    expect(mocks.createSuccessorMeasurementConfiguration).toHaveBeenLastCalledWith(
      {
        predecessor_id: 21,
        successor: {
          ...successor,
          effective_start_year: 2030,
          effective_end_year: 2030,
        },
      },
      ADMIN.id,
    );
  });

  it("maps repository validation, missing, and conflict errors to 400/404/409", async () => {
    mocks.createStrategicTarget.mockImplementationOnce(() => {
      throw new StrategyEditConflictError("Duplicate target.", "duplicate_target");
    });
    const conflict = await postTargets(
      request("/api/strategy/targets", "POST", {
        kpi_id: 12,
        target_scope: "full_plan",
        target_year: 2029,
        target_value: 0,
      }),
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      code: "duplicate_target",
    });

    mocks.updateStrategicTarget.mockImplementationOnce(() => {
      throw new StrategyEditNotFoundError("target", 999);
    });
    const missing = await patchTargets(
      request("/api/strategy/targets", "PATCH", {
        action: "update",
        update: { id: 999, target_value: 4 },
      }),
    );
    expect(missing.status).toBe(404);

    mocks.updateStrategicGoalSettings.mockImplementationOnce(() => {
      throw new StrategyEditValidationError("Invalid strategic goal.", [
        { path: "threshold_count", message: "Threshold is required." },
      ]);
    });
    const invalid = await patchGoals(
      request("/api/strategy/goals", "PATCH", {
        action: "update",
        update: { id: 51, completion_rule: "threshold_count" },
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      issues: [{ path: "threshold_count" }],
    });
  });

  it("creates, updates, reorders, archives, and restores components", async () => {
    const created = await postComponents(
      request("/api/strategy/components", "POST", {
        configuration_id: 20,
        slug: "visits",
        label: "Visits",
        measurement_type: "count",
        unit: "visits",
        display_order: 0,
        configuration_status: "draft",
      }),
    );
    expect(created.status).toBe(201);
    expect(mocks.createStrategyComponent).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "visits" }),
      ADMIN.id,
    );

    await patchComponents(
      request("/api/strategy/components", "PATCH", {
        action: "update",
        update: { id: 41, label: "Total visits" },
      }),
    );
    expect(mocks.updateStrategyComponent).toHaveBeenCalledWith(
      { id: 41, label: "Total visits" },
      ADMIN.id,
    );
    const reordered = await patchComponents(
      request("/api/strategy/components", "PATCH", {
        action: "reorder",
        reorder: {
          configuration_id: 20,
          ordered_component_ids: [42, 41],
        },
      }),
    );
    expect(reordered.status).toBe(200);
    await expect(reordered.json()).resolves.toMatchObject({
      components: [
        { id: 42, display_order: 0 },
        { id: 41, display_order: 1 },
      ],
    });
    await patchComponents(
      request("/api/strategy/components", "PATCH", {
        action: "archive",
        id: 41,
      }),
    );
    await patchComponents(
      request("/api/strategy/components", "PATCH", {
        action: "restore",
        id: 41,
      }),
    );
    expect(mocks.archiveComponent).toHaveBeenCalledWith(41, ADMIN.id);
    expect(mocks.restoreComponent).toHaveBeenCalledWith(41, ADMIN.id);
  });

  it("updates and lifecycle-manages strategic goals through the admin boundary", async () => {
    const updated = await patchGoals(
      request("/api/strategy/goals", "PATCH", {
        action: "update",
        update: {
          id: 51,
          completion_rule: "threshold_count",
          threshold_count: 2,
        },
      }),
    );
    expect(updated.status).toBe(200);
    expect(mocks.updateStrategicGoalSettings).toHaveBeenCalledWith(
      {
        id: 51,
        completion_rule: "threshold_count",
        threshold_count: 2,
      },
      ADMIN.id,
    );
    await patchGoals(
      request("/api/strategy/goals", "PATCH", {
        action: "archive",
        id: 51,
      }),
    );
    await patchGoals(
      request("/api/strategy/goals", "PATCH", {
        action: "restore",
        id: 51,
      }),
    );
    expect(mocks.archiveStrategicGoal).toHaveBeenCalledWith(51, ADMIN.id);
    expect(mocks.restoreStrategicGoal).toHaveBeenCalledWith(51, ADMIN.id);
  });

  it("creates an effective-dated successor goal through the admin boundary", async () => {
    const update = {
      id: 51,
      completion_rule: "threshold_count",
      threshold_count: 2,
    };
    const response = await patchGoals(
      request("/api/strategy/goals", "PATCH", {
        action: "create_successor",
        predecessor_id: 51,
        effective_start_year: 2027,
        update,
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createSuccessorStrategicGoal).toHaveBeenCalledWith(
      {
        predecessor_id: 51,
        effective_start_year: 2027,
        update,
      },
      ADMIN.id,
    );
  });
});
