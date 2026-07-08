import { z } from "zod";

export const CreateGoalSchema = z
  .object({
    kpi_id: z.number().int().positive(),
    target_year: z.number().int().min(2000).max(2100),
    baseline_year: z.number().int().min(1900).max(2100).optional(),
    goal_type: z.enum(["pct", "number"]),
    target_value: z.number().finite(),
    enabled: z.boolean().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine(
    (goal) =>
      goal.baseline_year === undefined ||
      goal.baseline_year < goal.target_year,
    {
      path: ["baseline_year"],
      message: "Baseline year must precede target year.",
    },
  );

export const PatchGoalSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
  baseline_year: z.number().int().min(1900).max(2100).optional(),
  goal_type: z.enum(["pct", "number"]).optional(),
  target_value: z.number().finite().optional(),
  notes: z.string().nullable().optional(),
});

export const DeleteGoalSchema = z.object({ id: z.number().int().positive() });

export function parseGoalListParams(searchParams: URLSearchParams): {
  throughMonth?: number;
  year?: number;
  asOfYear?: number;
} {
  const throughMonthRaw = searchParams.get("throughMonth");
  const throughMonth =
    throughMonthRaw !== null && Number.isFinite(Number(throughMonthRaw))
      ? Math.max(1, Math.min(12, Math.round(Number(throughMonthRaw))))
      : undefined;
  const yearRaw = searchParams.get("year");
  const year =
    yearRaw !== null && Number.isFinite(Number(yearRaw))
      ? Math.round(Number(yearRaw))
      : undefined;
  const asOfYearRaw = searchParams.get("asOfYear");
  const asOfYear =
    asOfYearRaw !== null && Number.isFinite(Number(asOfYearRaw))
      ? Math.round(Number(asOfYearRaw))
      : undefined;
  return { throughMonth, year, asOfYear };
}
