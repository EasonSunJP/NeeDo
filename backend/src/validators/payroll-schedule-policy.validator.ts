import { z } from "zod";
import { publicIdentifierSchema } from "./public-identifier.validator";

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");

const cadenceSchema = z.enum(["daily", "weekly", "monthly"]);
const holidayAdjustmentSchema = z.enum(["previous_business_day", "next_business_day"]);
const timezoneSchema = z.literal("Asia/Tokyo");

function validateCadenceFields(
  value: {
    cadence: z.infer<typeof cadenceSchema>;
    weeklySettlementWeekday: number | null;
    monthlySettlementDay: number | null;
  },
  context: z.RefinementCtx
) {
  if (value.cadence === "daily") {
    if (value.weeklySettlementWeekday !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weeklySettlementWeekday"],
        message: "weeklySettlementWeekday must be null for daily cadence"
      });
    }
    if (value.monthlySettlementDay !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlySettlementDay"],
        message: "monthlySettlementDay must be null for daily cadence"
      });
    }
  }

  if (value.cadence === "weekly") {
    if (value.weeklySettlementWeekday === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weeklySettlementWeekday"],
        message: "weeklySettlementWeekday is required for weekly cadence"
      });
    }
    if (value.monthlySettlementDay !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlySettlementDay"],
        message: "monthlySettlementDay must be null for weekly cadence"
      });
    }
  }

  if (value.cadence === "monthly") {
    if (value.monthlySettlementDay === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["monthlySettlementDay"],
        message: "monthlySettlementDay is required for monthly cadence"
      });
    }
    if (value.weeklySettlementWeekday !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["weeklySettlementWeekday"],
        message: "weeklySettlementWeekday must be null for monthly cadence"
      });
    }
  }
}

const baseRuleFields = {
  cadence: cadenceSchema,
  weeklySettlementWeekday: z.number().int().min(1).max(7).nullable(),
  monthlySettlementDay: z.number().int().min(1).max(31).nullable(),
  holidayAdjustment: holidayAdjustmentSchema,
  timezone: timezoneSchema,
  effectiveFrom: dateKeySchema,
  effectiveTo: dateKeySchema.nullable().optional().default(null)
};

export const shopPayrollSchedulePolicyBodySchema = z
  .object(baseRuleFields)
  .strict()
  .superRefine((value, context) => {
    validateCadenceFields(value, context);
    if (value.effectiveTo !== null && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "effectiveTo must not be before effectiveFrom"
      });
    }
  });

export const employeePayrollSchedulePolicyBodySchema = z
  .object({
    inheritShopPolicy: z.boolean(),
    cadence: cadenceSchema.nullable(),
    weeklySettlementWeekday: z.number().int().min(1).max(7).nullable(),
    monthlySettlementDay: z.number().int().min(1).max(31).nullable(),
    holidayAdjustment: holidayAdjustmentSchema.nullable(),
    timezone: timezoneSchema.nullable(),
    effectiveFrom: dateKeySchema,
    effectiveTo: dateKeySchema.nullable().optional().default(null)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effectiveTo !== null && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "effectiveTo must not be before effectiveFrom"
      });
    }

    if (value.inheritShopPolicy) {
      for (const field of [
        "cadence",
        "weeklySettlementWeekday",
        "monthlySettlementDay",
        "holidayAdjustment",
        "timezone"
      ] as const) {
        if (value[field] !== null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} must be null when inheriting the shop policy`
          });
        }
      }
      return;
    }

    if (value.cadence === null || value.holidayAdjustment === null || value.timezone === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A complete payroll schedule rule is required when inheritance is disabled"
      });
      return;
    }

    validateCadenceFields(
      {
        cadence: value.cadence,
        weeklySettlementWeekday: value.weeklySettlementWeekday,
        monthlySettlementDay: value.monthlySettlementDay
      },
      context
    );
  });

const technicianPublicIdSchema = publicIdentifierSchema
  .refine((value) => value.kind === "S", "Technician NeeDoID is required")
  .transform((value) => value.publicId);

export const employeePayrollSchedulePolicyParamSchema = z
  .object({ needoId: technicianPublicIdSchema })
  .strict();

export const payrollSchedulePolicyQuerySchema = z
  .object({ referenceDate: dateKeySchema.optional() })
  .strict();

export type ParsedShopPayrollSchedulePolicyBody = z.output<
  typeof shopPayrollSchedulePolicyBodySchema
>;
export type ParsedEmployeePayrollSchedulePolicyBody = z.output<
  typeof employeePayrollSchedulePolicyBodySchema
>;
