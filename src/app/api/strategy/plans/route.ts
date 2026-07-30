import { type NextRequest, NextResponse } from "next/server";
import { z } from "@/lib/zod";
import { authErrorResponse, requireAdmin } from "@/features/auth/session";
import {
  addDraftMeasureBundle,
  addDraftTarget,
  archiveDraftPriority,
  cancelDraft,
  classifyDraftQuestion,
  copyDraftTarget,
  createSuccessorDraft,
  getPlanManagerModel,
  reviewPlanSection,
  recordDraftLineage,
  saveDraftBoardScope,
  saveReadinessOverride,
  updateDraftDetails,
  updateDraftItem,
} from "@/features/plans/server";
import {
  AddDraftMeasureBundleSchema,
  AddDraftTargetSchema,
  ArchiveDraftPrioritySchema,
  CancelDraftSchema,
  ClassifyDraftQuestionSchema,
  CopyDraftTargetSchema,
  CreateSuccessorDraftSchema,
  ReadinessOverrideSchema,
  ReviewPlanSectionSchema,
  RecordDraftLineageSchema,
  SaveDraftBoardScopeSchema,
  UpdateDraftDetailsSchema,
  UpdateDraftItemSchema,
} from "@/features/plans/validation";
import { assertMutationRequest } from "@/lib/request-guard";
import { readJsonBody } from "@/lib/request-body";
import { planErrorResponse } from "./_response";

const PlanMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), input: CreateSuccessorDraftSchema }).strict(),
  z.object({ action: z.literal("update_details"), input: UpdateDraftDetailsSchema }).strict(),
  z.object({ action: z.literal("add_measure_bundle"), input: AddDraftMeasureBundleSchema }).strict(),
  z.object({ action: z.literal("add_target"), input: AddDraftTargetSchema }).strict(),
  z.object({ action: z.literal("save_board_scope"), input: SaveDraftBoardScopeSchema }).strict(),
  z.object({ action: z.literal("update_item"), input: UpdateDraftItemSchema }).strict(),
  z.object({ action: z.literal("archive_priority"), input: ArchiveDraftPrioritySchema }).strict(),
  z.object({ action: z.literal("review_section"), input: ReviewPlanSectionSchema }).strict(),
  z.object({ action: z.literal("save_override"), input: ReadinessOverrideSchema }).strict(),
  z.object({ action: z.literal("cancel"), input: CancelDraftSchema }).strict(),
  z.object({ action: z.literal("classify_question"), input: ClassifyDraftQuestionSchema }).strict(),
  z.object({ action: z.literal("record_lineage"), input: RecordDraftLineageSchema }).strict(),
  z.object({ action: z.literal("copy_target"), input: CopyDraftTargetSchema }).strict(),
]);

/** Returns the Admin-only Plans workspace model. */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  try {
    return NextResponse.json({ plans: getPlanManagerModel() });
  } catch (error) {
    const response = planErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

/** Applies one optimistic, dashboard-driven Draft plan change. */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    return authErrorResponse(error);
  }
  const guard = assertMutationRequest(req);
  if (guard) return guard;
  const body = await readJsonBody(req);
  if (!body.ok) return body.response;
  const parsed = PlanMutationSchema.safeParse(body.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the highlighted plan information and try again.", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    switch (parsed.data.action) {
      case "create":
        createSuccessorDraft(parsed.data.input, user.id);
        break;
      case "update_details":
        updateDraftDetails(parsed.data.input, user.id);
        break;
      case "add_measure_bundle":
        addDraftMeasureBundle(parsed.data.input, user.id);
        break;
      case "add_target":
        addDraftTarget(parsed.data.input, user.id);
        break;
      case "save_board_scope":
        saveDraftBoardScope(parsed.data.input, user.id);
        break;
      case "update_item":
        updateDraftItem(parsed.data.input, user.id);
        break;
      case "archive_priority":
        archiveDraftPriority(parsed.data.input, user.id);
        break;
      case "review_section":
        reviewPlanSection(parsed.data.input, user.id);
        break;
      case "save_override":
        saveReadinessOverride(parsed.data.input, user.id);
        break;
      case "cancel":
        cancelDraft(parsed.data.input, user.id);
        break;
      case "classify_question":
        classifyDraftQuestion(parsed.data.input, user.id);
        break;
      case "record_lineage":
        recordDraftLineage(parsed.data.input, user.id);
        break;
      case "copy_target":
        copyDraftTarget(parsed.data.input, user.id);
        break;
    }
    return NextResponse.json({ plans: getPlanManagerModel() });
  } catch (error) {
    const response = planErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
