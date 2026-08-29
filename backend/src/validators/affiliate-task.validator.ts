import { z } from "zod";
import { CONTENT_LOCALES } from "../constants/content-locales";

const taskStatuses = [
  "draft",
  "pending_review",
  "scheduled",
  "active",
  "paused",
  "budget_exhausted",
  "ended",
  "cancelled",
  "rejected"
] as const;

const publisherTypes = ["merchant_account", "shop"] as const;

const paginationShape = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const editableTaskShape = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10_000).nullable(),
  coverMediaAssetId: z.number().int().positive().nullable(),
  rewardNdpPerCompletedOrder: z.number().int().positive().max(100_000_000),
  totalBudgetNdp: z.number().int().positive().max(2_000_000_000),
  customerDiscountType: z.enum(["none", "fixed_jpy", "percent"]),
  fixedDiscountJpy: z.number().int().min(0).max(100_000_000),
  discountRateBps: z.number().int().min(0).max(10_000),
  discountCapJpy: z.number().int().min(0).max(100_000_000),
  minimumOrderAmountJpy: z.number().int().min(0).max(100_000_000),
  claimStartsAt: z.coerce.date(),
  claimEndsAt: z.coerce.date(),
  taskStartsAt: z.coerce.date(),
  taskEndsAt: z.coerce.date(),
  attributionWindowDays: z.number().int().min(1).max(365),
  maxCompletedOrdersPerClaim: z.number().int().positive().max(1_000_000).nullable(),
  maxCompletedOrdersPerCustomer: z.number().int().positive().max(1_000_000).nullable(),
  serviceScopeMode: z.enum(["all_current_services", "selected_services"]),
  selectedServiceIds: z.array(z.number().int().positive()).max(10_000)
};

type EditableTaskContract = {
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  customerDiscountType: "none" | "fixed_jpy" | "percent";
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
  claimStartsAt: Date;
  claimEndsAt: Date;
  taskStartsAt: Date;
  taskEndsAt: Date;
  serviceScopeMode: "all_current_services" | "selected_services";
  selectedServiceIds: number[];
  shopIds?: number[];
};

const addTaskIssue = (
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string
) => context.addIssue({ code: z.ZodIssueCode.custom, path, message });

const validateEditableTask = (
  value: EditableTaskContract,
  context: z.RefinementCtx
): void => {
  if (value.totalBudgetNdp < value.rewardNdpPerCompletedOrder) {
    addTaskIssue(context, ["totalBudgetNdp"], "total budget must cover at least one reward");
  }

  const validDiscount =
    (value.customerDiscountType === "none" &&
      value.fixedDiscountJpy === 0 &&
      value.discountRateBps === 0 &&
      value.discountCapJpy === 0) ||
    (value.customerDiscountType === "fixed_jpy" &&
      value.fixedDiscountJpy > 0 &&
      value.discountRateBps === 0 &&
      value.discountCapJpy === 0) ||
    (value.customerDiscountType === "percent" &&
      value.fixedDiscountJpy === 0 &&
      value.discountRateBps >= 1 &&
      value.discountRateBps <= 10_000 &&
      value.discountCapJpy > 0);
  if (!validDiscount) {
    addTaskIssue(context, ["customerDiscountType"], "discount fields do not match type");
  }

  if (
    value.taskStartsAt >= value.taskEndsAt ||
    value.claimStartsAt < value.taskStartsAt ||
    value.claimStartsAt >= value.claimEndsAt ||
    value.claimEndsAt > value.taskEndsAt
  ) {
    addTaskIssue(context, ["taskEndsAt"], "task and claim windows are invalid");
  }

  if (new Set(value.selectedServiceIds).size !== value.selectedServiceIds.length) {
    addTaskIssue(context, ["selectedServiceIds"], "service ids must be unique");
  }
  if (
    value.serviceScopeMode === "selected_services" &&
    value.selectedServiceIds.length === 0
  ) {
    addTaskIssue(context, ["selectedServiceIds"], "selected services are required");
  }
  if (
    value.serviceScopeMode === "all_current_services" &&
    value.selectedServiceIds.length > 0
  ) {
    addTaskIssue(context, ["selectedServiceIds"], "all current services rejects explicit ids");
  }
  if (value.shopIds && new Set(value.shopIds).size !== value.shopIds.length) {
    addTaskIssue(context, ["shopIds"], "shop ids must be unique");
  }
};

const shopCreateSchema = z
  .object({
    publisherType: z.literal("shop"),
    sourceLocale: z.enum(CONTENT_LOCALES).optional(),
    ...editableTaskShape
  })
  .strict();

const merchantAccountCreateSchema = z
  .object({
    publisherType: z.literal("merchant_account"),
    sourceLocale: z.enum(CONTENT_LOCALES).optional(),
    merchantAccountId: z.number().int().positive(),
    shopIds: z.array(z.number().int().positive()).min(1).max(1_000),
    ...editableTaskShape
  })
  .strict();

export const createAffiliateTaskBodySchema = z
  .discriminatedUnion("publisherType", [shopCreateSchema, merchantAccountCreateSchema])
  .superRefine(validateEditableTask);

export const updateAffiliateTaskBodySchema = z
  .object({
    lockVersion: z.number().int().positive(),
    shopIds: z.array(z.number().int().positive()).min(1).max(1_000).optional(),
    ...editableTaskShape
  })
  .strict()
  .superRefine(validateEditableTask);

export const affiliateTaskIdParamSchema = z
  .object({ taskId: z.coerce.number().int().positive() })
  .strict();

export const affiliateTaskLocaleParamSchema = z
  .object({
    taskId: z.coerce.number().int().positive(),
    locale: z.enum(CONTENT_LOCALES)
  })
  .strict();

export const updateAffiliateTaskTranslationBodySchema = z
  .object({
    lockVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(10_000).nullable(),
    syncToAll: z.boolean().default(false)
  })
  .strict();

export const affiliateTaskListQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(taskStatuses).optional(),
    publisherType: z.enum(publisherTypes).optional(),
    keyword: z.string().trim().min(1).max(160).optional()
  })
  .strict();

export const backofficeAffiliateTaskListQuerySchema = z
  .object({
    ...paginationShape,
    status: z.enum(taskStatuses).optional(),
    publisherType: z.enum(publisherTypes).optional(),
    keyword: z.string().trim().min(1).max(160).optional(),
    merchantAccountId: z.coerce.number().int().positive().optional(),
    shopId: z.coerce.number().int().positive().optional()
  })
  .strict();

export const rejectAffiliateTaskBodySchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type CreateAffiliateTaskBody = z.infer<typeof createAffiliateTaskBodySchema>;
export type UpdateAffiliateTaskBody = z.infer<typeof updateAffiliateTaskBodySchema>;
export type AffiliateTaskIdParams = z.infer<typeof affiliateTaskIdParamSchema>;
export type AffiliateTaskLocaleParams = z.infer<typeof affiliateTaskLocaleParamSchema>;
export type UpdateAffiliateTaskTranslationBody = z.infer<
  typeof updateAffiliateTaskTranslationBodySchema
>;
export type AffiliateTaskListQuery = z.infer<typeof affiliateTaskListQuerySchema>;
export type BackofficeAffiliateTaskListQuery = z.infer<
  typeof backofficeAffiliateTaskListQuerySchema
>;
export type RejectAffiliateTaskBody = z.infer<typeof rejectAffiliateTaskBodySchema>;
