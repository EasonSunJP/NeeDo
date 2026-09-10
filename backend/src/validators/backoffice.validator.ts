import { z } from "zod";
import {
  DASHBOARD_PERIODS,
  MAX_DASHBOARD_CUSTOM_RANGE_DAYS,
  type DashboardPeriod
} from "../domain/dashboard-period";
import { verifiedServiceLocationSchema } from "./administrative-region.validator";

const paginationQuerySchema = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional()
};

const isoDateSchema = z.coerce.date();
const repeated = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess(
    (value) => (value === undefined ? undefined : Array.isArray(value) ? value : [value]),
    z.array(schema).min(1).max(20).optional()
  );
const managedIdentityTypeSchema = z.enum([
  "platform",
  "customer",
  "technician",
  "merchant",
  "broker",
  "scout"
]);

export const manageableMerchantShopsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export type ManageableMerchantShopsQuery = z.infer<typeof manageableMerchantShopsQuerySchema>;

export const backofficeListQuerySchema = z.object({
  ...paginationQuerySchema,
  keyword: z.string().trim().max(100).optional(),
  status: z.string().trim().max(80).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  shopId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional()
});

export const backofficeManagedUserListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    keyword: z.string().trim().max(100).optional(),
    tier: z.enum(["free", "silver", "gold", "black_diamond"]).optional(),
    tiers: repeated(z.enum(["free", "silver", "gold", "black_diamond"])),
    groupCode: z.string().trim().min(1).max(80).optional(),
    identityType: managedIdentityTypeSchema.optional(),
    identityTypes: repeated(managedIdentityTypeSchema),
    source: z.string().trim().min(1).max(32).optional(),
    state: z.enum(["active", "inactive"]).optional(),
    states: repeated(z.enum(["active", "inactive"])),
    ekyc: z.enum(["verified", "unverified"]).optional(),
    ekycStates: repeated(z.enum(["verified", "unverified"])),
    city: z.string().trim().min(1).max(100).optional(),
    cities: repeated(z.string().trim().min(1).max(100)),
    emailState: z.enum(["set", "unset"]).optional(),
    emailStates: repeated(z.enum(["set", "unset"])),
    privacy: z
      .enum(["enabled", "disabled", "public", "privateAll", "limited", "network"])
      .optional(),
    privacyScopes: repeated(
      z.enum(["enabled", "disabled", "public", "privateAll", "limited", "network"])
    ),
    minBookings: z.coerce.number().int().nonnegative().optional(),
    maxBookings: z.coerce.number().int().nonnegative().optional(),
    sortBy: z.enum(["displayName", "email", "city", "createdAt", "ndpBalance", "bookingCount"]).default("createdAt"),
    sortDirection: z.enum(["asc", "desc"]).default("desc"),
    minLevel: z.coerce.number().int().min(1).max(100).optional(),
    maxLevel: z.coerce.number().int().min(1).max(100).optional(),
    minExpUnits: z.coerce.bigint().nonnegative().optional(),
    maxExpUnits: z.coerce.bigint().nonnegative().optional(),
    minNdpBalance: z.coerce.number().int().nonnegative().optional(),
    maxNdpBalance: z.coerce.number().int().nonnegative().optional(),
    registeredFrom: isoDateSchema.optional(),
    registeredTo: isoDateSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    const ranges = [
      [value.minLevel, value.maxLevel, "maxLevel"],
      [value.minExpUnits, value.maxExpUnits, "maxExpUnits"],
      [value.minNdpBalance, value.maxNdpBalance, "maxNdpBalance"],
      [value.minBookings, value.maxBookings, "maxBookings"],
      [value.registeredFrom?.getTime(), value.registeredTo?.getTime(), "registeredTo"]
    ] as const;
    for (const [minimum, maximum, path] of ranges) {
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: `${path} must not be lower than its minimum`
        });
      }
    }
  });

export type BackofficeManagedUserListQuery = z.infer<typeof backofficeManagedUserListQuerySchema>;

export const backofficeManagedUserDetailQuerySchema = z.object({
  audit_page: z.coerce.number().int().positive().default(1),
  audit_page_size: z.coerce.number().refine((value) => value === 10 || value === 50).default(10),
  audit_from: z.string().datetime().optional(),
  audit_to: z.string().datetime().optional()
}).strict().refine((value) => (!value.audit_from && !value.audit_to) || Boolean(value.audit_from && value.audit_to && Date.parse(value.audit_from) < Date.parse(value.audit_to)), { message: "Both ordered audit range boundaries are required" });
export type BackofficeManagedUserDetailQuery = z.infer<typeof backofficeManagedUserDetailQuerySchema>;

export const backofficeManagedUserParamSchema = z
  .object({ userId: z.coerce.number().int().positive() })
  .strict();

export const merchantAdminListQuerySchema = z
  .object({
    ...paginationQuerySchema,
    keyword: z.string().trim().max(100).optional(),
    status: z.string().trim().max(80).optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    categoryId: z.coerce.number().int().positive().optional()
  })
  .strict();

export const backofficeTimelineQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(10)
  })
  .strict();

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Invalid calendar date");

export const backofficeNdpSummaryQuerySchema = z
  .object({
    date: calendarDateSchema.optional()
  })
  .strict();

const technicianRankingPeriodSchema = z.enum([
  "today",
  "last7days",
  "last30days",
  "month",
  "custom",
  "all"
]);
const technicianRankingSortSchema = z.enum(["revenue", "completedOrders", "workingDays"]);

export const dashboardPeriodSchema = z.enum(DASHBOARD_PERIODS);

export const DASHBOARD_METRIC_KEYS = [
  "gross_revenue",
  "travel_fare",
  "discount_amount",
  "consumables_sales",
  "dedicated_technician_commission",
  "part_time_technician_commission",
  "marketing_commission",
  "agent_commission",
  "ndp_income",
  "affiliate_platform_income",
  "consumables_profit",
  "new_users",
  "new_paid_members",
  "technician_onboarding",
  "agent_onboarding",
  "franchisee_onboarding",
  "supplier_onboarding"
] as const;

export const backofficeDashboardMetricParamSchema = z
  .object({ metricKey: z.enum(DASHBOARD_METRIC_KEYS) })
  .strict();

export type DashboardMetricKey = (typeof DASHBOARD_METRIC_KEYS)[number];

export const dashboardQueryBaseSchema = z
  .object({
    period: dashboardPeriodSchema.default("last7days"),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    city: z.string().trim().min(1).max(100).optional()
  })
  .strict();

export const refineDashboardQuery = (
  value: { period: DashboardPeriod; from?: string; to?: string },
  context: z.RefinementCtx
) => {
  const hasBoundaries = Boolean(value.from || value.to);
  if (value.period === "custom" && (!value.from || !value.to)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [!value.from ? "from" : "to"],
      message: "custom period requires from and to"
    });
  }
  if (value.period !== "custom" && hasBoundaries) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.from ? "from" : "to"],
      message: "date boundaries require custom period"
    });
  }
  if (value.period === "custom" && value.from && value.to) {
    const inclusiveDays =
      Math.floor(
        (Date.parse(`${value.to}T00:00:00.000Z`) - Date.parse(`${value.from}T00:00:00.000Z`)) /
          86_400_000
      ) + 1;
    if (inclusiveDays < 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "to must not be before from"
      });
    }
    if (inclusiveDays > MAX_DASHBOARD_CUSTOM_RANGE_DAYS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: `custom period must not exceed ${MAX_DASHBOARD_CUSTOM_RANGE_DAYS} days`
      });
    }
  }
};

export const backofficeDashboardQuerySchema =
  dashboardQueryBaseSchema.superRefine(refineDashboardQuery);
export const merchantDashboardQuerySchema = dashboardQueryBaseSchema
  .omit({ city: true })
  .superRefine(refineDashboardQuery);

export const technicianRankingQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    keyword: z.string().trim().max(100).optional(),
    shopId: z.coerce.number().int().positive().optional(),
    city: z.string().trim().max(100).optional(),
    period: technicianRankingPeriodSchema.default("month"),
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
    sortBy: technicianRankingSortSchema.default("revenue"),
    sortOrder: z.enum(["asc", "desc"]).default("desc")
  })
  .strict()
  .superRefine((value, context) => {
    if (value.period === "custom") {
      if (!value.from) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["from"],
          message: "from is required"
        });
      }
      if (!value.to) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "to is required" });
      }
      if (value.from && value.to && value.from > value.to) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to"],
          message: "to must not be before from"
        });
      }
    } else if (value.from || value.to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.from ? "from" : "to"],
        message: "date boundaries are only supported for custom periods"
      });
    }
  });

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(255)
  .transform((email) => email.toLowerCase());
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "password must include a lowercase letter")
  .regex(/[A-Z]/, "password must include an uppercase letter")
  .regex(/[0-9]/, "password must include a number")
  .regex(/[^A-Za-z0-9]/, "password must include a symbol");

export const backofficeEntityIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const backofficeShopIdParamSchema = z.object({
  shopId: z.coerce.number().int().positive()
});

const optionalVerifiedServiceLocationFields = verifiedServiceLocationSchema.partial().shape;

const requireCompleteVerifiedServiceLocation = (
  value: {
    serviceCountryCode?: "JP";
    serviceAdmin1Code?: string;
    serviceAdmin2Code?: string;
  },
  context: z.RefinementCtx
) => {
  const fields = [value.serviceCountryCode, value.serviceAdmin1Code, value.serviceAdmin2Code];
  const supplied = fields.filter((field) => field !== undefined).length;
  if (supplied > 0 && supplied < fields.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["serviceCountryCode"],
      message: "service location fields must be supplied together"
    });
  }
};

export const backofficeShopCreateBodySchema = z
  .object({
    ownerEmail: emailSchema,
    ownerUsername: z.string().trim().min(1).max(100),
    ownerPassword: passwordSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(5000).nullable().optional(),
    city: z.string().trim().min(1).max(100),
    address: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(5).max(32).nullable().optional(),
    isRecommended: z.boolean().optional(),
    ...optionalVerifiedServiceLocationFields
  })
  .strict()
  .superRefine(requireCompleteVerifiedServiceLocation);

const merchantShopUpdateFields = {
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  city: z.string().trim().min(1).max(100).optional(),
  address: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().min(5).max(32).nullable().optional(),
  avatarDataUrl: z
    .string()
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .max(7_000_000)
    .optional()
};

export const backofficeShopUpdateBodySchema = z
  .object({
    ...merchantShopUpdateFields,
    isRecommended: z.boolean().optional(),
    ...optionalVerifiedServiceLocationFields
  })
  .strict()
  .superRefine(requireCompleteVerifiedServiceLocation)
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const merchantShopUpdateBodySchema = z
  .object(merchantShopUpdateFields)
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const backofficeTechnicianUpdateBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    serviceArea: z.string().trim().max(255).nullable().optional(),
    shopId: z.number().int().positive().nullable().optional(),
    employmentType: z.enum(["independent", "full_time", "temporary"]).optional(),
    employmentStartedAt: z.string().datetime().nullable().optional(),
    isRecommended: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const backofficeTechnicianApproveBodySchema = z.object({
  shopId: z.number().int().positive().optional()
});

export const backofficeCustomerUpdateBodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().max(5000).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    isPublic: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const backofficeCustomerMembershipGrantBodySchema = z
  .object({
    membershipLevel: z.enum(["silver", "gold", "black_diamond"]),
    grantMode: z.literal("operator_complimentary"),
    durationUnit: z.literal("month"),
    durationValue: z.union([z.literal(1), z.literal(12)]),
    startsAt: z.string().datetime({ offset: true })
  })
  .strict();

const serviceFields = {
  categoryId: z.number().int().positive(),
  technicianProfileId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  serviceMode: z.enum(["store", "home"]),
  priceAmount: z.number().nonnegative().max(99_999_999),
  durationMinutes: z.number().int().positive().max(1440),
  status: z.enum(["draft", "published", "paused"]).optional(),
  isRecommended: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1_000_000).optional()
};

export const backofficeServiceCreateBodySchema = z.object(serviceFields);
export const backofficeServiceUpdateBodySchema = z
  .object({
    categoryId: serviceFields.categoryId.optional(),
    technicianProfileId: serviceFields.technicianProfileId,
    name: serviceFields.name.optional(),
    description: serviceFields.description,
    city: serviceFields.city.optional(),
    serviceMode: serviceFields.serviceMode.optional(),
    priceAmount: serviceFields.priceAmount.optional(),
    durationMinutes: serviceFields.durationMinutes.optional(),
    status: serviceFields.status,
    isRecommended: serviceFields.isRecommended,
    sortOrder: serviceFields.sortOrder
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type BackofficeListQuery = z.infer<typeof backofficeListQuerySchema>;
export type BackofficeNdpSummaryQuery = z.infer<typeof backofficeNdpSummaryQuerySchema>;
export type BackofficeDashboardQuery = z.infer<typeof backofficeDashboardQuerySchema>;
export type MerchantDashboardQuery = z.infer<typeof merchantDashboardQuerySchema>;
export type BackofficeTimelineQuery = z.infer<typeof backofficeTimelineQuerySchema>;
export type TechnicianRankingPeriod = z.infer<typeof technicianRankingPeriodSchema>;
export type TechnicianRankingSort = z.infer<typeof technicianRankingSortSchema>;
export type BackofficeTechnicianRankingQuery = z.infer<typeof technicianRankingQuerySchema>;
export type TechnicianRankingQuery = z.input<typeof technicianRankingQuerySchema>;
export type BackofficeShopCreateBody = z.infer<typeof backofficeShopCreateBodySchema>;
export type BackofficeShopUpdateBody = z.infer<typeof backofficeShopUpdateBodySchema>;
export type MerchantShopUpdateBody = z.infer<typeof merchantShopUpdateBodySchema>;
export type BackofficeTechnicianUpdateBody = z.infer<typeof backofficeTechnicianUpdateBodySchema>;
export type BackofficeTechnicianApproveBody = z.infer<typeof backofficeTechnicianApproveBodySchema>;
export type BackofficeCustomerUpdateBody = z.infer<typeof backofficeCustomerUpdateBodySchema>;
export type BackofficeCustomerMembershipGrantBody = z.infer<
  typeof backofficeCustomerMembershipGrantBodySchema
>;
export type BackofficeServiceCreateBody = z.infer<typeof backofficeServiceCreateBodySchema>;
export type BackofficeServiceUpdateBody = z.infer<typeof backofficeServiceUpdateBodySchema>;

export const backofficeAccountPostsQuerySchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(10) }).strict();
