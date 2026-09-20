import { z } from "zod";

const optionalPercent = z.number().int().min(0).max(100).nullable();

export const shopAutoDispatchRuleBodySchema = z.object({
  enabled: z.boolean(),
  startsOn: z.string().date().nullable(),
  endsOn: z.string().date().nullable(),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(0).max(1439),
  allowStore: z.boolean(),
  allowHome: z.boolean(),
  minimumRating: z.number().min(0).max(5).multipleOf(0.1).nullable(),
  minimumAcceptanceRate: optionalPercent,
  maximumCancellationRate: optionalPercent,
  dailyTechnicianLimit: z.number().int().positive().max(100).nullable(),
  strategy: z.enum(["balanced", "longest_idle", "highest_rating", "preferred"]),
  preferredTechnicianIds: z.array(z.number().int().positive()).max(200),
  travelMinutesPerKm: z.number().int().min(1).max(120),
  strictWindow: z.boolean()
}).strict().superRefine((value, context) => {
  if (!value.allowStore && !value.allowHome) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowStore"], message: "At least one fulfillment mode is required" });
  }
  if (value.startsOn && value.endsOn && value.startsOn > value.endsOn) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsOn"], message: "endsOn must not be earlier than startsOn" });
  }
  if (value.endMinute <= value.startMinute) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["endMinute"], message: "endMinute must be later than startMinute" });
  }
});

export type ShopAutoDispatchRuleBody = z.infer<typeof shopAutoDispatchRuleBodySchema>;
