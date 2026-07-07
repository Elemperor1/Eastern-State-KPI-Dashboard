import { z } from "zod";

export const CreateGoalSchema = z.object({
  kpi_id: z.number().int().positive(),
  target_year: z.number().int().min(2000).max(2100),
  goal_type: z.enum(["pct", "number"]),
  target_value: z.number().finite(),
  enabled: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const PatchGoalSchema = z.object({
  id: z.number().int().positive(),
  enabled: z.boolean(),
  goal_type: z.enum(["pct", "number"]).optional(),
  target_value: z.number().finite().optional(),
  notes: z.string().nullable().optional(),
});

export const DeleteGoalSchema = z.object({ id: z.number().int().positive() });

export function parseGoalListParams(searchParams: URLSearchParams): {
  throughMonth?: number;
  year?: number;
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
  return { throughMonth, year };
}
