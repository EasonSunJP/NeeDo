import { z } from "zod";

export const liveDashboardQuerySchema = z
  .object({
    country: z.literal("JP"),
    admin1: z
      .string()
      .regex(/^\d{2}$/)
      .optional(),
    admin2: z
      .string()
      .regex(/^\d{5}$/)
      .optional(),
    period: z.enum(["today", "last7days", "last30days"]).default("today")
  })
  .strict()
  .superRefine((value, context) => {
    if (value.admin2 && !value.admin1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["admin1"],
        message: "admin1 is required when admin2 is present"
      });
    }
  });

export type LiveDashboardQuery = z.infer<typeof liveDashboardQuerySchema>;

export const liveDashboardLastEventIdSchema = z
  .string()
  .max(80)
  .regex(/^\d+-\d+$/)
  .nullable();

const safeNonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const safeSignedInteger = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const requiredText = z.string().min(1);
const isoTimestamp = z.string().datetime({ offset: true });

const liveMoneySchema = z
  .object({
    jpy: safeNonNegativeInteger,
    ndp: safeNonNegativeInteger,
    testNdp: safeNonNegativeInteger
  })
  .strict();

const signedLiveMoneySchema = z
  .object({ jpy: safeSignedInteger, ndp: safeSignedInteger, testNdp: safeSignedInteger })
  .strict();

const cachedScopeSchema = z
  .object({
    countryCode: z.literal("JP"),
    admin1Code: z
      .string()
      .regex(/^\d{2}$/)
      .nullable(),
    admin2Code: z
      .string()
      .regex(/^\d{5}$/)
      .nullable()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.admin2Code && !value.admin1Code) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["admin1Code"],
        message: "admin1Code is required when admin2Code is present"
      });
    }
  });

const cachedOrderSummarySchema = z
  .object({
    orderNo: requiredText,
    status: requiredText,
    serviceName: requiredText,
    amountJpy: safeNonNegativeInteger,
    occurredAt: isoTimestamp
  })
  .strict();

const cachedRankingItemSchema = z
  .object({
    rank: safeNonNegativeInteger.min(1).max(10),
    entityPublicId: requiredText,
    displayName: requiredText,
    avatarUrl: z.string().nullable(),
    gmvJpy: safeNonNegativeInteger,
    completedCount: safeNonNegativeInteger
  })
  .strict();

export const cachedLiveDashboardFactsSchema = z
  .object({
    evaluatedAt: isoTimestamp,
    scope: cachedScopeSchema,
    children: z.array(
      z
        .object({
          code: z.string().regex(/^(?:\d{2}|\d{5})$/),
          name: requiredText,
          orderCount: safeNonNegativeInteger,
          currentDayOrderCount: safeNonNegativeInteger,
          previousDayOrderCount: safeNonNegativeInteger,
          confirmedPayments: liveMoneySchema
        })
        .strict()
    ),
    headline: z
      .object({
        newOrders: safeNonNegativeInteger,
        completedOrders: safeNonNegativeInteger,
        newCustomers: safeNonNegativeInteger,
        onboardedTechnicians: safeNonNegativeInteger
      })
      .strict(),
    confirmedPayments: liveMoneySchema,
    orders: z
      .object({
        total: safeNonNegativeInteger,
        serviceGmv: liveMoneySchema,
        platformNetRevenue: signedLiveMoneySchema,
        agentCommission: liveMoneySchema.nullable()
      })
      .strict(),
    realtimeOrders: z
      .object({
        list: z.array(cachedOrderSummarySchema).max(20),
        total: safeNonNegativeInteger,
        page: z.literal(1),
        page_size: z.literal(20)
      })
      .strict(),
    activity: z.array(cachedOrderSummarySchema).max(20),
    trend: z.array(
      z
        .object({
          key: requiredText,
          label: requiredText,
          orderCount: safeNonNegativeInteger,
          confirmedPayments: liveMoneySchema
        })
        .strict()
    ),
    serviceRanking: z.array(cachedRankingItemSchema).max(10),
    technicianRanking: z.array(cachedRankingItemSchema).max(10),
    coverage: z
      .object({
        total: safeNonNegativeInteger,
        attributed: safeNonNegativeInteger,
        unresolved: safeNonNegativeInteger,
        completenessPercent: z.number().finite().min(0).max(100)
      })
      .strict()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.coverage.attributed + value.coverage.unresolved !== value.coverage.total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverage"],
        message: "coverage totals do not reconcile"
      });
    }
    if (value.realtimeOrders.list.length > value.realtimeOrders.total) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["realtimeOrders", "list"],
        message: "realtime list exceeds total"
      });
    }
  });

export type CachedLiveDashboardFacts = z.infer<typeof cachedLiveDashboardFactsSchema>;

export const decodeCachedLiveDashboardFacts = (value: unknown): CachedLiveDashboardFacts =>
  cachedLiveDashboardFactsSchema.parse(value);
