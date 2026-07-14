import { describe, expect, it } from "vitest";
import {
  STRATEGIC_BOARD_CSV_COLUMNS,
  buildStrategicBoardCsvExport,
  buildStrategicBoardCsvRows,
  buildStrategicBoardCsvText,
  buildStrategicBoardReport,
  type StrategicBoardKpiInput,
  type StrategicBoardReportInput,
  type StrategicBoardReportViewModel,
} from "./strategic-board-report";

function kpi(
  overrides: Partial<StrategicBoardKpiInput> &
    Pick<StrategicBoardKpiInput, "id" | "name" | "measurementType">,
): StrategicBoardKpiInput {
  return {
    reportingFrequency: "annual",
    unit: "items",
    result: { state: "ok", value: 1, displayValue: "1" },
    annualProgress: null,
    fullPlanProgress: null,
    boardStatus: "on_track",
    configurationStatus: "active",
    components: [],
    demographics: null,
    revenueBreakdown: null,
    unresolvedReasons: [],
    ...overrides,
  };
}

function representativeInput(): StrategicBoardReportInput {
  const resolvedKpis: StrategicBoardKpiInput[] = [
    kpi({
      id: "plan-adoption",
      name: "Interpretive plan adopted",
      measurementType: "binary",
      reportingFrequency: "one_time",
      unit: "Yes/No",
      result: {
        state: "ok",
        value: 1,
        displayValue: "Complete",
        formulaExplanation: "Board adoption recorded as complete.",
      },
      fullPlanProgress: {
        actualValue: 0,
        targetValue: 0,
        actualProgressPercentage: 100,
        status: "complete",
        targetYear: 2027,
        targetDescription: "Board adopts the interpretive plan by 2027",
      },
      boardStatus: "complete",
    }),
    kpi({
      id: "visitor-upgrades",
      name: "Visitor amenity upgrades",
      measurementType: "cumulative",
      reportingFrequency: "cumulative",
      unit: "upgrades",
      result: { state: "ok", value: 6, displayValue: "6 upgrades" },
      annualProgress: {
        actualValue: 2,
        targetValue: 2,
        actualProgressPercentage: 100,
        status: "complete",
        targetYear: 2027,
        targetDescription: "Complete two upgrades in 2027",
      },
      fullPlanProgress: {
        actualValue: 6,
        targetValue: 5,
        actualProgressPercentage: 120,
        status: "complete",
        targetYear: 2029,
        targetDescription: "Complete five visitor amenity upgrades by 2029",
      },
      boardStatus: "exceeded",
    }),
    kpi({
      id: "visitor-satisfaction",
      name: "Visitor satisfaction",
      measurementType: "percentage",
      reportingFrequency: "quarterly",
      unit: "%",
      result: {
        state: "ok",
        value: 75,
        displayValue: "75%",
        numerator: 75,
        denominator: 100,
        respondentCount: 100,
        formulaExplanation: "Positive responses divided by total responses.",
      },
      annualProgress: {
        actualValue: 75,
        targetValue: 80,
        actualProgressPercentage: 93.75,
        status: "on_track",
        targetYear: 2027,
        targetDescription: "Reach 80% positive satisfaction in 2027",
      },
    }),
    kpi({
      id: "skill-improvement",
      name: "Skill-improvement score",
      measurementType: "average",
      reportingFrequency: "annual",
      unit: "% of maximum score",
      result: {
        state: "ok",
        value: 80,
        displayValue: "80% of maximum score",
        numerator: 40,
        denominator: 50,
        respondentCount: 10,
        formulaExplanation: "Total score divided by total possible score.",
      },
    }),
    kpi({
      id: "workforce-participants",
      name: "Workforce participation and graduation",
      measurementType: "multi_component",
      reportingFrequency: "annual",
      unit: null,
      result: { state: "ok", value: null, displayValue: "2 components" },
      components: [
        {
          id: "enrolled",
          label: "Participants enrolled",
          measurementType: "count",
          unit: "people",
          result: { state: "ok", value: 24, displayValue: "24 people" },
          progress: {
            actualValue: 24,
            targetValue: 20,
            actualProgressPercentage: 120,
            status: "exceeded",
            targetYear: 2027,
            targetDescription: "Enroll 20 participants",
          },
          configurationStatus: "active",
        },
        {
          id: "graduated",
          label: "Participants graduating",
          measurementType: "percentage",
          unit: "%",
          result: {
            state: "ok",
            value: 75,
            displayValue: "75%",
            numerator: 18,
            denominator: 24,
          },
          progress: {
            actualValue: 75,
            targetValue: 80,
            actualProgressPercentage: 93.75,
            status: "on_track",
            targetYear: 2027,
            targetDescription: "Reach an 80% graduation rate",
          },
          configurationStatus: "active",
        },
      ],
    }),
    kpi({
      id: "audience-race-ethnicity",
      name: "Audience race and ethnicity distribution",
      measurementType: "distribution",
      reportingFrequency: "annual",
      unit: "respondents",
      result: {
        state: "ok",
        value: null,
        displayValue: "100 respondents",
        respondentCount: 100,
      },
      demographics: {
        respondentTotal: 100,
        mutuallyExclusive: true,
        derivedNonWhitePercentage: 40,
        populationCaveat:
          "Survey respondents are not assumed to represent every visitor.",
        bands: [
          {
            id: "white",
            label: "White",
            count: 60,
            percentage: 60,
            derivedGroup: "white",
          },
          {
            id: "non-white",
            label: "Non-white audience",
            count: 40,
            percentage: 40,
            derivedGroup: "non_white",
          },
        ],
      },
    }),
    kpi({
      id: "revenue-by-stream",
      name: "Revenue by major stream",
      measurementType: "multi_component",
      reportingFrequency: "annual",
      unit: "USD",
      result: { state: "ok", value: 1_000_000, displayValue: "$1,000,000" },
      revenueBreakdown: {
        totalRevenue: 1_000_000,
        streams: [
          {
            id: "admissions",
            label: "Admissions",
            value: 600_000,
            sharePercentage: 60,
          },
          {
            id: "grants",
            label: "Grants",
            value: 400_000,
            sharePercentage: 40,
          },
        ],
      },
    }),
    kpi({
      id: "annual-workshops",
      name: "Annual justice-education workshops",
      measurementType: "count",
      reportingFrequency: "annual",
      unit: "workshops",
      result: { state: "ok", value: 12, displayValue: "12 workshops" },
      annualProgress: {
        actualValue: 12,
        targetValue: 12,
        actualProgressPercentage: 100,
        status: "complete",
        targetYear: 2027,
        targetDescription: "Deliver 12 workshops in 2027",
      },
    }),
    kpi({
      id: "attendance-yoy",
      name: "Attendance change year over year",
      measurementType: "year_over_year",
      reportingFrequency: "annual",
      unit: "%",
      result: {
        state: "ok",
        value: 20,
        displayValue: "+20%",
        numerator: 20,
        denominator: 100,
        formulaExplanation: "Current attendance change divided by prior attendance.",
      },
    }),
  ];

  const unresolvedKpi = kpi({
    id: "average-dwell-time",
    name: "Average visitor dwell time\u0000",
    measurementType: "count",
    reportingFrequency: "annual",
    unit: "minutes",
    result: {
      state: "missing",
      value: Number.NaN,
      displayValue: "   ",
      numerator: Number.POSITIVE_INFINITY,
      respondentCount: Number.NaN,
    },
    fullPlanProgress: {
      actualValue: Number.POSITIVE_INFINITY,
      targetValue: null,
      actualProgressPercentage: Number.POSITIVE_INFINITY,
      status: "in_progress",
      targetYear: Number.NaN,
      targetDescription: null,
    },
    boardStatus: "not_reported",
    configurationStatus: "needs_target",
    unresolvedReasons: [
      "Timing methodology has not been approved.",
      undefined,
      "Timing methodology has not been approved.",
      " ",
    ],
  });

  return {
    organizationName: " Eastern State Penitentiary Historic Site ",
    selectedYear: 2027,
    reportingPeriod: "Quarter 2",
    organizationGoalCompletion: {
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 1,
      completionPercentage: 100,
      excludedGoalsCount: 1,
      excludedGoalReasons: ["One goal needs target configuration."],
    },
    priorities: [
      {
        id: "visitor-experience",
        name: "Reimagine Visitor Experience",
        goalCompletion: {
          completedGoalsCount: 1,
          totalEligibleGoalsCount: 1,
          completionPercentage: 100,
          excludedGoalsCount: 1,
          excludedGoalReasons: ["Dwell-time goal excluded pending a target."],
        },
        goals: [
          {
            id: "modernize-visitor-experience",
            name: "Modernize the visitor experience",
            completionStatus: "exceeded",
            actualCompletionPercentage: 110,
            completedKpisCount: 9,
            totalEligibleKpisCount: 9,
            excludedKpisCount: 0,
            excludedReasons: [],
            kpis: resolvedKpis,
          },
          {
            id: "define-dwell-time",
            name: "Define and improve dwell time",
            completionStatus: "target_not_finalized",
            actualCompletionPercentage: null,
            completedKpisCount: 0,
            totalEligibleKpisCount: 0,
            excludedKpisCount: 1,
            excludedReasons: ["Target is not finalized."],
            kpis: [unresolvedKpi],
          },
        ],
      },
    ],
  };
}

function allKpis(report: StrategicBoardReportViewModel) {
  return report.priorities.flatMap((priority) =>
    priority.goals.flatMap((goal) => goal.kpis),
  );
}

function assertDeepSerializable(value: unknown): void {
  expect(value).not.toBeUndefined();
  if (typeof value === "number") {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertDeepSerializable(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) assertDeepSerializable(item);
  }
}

describe("strategic board report contract", () => {
  it("builds named organization, priority, goal, and KPI summaries for the selected year", () => {
    const report = buildStrategicBoardReport(representativeInput());

    expect(report.organizationName).toBe(
      "Eastern State Penitentiary Historic Site",
    );
    expect(report.selectedYear).toBe(2027);
    expect(report.organizationGoalCompletion).toEqual({
      completedGoalsCount: 1,
      totalEligibleGoalsCount: 1,
      completionPercentage: 100,
      excludedGoalsCount: 1,
      excludedGoalReasons: ["One goal needs target configuration."],
      countLabel: "1 of 1 goals completed",
    });
    expect(report.priorities[0].name).toBe("Reimagine Visitor Experience");
    expect(report.priorities[0].goals.map((goal) => goal.name)).toEqual([
      "Modernize the visitor experience",
      "Define and improve dwell time",
    ]);
    expect(report.priorities[0].goals[0]).toMatchObject({
      actualCompletionPercentage: 110,
      displayCompletionPercentage: 100,
      completionStatus: "exceeded",
    });
    expect(allKpis(report)).toHaveLength(10);
  });

  it("contains representative binary, cumulative, percentage, average, component, distribution, revenue, unresolved, annual, and YoY KPIs", () => {
    const report = buildStrategicBoardReport(representativeInput());
    const kpis = allKpis(report);
    const byId = new Map(kpis.map((item) => [item.id, item]));

    expect(byId.get("plan-adoption")).toMatchObject({
      measurementType: "binary",
      reportingFrequency: "one_time",
      result: { displayValue: "Complete" },
    });
    expect(byId.get("visitor-upgrades")).toMatchObject({
      measurementType: "cumulative",
      reportingFrequency: "cumulative",
    });
    expect(byId.get("visitor-satisfaction")).toMatchObject({
      measurementType: "percentage",
      result: { numerator: 75, denominator: 100 },
    });
    expect(byId.get("skill-improvement")).toMatchObject({
      measurementType: "average",
      result: { value: 80, respondentCount: 10 },
    });
    expect(byId.get("workforce-participants")?.components).toHaveLength(2);
    expect(byId.get("audience-race-ethnicity")?.demographics).toMatchObject({
      respondentTotal: 100,
      bands: [{ label: "White" }, { label: "Non-white audience" }],
    });
    expect(byId.get("revenue-by-stream")?.revenueBreakdown).toMatchObject({
      totalRevenue: 1_000_000,
      streams: [{ label: "Admissions" }, { label: "Grants" }],
    });
    expect(byId.get("average-dwell-time")).toMatchObject({
      configurationStatus: "needs_target",
      unresolvedReasons: ["Timing methodology has not been approved."],
    });
    expect(byId.get("annual-workshops")?.reportingFrequency).toBe("annual");
    expect(byId.get("attendance-yoy")?.measurementType).toBe("year_over_year");
  });

  it("preserves a valid zero target and distinguishes it from a missing target", () => {
    const report = buildStrategicBoardReport(representativeInput());
    const byId = new Map(allKpis(report).map((item) => [item.id, item]));
    const zeroTarget = byId.get("plan-adoption")?.fullPlanProgress;
    const missingTarget = byId.get("average-dwell-time")?.fullPlanProgress;

    expect(zeroTarget).toMatchObject({
      targetValue: 0,
      hasTarget: true,
      actualValue: 0,
      actualProgressPercentage: 100,
      displayProgressPercentage: 100,
      targetYear: 2027,
    });
    expect(missingTarget).toMatchObject({
      targetValue: null,
      hasTarget: false,
      actualProgressPercentage: null,
      displayProgressPercentage: null,
      status: "target_not_finalized",
      targetYear: null,
      targetDisplayText: "Target not finalized",
    });
  });

  it("preserves uncapped over-target progress while capping only display progress", () => {
    const report = buildStrategicBoardReport(representativeInput());
    const progress = allKpis(report).find(
      (item) => item.id === "visitor-upgrades",
    )?.fullPlanProgress;
    expect(progress).toMatchObject({
      actualValue: 6,
      targetValue: 5,
      actualProgressPercentage: 120,
      displayProgressPercentage: 100,
      isExceeded: true,
      status: "exceeded",
      targetYear: 2029,
      targetDescription: "Complete five visitor amenity upgrades by 2029",
    });
  });

  it("sanitizes non-finite numbers, blank/control text, duplicates, and invalid enums", () => {
    const raw = representativeInput();
    const invalid = raw.priorities?.[0].goals?.[1].kpis?.[0];
    if (invalid) {
      (invalid as unknown as { boardStatus: string }).boardStatus = "green";
      (invalid as unknown as { measurementType: string }).measurementType = "manual";
      (invalid as unknown as { reportingFrequency: string }).reportingFrequency =
        "sometimes";
    }
    const report = buildStrategicBoardReport(raw);
    const unresolved = allKpis(report).find(
      (item) => item.id === "average-dwell-time",
    );

    expect(unresolved).toMatchObject({
      name: "Average visitor dwell time",
      measurementType: "unknown",
      reportingFrequency: "unknown",
      boardStatus: "not_reported",
      result: {
        value: null,
        displayValue: "Not reported",
        numerator: null,
        respondentCount: null,
      },
      unresolvedReasons: ["Timing methodology has not been approved."],
    });
    expect(report.unresolvedReasons).toEqual([
      "One goal needs target configuration.",
      "Dwell-time goal excluded pending a target.",
      "Target is not finalized.",
      "Timing methodology has not been approved.",
    ]);
    assertDeepSerializable(report);
    expect(() => JSON.stringify(report)).not.toThrow();
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("sanitizes invalid summary inputs without inventing completion percentages", () => {
    const report = buildStrategicBoardReport({
      organizationName: "\u0000 ",
      selectedYear: Number.POSITIVE_INFINITY,
      organizationGoalCompletion: {
        completedGoalsCount: Number.NaN,
        totalEligibleGoalsCount: -4,
        completionPercentage: Number.POSITIVE_INFINITY,
        excludedGoalsCount: -1,
      },
      priorities: null,
    });
    expect(report).toEqual({
      organizationName: "Eastern State",
      selectedYear: null,
      reportingPeriod: "Full year",
      organizationGoalCompletion: {
        completedGoalsCount: 0,
        totalEligibleGoalsCount: 0,
        completionPercentage: null,
        excludedGoalsCount: 0,
        excludedGoalReasons: [],
        countLabel: "0 of 0 goals completed",
      },
      priorities: [],
      unresolvedReasons: [],
    });
  });

  describe("CSV equality contract", () => {
    it("flattens only the sanitized view model and exposes the full contract", () => {
      const input = representativeInput();
      const report = buildStrategicBoardReport(input);
      const csv = buildStrategicBoardCsvExport(report);

      expect(csv.columns).toBe(STRATEGIC_BOARD_CSV_COLUMNS);
      expect(csv.filename).toBe("eastern-state-strategic-board-2027.csv");
      expect(csv.rows).toEqual(buildStrategicBoardCsvRows(report));
      expect(csv.rows).toHaveLength(13);
      for (const row of csv.rows) {
        expect(Object.keys(row)).toEqual([...STRATEGIC_BOARD_CSV_COLUMNS]);
        assertDeepSerializable(row);
      }

      // Mutating the unsanitized input after report creation cannot alter the
      // export: the CSV builder receives only the shared view model.
      const rawProgress = input.priorities?.[0].goals?.[0].kpis?.find(
        (item) => item.id === "visitor-upgrades",
      )?.fullPlanProgress;
      if (rawProgress) rawProgress.actualProgressPercentage = 9_999;
      const cumulativeRow = csv.rows.find(
        (row) => row.Measure === "Visitor amenity upgrades",
      );
      expect(cumulativeRow?.["Full Plan Actual Progress Percentage"]).toBe(120);
    });

    it("copies UI KPI, target, status, result, and progress fields exactly", () => {
      const report = buildStrategicBoardReport(representativeInput());
      const rows = buildStrategicBoardCsvRows(report);

      for (const priority of report.priorities) {
        for (const goal of priority.goals) {
          for (const item of goal.kpis) {
            const row = rows.find((candidate) => candidate["Measure ID"] === item.id);
            expect(row, `Missing CSV row for ${item.name}`).toBeDefined();
            expect(row).toMatchObject({
              "Selected Year": report.selectedYear,
              "Reporting Period": report.reportingPeriod,
              Organization: report.organizationName,
              Priority: priority.name,
              Goal: goal.name,
              "Measure ID": item.id,
              Measure: item.name,
              "Measurement Type": item.measurementType,
              "Reporting Frequency": item.reportingFrequency,
              Unit: item.unit,
              "Result State": item.result.state,
              "Calculated Result": item.result.displayValue,
              "Calculated Numeric Value": item.result.value,
              "Amount Measured": item.result.numerator,
              "Total Amount": item.result.denominator,
              "Respondent Count": item.result.respondentCount,
              "How Calculated": item.result.formulaExplanation,
              "Board Status": item.boardStatus,
              "Setup Status": item.configurationStatus,
              "Full Plan Actual": item.fullPlanProgress?.actualValue ?? null,
              "Full Plan Target": item.fullPlanProgress?.targetValue ?? null,
              "Full Plan Has Target": item.fullPlanProgress?.hasTarget ?? null,
              "Full Plan Actual Progress Percentage":
                item.fullPlanProgress?.actualProgressPercentage ?? null,
              "Full Plan Display Progress Percentage":
                item.fullPlanProgress?.displayProgressPercentage ?? null,
              "Full Plan Target Description":
                item.fullPlanProgress?.targetDescription ?? null,
            });
          }
        }
      }
    });

    it("copies component, demographic, and revenue details without recalculation", () => {
      const report = buildStrategicBoardReport(representativeInput());
      const rows = buildStrategicBoardCsvRows(report);

      expect(
        rows.filter((row) => row["Detail Type"] === "component"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            "Detail Name": "Participants enrolled",
            "Detail Result": "24 people",
            "Detail Numeric Value": 24,
            "Detail Target": 20,
            "Detail Actual Progress Percentage": 120,
            "Detail Display Progress Percentage": 100,
          }),
          expect.objectContaining({
            "Detail Name": "Participants graduating",
            "Detail Result": "75%",
            "Detail Numeric Value": 75,
            "Detail Target": 80,
            "Detail Actual Progress Percentage": 93.75,
          }),
        ]),
      );
      expect(
        rows.filter((row) => row["Detail Type"] === "demographic_band"),
      ).toEqual([
        expect.objectContaining({
          "Detail Name": "White",
          "Detail Count": 60,
          "Detail Percentage": 60,
          "Demographic Respondent Total": 100,
          "Derived Non-White Percentage": 40,
          "Demographic Population Caveat":
            "Survey respondents are not assumed to represent every visitor.",
        }),
        expect.objectContaining({
          "Detail Name": "Non-white audience",
          "Detail Count": 40,
          "Detail Percentage": 40,
          "Demographic Respondent Total": 100,
          "Derived Non-White Percentage": 40,
        }),
      ]);
      expect(
        rows.filter((row) => row["Detail Type"] === "revenue_stream"),
      ).toEqual([
        expect.objectContaining({
          "Detail Name": "Admissions",
          "Revenue Total": 1_000_000,
          "Revenue Stream Value": 600_000,
          "Revenue Stream Share Percentage": 60,
        }),
        expect.objectContaining({
          "Detail Name": "Grants",
          "Revenue Total": 1_000_000,
          "Revenue Stream Value": 400_000,
          "Revenue Stream Share Percentage": 40,
        }),
      ]);
    });

    it("keeps zero and missing targets distinct in CSV", () => {
      const rows = buildStrategicBoardCsvRows(
        buildStrategicBoardReport(representativeInput()),
      );
      const zero = rows.find((row) => row.Measure === "Interpretive plan adopted");
      const missing = rows.find(
        (row) => row.Measure === "Average visitor dwell time",
      );
      expect(zero).toMatchObject({
        "Full Plan Target": 0,
        "Full Plan Has Target": true,
        "Full Plan Actual Progress Percentage": 100,
      });
      expect(missing).toMatchObject({
        "Full Plan Target": null,
        "Full Plan Has Target": false,
        "Full Plan Actual Progress Percentage": null,
        "Full Plan Target Display Text": "Target not finalized",
      });
    });
  });
});

describe("strategic board CSV text", () => {
  it("serializes the sanitized report with stable columns and escaped text", () => {
    const input = representativeInput();
    input.priorities![0]!.goals![0]!.kpis![0]!.name = 'Plan, "adoption"';
    const report = buildStrategicBoardReport(input);
    const output = buildStrategicBoardCsvText(report);

    expect(output.filename).toBe("eastern-state-strategic-board-2027.csv");
    expect(output.csv.split("\r\n")[0]).toContain("Selected Year");
    expect(output.csv).toContain('"Plan, ""adoption"""');
    expect(output.csv).not.toMatch(/\b(?:NaN|undefined|Infinity)\b/);
  });

  it.each([
    ["=1+1", "'=1+1"],
    ["+SUM(1,1)", '"\'+SUM(1,1)"'],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\tinjected tab", "'\tinjected tab"],
    ["\rinjected CR", '"\'\rinjected CR"'],
  ])("neutralizes spreadsheet-formula KPI text beginning with %j", (name, escaped) => {
    const report = buildStrategicBoardReport(representativeInput());
    report.priorities[0]!.goals[0]!.kpis[0]!.name = name;

    const output = buildStrategicBoardCsvText(report);

    expect(output.csv).toContain(escaped);
  });
});
