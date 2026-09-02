import { z } from "zod";
import { publicIdentifierSchema } from "./public-identifier.validator";

const visibleText = (value: string): boolean => /[\p{L}\p{N}\p{P}\p{S}]/u.test(value);
const reasonSchema = z.string().trim().min(1).max(500).refine(visibleText);
const dateTimeSchema = z
  .union([z.date(), z.string().datetime({ offset: true })])
  .transform((value) => (value instanceof Date ? value : new Date(value)));
const calendarDateSchema = z
  .union([z.date(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
  .transform((value, context) => {
    if (value instanceof Date) return value;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid calendar date" });
      return z.NEVER;
    }
    return parsed;
  });
const shopPublicIdSchema = publicIdentifierSchema
  .refine((value) => value.kind === "SHOP", "Shop public identifier is required")
  .transform((value) => value.publicId);

const directAssignmentSchema = z
  .object({
    shopPublicId: shopPublicIdSchema,
    amountJpy: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    shareBps: z.number().int().min(0).max(10_000).optional()
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.amountJpy === undefined) === (value.shareBps === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of amountJpy or shareBps"
      });
    }
  });

const configurableFields = {
  categoryCode: z.enum(["personnel", "server", "third_party_api", "other"]),
  name: z.string().trim().min(1).max(160).refine(visibleText),
  amountJpy: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  periodStart: calendarDateSchema,
  periodEnd: calendarDateSchema,
  allocationMode: z.enum(["equal_active_shops", "platform_income_proportional", "direct_shops"]),
  directAssignments: z.array(directAssignmentSchema).min(1).max(500).optional(),
  effectiveAt: dateTimeSchema,
  reason: reasonSchema
} as const;

const validateConfiguration = (
  value: {
    amountJpy: number;
    periodStart: Date;
    periodEnd: Date;
    allocationMode: "equal_active_shops" | "platform_income_proportional" | "direct_shops";
    directAssignments?: Array<{
      shopPublicId: string;
      amountJpy?: number;
      shareBps?: number;
    }>;
  },
  context: z.RefinementCtx
): void => {
  if (value.periodEnd.getTime() < value.periodStart.getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "periodEnd must not precede periodStart"
    });
  }
  const assignments = value.directAssignments;
  if (value.allocationMode !== "direct_shops") {
    if (assignments !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "directAssignments are only valid for direct_shops"
      });
    }
    return;
  }
  if (!assignments?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "directAssignments are required" });
    return;
  }
  if (
    new Set(assignments.map((assignment) => assignment.shopPublicId)).size !== assignments.length
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate direct shop" });
  }
  const usesAmounts = assignments.every((assignment) => assignment.amountJpy !== undefined);
  const usesShares = assignments.every((assignment) => assignment.shareBps !== undefined);
  if (!usesAmounts && !usesShares) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Direct assignments cannot mix amount and share"
    });
    return;
  }
  if (usesAmounts) {
    const total = assignments.reduce(
      (sum, assignment) => sum + BigInt(assignment.amountJpy ?? 0),
      0n
    );
    if (total !== BigInt(value.amountJpy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Direct amounts must equal amountJpy"
      });
    }
  } else {
    const total = assignments.reduce((sum, assignment) => sum + (assignment.shareBps ?? 0), 0);
    if (total !== 10_000) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Direct shares must total 10000 bps"
      });
    }
  }
};

export const operatingCostListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().max(100).optional(),
    keyword: z.string().trim().max(160).optional(),
    categoryCode: configurableFields.categoryCode.optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    periodStart: calendarDateSchema.optional(),
    periodEnd: calendarDateSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.periodStart && value.periodEnd && value.periodEnd < value.periodStart) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid period range" });
    }
  });

export const operatingCostCreateBodySchema = z
  .object({
    costCode: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9][a-z0-9._-]*$/),
    ...configurableFields
  })
  .strict()
  .superRefine(validateConfiguration);

export const operatingCostUpdateBodySchema = z
  .object(configurableFields)
  .strict()
  .superRefine(validateConfiguration);

export const operatingCostParamSchema = z.object({ publicId: z.string().uuid() }).strict();

export const operatingCostPublishBodySchema = z.object({ reason: reasonSchema }).strict();
export const operatingCostDeleteBodySchema = z.object({ reason: reasonSchema }).strict();

export type OperatingCostListQuery = z.output<typeof operatingCostListQuerySchema>;
export type OperatingCostCreateBody = z.output<typeof operatingCostCreateBodySchema>;
export type OperatingCostUpdateBody = z.output<typeof operatingCostUpdateBodySchema>;
export type OperatingCostPublishBody = z.output<typeof operatingCostPublishBodySchema>;
export type OperatingCostDeleteBody = z.output<typeof operatingCostDeleteBodySchema>;
