import { z } from "@/lib/zod";

const NameSchema = z.string().trim().min(1).max(200);
const ShortNameSchema = z.string().trim().min(1).max(80);
const OptionalTextSchema = z.string().trim().min(1).max(4_000).nullable();
const YearSchema = z.number().int().min(1900).max(2100);

const planSettingsUpdateShape = {
  expectedRevision: z.number().int().positive(),
  organizationName: NameSchema,
  organizationShortName: ShortNameSchema,
  planName: NameSchema,
  planDescription: OptionalTextSchema,
  startYear: YearSchema,
  endYear: YearSchema,
  sourceReference: OptionalTextSchema,
};

/** Implements the plan ends after it starts operation. */
function planEndsAfterItStarts(input: { startYear: number; endYear: number }) {
  return input.startYear <= input.endYear;
}

const planRangeIssue = {
  path: ["endYear"],
  message: "Plan end year must be on or after its start year.",
};

export const PlanSettingsUpdateSchema = z
  .object(planSettingsUpdateShape)
  .strict()
  .refine(planEndsAfterItStarts, planRangeIssue);

export const PlanSettingsUpdateActionSchema = z
  .object({
    action: z.literal("update_plan"),
    ...planSettingsUpdateShape,
  })
  .strict()
  .refine(planEndsAfterItStarts, planRangeIssue);

export type PlanSettingsUpdate = z.infer<typeof PlanSettingsUpdateSchema>;
