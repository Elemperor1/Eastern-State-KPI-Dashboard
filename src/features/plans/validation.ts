import { z } from "@/lib/zod";

const NameSchema = z.string().trim().min(1).max(200);
const OptionalTextSchema = z.string().trim().min(1).max(4_000).nullable();
const YearSchema = z.number().int().min(1900).max(2100);

export const CreateSuccessorDraftSchema = z
  .object({
    creationMethod: z.enum(["blank", "structural_clone"]),
    name: NameSchema,
    description: OptionalTextSchema,
    endYear: YearSchema,
    approvalSource: OptionalTextSchema,
  })
  .strict();

export const UpdateDraftDetailsSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    expectedPlanRevision: z.number().int().positive(),
    name: NameSchema,
    description: OptionalTextSchema,
    endYear: YearSchema,
    approvalSource: OptionalTextSchema,
  })
  .strict();

export const ReviewPlanSectionSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    expectedSectionUpdatedAt: z.string().min(1),
    section: z.enum(["plan_details", "plan_structure", "targets_board"]),
  })
  .strict();

export const ReadinessOverrideSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    requirementKey: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const CancelDraftSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    confirmationName: NameSchema,
  })
  .strict();

export const ActivateDraftSchema = z
  .object({
    activationId: z.uuid(),
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    confirmationName: NameSchema,
    acknowledgeWarnings: z.boolean(),
  })
  .strict();

export const AddDraftMeasureBundleSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    priorityName: NameSchema,
    goalName: NameSchema,
    goalOwner: z.string().trim().max(200).nullable(),
    measureName: NameSchema,
    measureOwner: z.string().trim().max(200).nullable(),
    unit: z.string().trim().min(1).max(80),
    unitType: z.enum(["count", "percent", "currency", "attendance"]),
    reportingFrequency: z.enum(["monthly", "annual", "flexible"]),
    direction: z.enum(["higher", "lower", "neutral"]),
  })
  .strict();

export const AddDraftTargetSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    kpiId: z.number().int().positive(),
    expectedKpiUpdatedAt: z.string().min(1),
    expectedTargetUpdatedAt: z.string().min(1).nullable(),
    targetValue: z.number().finite(),
    sourceReference: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const CopyDraftTargetSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    kpiId: z.number().int().positive(),
    expectedKpiUpdatedAt: z.string().min(1),
    predecessorTargetId: z.number().int().positive(),
  })
  .strict();

const DraftBoardStatementSchema = z
  .object({
    id: z.number().int().positive().nullable(),
    text: z.string().trim().min(1).max(1_000),
    kpiIds: z.array(z.number().int().positive()).min(1),
  })
  .strict()
  .refine((value) => new Set(value.kpiIds).size === value.kpiIds.length, {
    message: "A Measure may appear only once in one focus statement.",
  });

export const SaveDraftBoardScopeSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    expectedBoardRevision: z.number().int().nonnegative(),
    intentionalEmpty: z.boolean(),
    confirmationName: NameSchema.nullable(),
    reviewedPriorityIds: z.array(z.number().int().positive()),
    priorities: z.array(
      z.object({
        id: z.number().int().positive().nullable(),
        priorityId: z.number().int().positive(),
        displayTitle: z.string().trim().min(1).max(240),
        statements: z.array(DraftBoardStatementSchema).min(1),
      }).strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.priorities.map((priority) => priority.priorityId)).size !== value.priorities.length) {
      context.addIssue({
        code: "custom",
        message: "Each Board Priority may appear only once.",
        path: ["priorities"],
      });
    }
    if (
      new Set(value.reviewedPriorityIds).size !==
      value.reviewedPriorityIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Each reviewed Board Priority may appear only once.",
      });
    }
    if (
      value.reviewedPriorityIds.some(
        (priorityId) =>
          !value.priorities.some(
            (priority) => priority.priorityId === priorityId,
          ),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Review only Board Priorities included in this save.",
      });
    }
    if (value.intentionalEmpty) {
      if (value.priorities.length > 0 || value.confirmationName === null) {
        context.addIssue({
          code: "custom",
          message: "Confirm an empty Board report separately.",
        });
      }
    } else if (value.priorities.length === 0 || value.confirmationName !== null) {
      context.addIssue({
        code: "custom",
        message: "Include at least one reviewed Board Priority.",
      });
    }
  });

export const UpdateDraftItemSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    expectedRecordUpdatedAt: z.string().min(1),
    itemKind: z.enum(["priority", "goal", "measure"]),
    itemId: z.number().int().positive(),
    name: NameSchema,
    owner: z.string().trim().max(200).nullable(),
  })
  .strict();

export const ArchiveDraftPrioritySchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    expectedRecordUpdatedAt: z.string().min(1),
    priorityId: z.number().int().positive(),
  })
  .strict();

export const ClassifyDraftQuestionSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    expectedRecordUpdatedAt: z.string().min(1),
    itemKind: z.enum(["goal", "measurement_config", "component"]),
    itemId: z.number().int().positive(),
    decision: z.enum(["resolve_now", "follow_up"]),
    explanation: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const RecordDraftLineageSchema = z
  .object({
    planId: z.number().int().positive(),
    expectedWholePlanRevision: z.number().int().positive(),
    itemKind: z.enum(["priority", "goal", "kpi"]),
    successorItemId: z.number().int().positive(),
    relationshipType: z.enum(["copied_from", "merged_from", "split_from"]),
    predecessorItemIds: z.array(z.number().int().positive()).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.predecessorItemIds).size !==
      value.predecessorItemIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Choose each predecessor item only once.",
      });
    }
    if (
      value.relationshipType !== "merged_from" &&
      value.predecessorItemIds.length !== 1
    ) {
      context.addIssue({
        code: "custom",
        message: "Copied from and Split from each use one predecessor item.",
      });
    }
    if (
      value.relationshipType === "merged_from" &&
      value.predecessorItemIds.length < 2
    ) {
      context.addIssue({
        code: "custom",
        message: "Merged from requires at least two predecessor items.",
      });
    }
  });

export type CreateSuccessorDraftInput = z.input<
  typeof CreateSuccessorDraftSchema
>;
export type UpdateDraftDetailsInput = z.input<typeof UpdateDraftDetailsSchema>;
export type ReviewPlanSectionInput = z.input<typeof ReviewPlanSectionSchema>;
export type ReadinessOverrideInput = z.input<typeof ReadinessOverrideSchema>;
export type CancelDraftInput = z.input<typeof CancelDraftSchema>;
export type ActivateDraftInput = z.input<typeof ActivateDraftSchema>;
export type AddDraftMeasureBundleInput = z.input<
  typeof AddDraftMeasureBundleSchema
>;
export type AddDraftTargetInput = z.input<typeof AddDraftTargetSchema>;
export type CopyDraftTargetInput = z.input<typeof CopyDraftTargetSchema>;
export type SaveDraftBoardScopeInput = z.input<
  typeof SaveDraftBoardScopeSchema
>;
export type UpdateDraftItemInput = z.input<typeof UpdateDraftItemSchema>;
export type ArchiveDraftPriorityInput = z.input<
  typeof ArchiveDraftPrioritySchema
>;
export type ClassifyDraftQuestionInput = z.input<
  typeof ClassifyDraftQuestionSchema
>;
export type RecordDraftLineageInput = z.input<
  typeof RecordDraftLineageSchema
>;
