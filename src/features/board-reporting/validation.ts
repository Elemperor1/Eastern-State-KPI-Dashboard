import { z } from "@/lib/zod";

export const BoardReportingScopeUpdateSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  priorities: z.array(
    z.object({
      priorityId: z.number().int().positive(),
      displayTitle: z.string().trim().min(1, "Enter a Board title.").max(240),
      statements: z.array(
        z.object({
          text: z.string().trim().min(1, "Enter a focus statement.").max(1_000),
          kpiIds: z.array(z.number().int().positive()).max(100),
        }).strict(),
      ).max(50),
    }).strict(),
  ).max(50),
}).strict().superRefine((value, ctx) => {
  const priorityIds = new Set<number>();
  value.priorities.forEach((priority, priorityIndex) => {
    if (priorityIds.has(priority.priorityId)) {
      ctx.addIssue({
        code: "custom",
        path: ["priorities", priorityIndex, "priorityId"],
        message: "Each priority can appear only once.",
      });
    }
    priorityIds.add(priority.priorityId);
    priority.statements.forEach((statement, statementIndex) => {
      if (new Set(statement.kpiIds).size !== statement.kpiIds.length) {
        ctx.addIssue({
          code: "custom",
          path: ["priorities", priorityIndex, "statements", statementIndex, "kpiIds"],
          message: "A measure can be linked only once per statement.",
        });
      }
    });
  });
});

export type BoardReportingScopeUpdate = z.infer<typeof BoardReportingScopeUpdateSchema>;
