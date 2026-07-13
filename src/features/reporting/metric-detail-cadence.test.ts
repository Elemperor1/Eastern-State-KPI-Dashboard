import { describe, expect, it } from "vitest";
import { resolveMetricDetailCadence } from "./metric-detail-cadence";

describe("metric-detail strategic cadence", () => {
  it.each([
    ["monthly", "Monthly", true],
    ["quarterly", "Quarterly", false],
    ["annual", "Annual", false],
    ["cumulative", "Cumulative", false],
    ["one_time", "One-time", false],
    ["flexible", "Flexible", false],
  ] as const)(
    "uses cadence-correct controls and labels for %s",
    (reportingFrequency, label, allowMonth) => {
      expect(resolveMetricDetailCadence({
        legacyIsAnnual: false,
        strategicMeasurementType: "count",
        strategicReportingFrequency: reportingFrequency,
        hasStrategicHistory: false,
      })).toMatchObject({
        kind: reportingFrequency,
        label,
        allowMonth,
      });
    },
  );

  it.each([
    [true, "monthly"],
    [false, "annual"],
  ] as const)(
    "does not reuse %s legacy storage for a strategic %s configuration",
    (legacyIsAnnual, strategicReportingFrequency) => {
      expect(resolveMetricDetailCadence({
        legacyIsAnnual,
        strategicMeasurementType: "count",
        strategicReportingFrequency,
        hasStrategicHistory: false,
      }).legacyHistoryKind).toBeNull();
    },
  );

  it.each([
    [false, "monthly", "monthly"],
    [true, "annual", "annual"],
  ] as const)(
    "reuses %s legacy storage only for a matching strategic %s cadence",
    (legacyIsAnnual, strategicReportingFrequency, legacyHistoryKind) => {
      expect(resolveMetricDetailCadence({
        legacyIsAnnual,
        strategicMeasurementType: "count",
        strategicReportingFrequency,
        hasStrategicHistory: false,
      }).legacyHistoryKind).toBe(legacyHistoryKind);
    },
  );

  it("lets cumulative measurement semantics override an annual collection cadence", () => {
    expect(resolveMetricDetailCadence({
      legacyIsAnnual: true,
      strategicMeasurementType: "cumulative",
      strategicReportingFrequency: "annual",
      hasStrategicHistory: false,
    })).toEqual({
      kind: "cumulative",
      label: "Cumulative",
      allowMonth: false,
      legacyHistoryKind: null,
    });
  });

  it("does not duplicate matching legacy history when first-class history exists", () => {
    expect(resolveMetricDetailCadence({
      legacyIsAnnual: true,
      strategicMeasurementType: "count",
      strategicReportingFrequency: "annual",
      hasStrategicHistory: true,
    }).legacyHistoryKind).toBeNull();
  });

  it("does not infer a legacy cadence for an unresolved strategic definition", () => {
    expect(resolveMetricDetailCadence({
      legacyIsAnnual: true,
      strategicMeasurementType: "unknown",
      strategicReportingFrequency: "unknown",
      hasStrategicHistory: false,
    })).toEqual({
      kind: "unknown",
      label: "Reporting frequency not finalized",
      allowMonth: false,
      legacyHistoryKind: null,
    });
  });

  it("preserves the legacy annual contract when no strategic configuration exists", () => {
    expect(resolveMetricDetailCadence({
      legacyIsAnnual: true,
      strategicMeasurementType: null,
      strategicReportingFrequency: null,
      hasStrategicHistory: false,
    })).toEqual({
      kind: "annual",
      label: "Annual",
      allowMonth: false,
      legacyHistoryKind: "annual",
    });
  });
});
