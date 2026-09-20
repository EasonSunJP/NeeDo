import { z } from "zod";

export const scheduleCycleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const scheduleCycleOperationsListQuerySchema = scheduleCycleListQuerySchema.extend({
  shopId: z.coerce.number().int().positive()
});

export type ParsedScheduleCycleListQuery = z.infer<typeof scheduleCycleListQuerySchema>;

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const technicianIdsSchema = z.array(z.number().int().positive()).max(200);

export const scheduleCycleCreateBodySchema = z.object({
  targetTechnicianIds: technicianIdsSchema.default([])
});

export const scheduleCycleParamsSchema = z.object({
  cycleId: z.string().uuid()
});

export const scheduleCycleRuleSetSchema = z.object({
  minStaff: z.number().int().min(0).max(200),
  targetStaff: z.number().int().min(0).max(200),
  maxStaff: z.number().int().min(0).max(200),
  maxDailyHours: z.number().int().min(1).max(24),
  maxWeeklyHours: z.number().int().min(1).max(168),
  minRestDaysPerWeek: z.number().int().min(0).max(7),
  preBufferMinutes: z.number().int().min(0).max(240).optional(),
  postBufferMinutes: z.number().int().min(0).max(240).optional(),
  weekdayAdjustments: z.record(z.coerce.number().int()).default({}),
  holidayAdjustments: z.record(z.number().int()).default({})
}).passthrough().superRefine((value, context) => {
  if (value.minStaff > value.targetStaff || value.targetStaff > value.maxStaff) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "staff limits must be ordered" });
  }
});

export const scheduleCycleUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(160),
  mode: z.enum(["TECH_SELF_FINAL", "STORE_ASSIGN_FINAL"]),
  currentStep: z.number().int().min(1).max(4),
  templateType: z.enum(["DAY", "WEEK", "MONTH"]),
  periodStart: dateKeySchema,
  periodEnd: dateKeySchema,
  targetTechnicianIds: technicianIdsSchema.min(1),
  feedbackDeadline: z.string().datetime({ offset: true }).nullable(),
  templateMatrix: z.array(z.array(z.boolean()).length(24)).min(1).max(31),
  regularHolidayWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
  ruleSet: scheduleCycleRuleSetSchema,
  version: z.number().int().positive()
}).superRefine((value, context) => {
  if (value.periodStart > value.periodEnd) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "periodStart must not be after periodEnd" });
  }
  if (value.mode === "STORE_ASSIGN_FINAL" && value.feedbackDeadline === null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "feedbackDeadline is required" });
  }
  const expectedRows = value.templateType === "DAY" ? 1 : value.templateType === "WEEK" ? 7 : 28;
  if (value.templateMatrix.length !== expectedRows) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `templateMatrix must contain ${expectedRows} rows` });
  }
});

export const scheduleCycleCommandBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160)
});

export const scheduleCycleFeedbackBodySchema = z.object({
  version: z.number().int().positive(),
  entries: z.array(z.object({
    date: dateKeySchema,
    hour: z.number().int().min(0).max(23),
    status: z.enum(["AVAILABLE", "UNAVAILABLE", "UPDATED"]),
    note: z.string().trim().max(500).default("")
  })).min(1).max(24 * 31)
});

export type ParsedScheduleCycleUpdateBody = z.infer<typeof scheduleCycleUpdateBodySchema>;
export type ParsedScheduleCycleFeedbackBody = z.infer<typeof scheduleCycleFeedbackBodySchema>;
