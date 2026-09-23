import { z } from "zod";

export const technicianAutomationKindSchema = z.enum(["booking", "request"]);
export type TechnicianAutomationKindValue = z.infer<typeof technicianAutomationKindSchema>;

export const technicianAutomationKindParamSchema = z.object({
  kind: technicianAutomationKindSchema
}).strict();

const uniqueArray = <T extends z.ZodTypeAny>(item: T, maximum: number, minimum = 0) =>
  z.array(item).min(minimum).max(maximum).refine(
    (items) => new Set(items.map((value) => JSON.stringify(value))).size === items.length,
    "Values must be unique"
  );

export const technicianAutomationTimeWindowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440)
}).strict().refine((value) => value.endMinute > value.startMinute, {
  message: "End minute must be after start minute",
  path: ["endMinute"]
});

export const technicianAutomationRulesSchema = z.object({
  timeWindows: uniqueArray(technicianAutomationTimeWindowSchema, 42),
  minLeadMinutes: z.number().int().min(0).max(10_080),
  bufferMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]),
  areaCodes: uniqueArray(z.string().trim().min(1).max(80), 100),
  maxDistanceKm: z.number().positive().max(500).nullable(),
  minOrderAmountJpy: z.number().int().min(0).max(100_000_000).nullable(),
  minNetAmountJpy: z.number().int().min(0).max(100_000_000).nullable(),
  minCustomerRating: z.number().min(1).max(5).nullable(),
  acceptNewCustomers: z.boolean(),
  minCompletedOrders: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(5), z.literal(10)]),
  requireEkyc: z.boolean(),
  maxCancellationRatePercent: z.number().min(0).max(100).nullable(),
  source: z.object({
    mode: z.enum([
      "any",
      "existing_contacts",
      "specific_contacts",
      "existing_contact_referrals",
      "specific_contact_referrals"
    ]),
    contactIdentityIds: uniqueArray(z.number().int().positive(), 100)
  }).strict().superRefine((value, context) => {
    const needsSelection = value.mode === "specific_contacts" || value.mode === "specific_contact_referrals";
    if (needsSelection !== (value.contactIdentityIds.length > 0)) {
      context.addIssue({ code: "custom", message: "Selected contacts must match source mode", path: ["contactIdentityIds"] });
    }
  }),
  customerType: z.enum(["all", "returning", "new"]),
  partyTypes: uniqueArray(z.enum(["single", "multiple"]), 2, 1),
  serviceModes: uniqueArray(z.enum(["store", "home"]), 2, 1),
  paymentMethods: uniqueArray(z.enum(["onsite", "card", "ndp", "bank_transfer", "other"]), 5, 1),
  serviceIds: uniqueArray(z.number().int().positive(), 200),
  minimumPrepaymentPercent: z.union([
    z.literal(0),
    z.number().int().min(10).max(100)
  ]),
  onlyOnline: z.boolean(),
  requestStartWindow: z.enum(["immediate", "within_1_hour", "within_3_hours", "today", "any"]),
  requireMatchingTags: z.boolean()
}).strict();

export type TechnicianAutomationRules = z.infer<typeof technicianAutomationRulesSchema>;

export const technicianAutomationSettingsUpdateSchema = z.object({
  enabled: z.boolean(),
  expectedVersion: z.number().int().positive(),
  rules: technicianAutomationRulesSchema
}).strict();

export type TechnicianAutomationSettingsUpdate = z.infer<typeof technicianAutomationSettingsUpdateSchema>;

export const technicianAutomationContactListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional()
}).strict();

export type TechnicianAutomationContactListQuery = z.infer<
  typeof technicianAutomationContactListQuerySchema
>;

export function defaultTechnicianAutomationRules(
  kind: TechnicianAutomationKindValue
): TechnicianAutomationRules {
  return {
    timeWindows: [],
    minLeadMinutes: kind === "booking" ? 30 : 0,
    bufferMinutes: 30,
    areaCodes: [],
    maxDistanceKm: 5,
    minOrderAmountJpy: null,
    minNetAmountJpy: null,
    minCustomerRating: null,
    acceptNewCustomers: true,
    minCompletedOrders: 0,
    requireEkyc: false,
    maxCancellationRatePercent: null,
    source: { mode: "any", contactIdentityIds: [] },
    customerType: "all",
    partyTypes: ["single"],
    serviceModes: ["store", "home"],
    paymentMethods: ["onsite", "card", "ndp", "other"],
    serviceIds: [],
    minimumPrepaymentPercent: 0,
    onlyOnline: kind === "request",
    requestStartWindow: kind === "request" ? "within_3_hours" : "any",
    requireMatchingTags: kind === "request"
  };
}
