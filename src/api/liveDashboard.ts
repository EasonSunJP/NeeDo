import { z } from "zod";
import { httpClient, type ApiQueryValue } from "./httpClient";

export type LiveDashboardPeriod = "today" | "last7days" | "last30days";
export interface LiveDashboardScope {
  country: "JP";
  admin1?: string;
  admin2?: string;
  period: LiveDashboardPeriod;
}

const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signedInteger = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const code2 = z.string().regex(/^\d{2}$/u);
const code5 = z.string().regex(/^\d{5}$/u);
const timestamp = z.string().datetime({ offset: true });
const requiredText = z.string().min(1);
const money = z.strictObject({ jpy: nonNegativeInteger, ndp: nonNegativeInteger, testNdp: nonNegativeInteger });
const signedMoney = z.strictObject({ jpy: signedInteger, ndp: signedInteger, testNdp: signedInteger });
const eventScope = z.strictObject({
  countryCode: z.literal("JP"),
  admin1Code: code2.nullable(),
  admin2Code: code5.nullable()
}).superRefine((value, context) => {
  if (value.admin2Code && !value.admin1Code) context.addIssue({ code: "custom", message: "admin1 required" });
});
const order = z.strictObject({
  orderNo: requiredText,
  status: requiredText,
  serviceName: requiredText,
  amountJpy: nonNegativeInteger,
  occurredAt: timestamp
});
const ranking = z.strictObject({
  rank: z.number().int().min(1).max(10),
  entityPublicId: requiredText,
  displayName: requiredText,
  avatarUrl: z.string().nullable(),
  gmvJpy: nonNegativeInteger,
  completedCount: nonNegativeInteger
});
const snapshotSchema = z.strictObject({
  scope: z.strictObject({
    country: z.literal("JP"),
    admin1: code2.nullable(),
    admin2: code5.nullable(),
    breadcrumbs: z.array(z.strictObject({
      level: z.enum(["country", "admin1", "admin2"]),
      code: z.string().regex(/^(?:JP|\d{2}|\d{5})$/u),
      name: requiredText
    })).min(1).max(3)
  }),
  evaluatedAt: timestamp,
  cachedAt: timestamp,
  freshnessSeconds: nonNegativeInteger,
  cacheStatus: z.enum(["hit", "miss"]),
  children: z.array(z.strictObject({
    code: z.string().regex(/^(?:\d{2}|\d{5})$/u),
    name: requiredText,
    orderCount: nonNegativeInteger,
    currentDayOrderCount: nonNegativeInteger,
    previousDayOrderCount: nonNegativeInteger,
    confirmedPayments: money
  })),
  headline: z.strictObject({
    newOrders: nonNegativeInteger,
    completedOrders: nonNegativeInteger,
    newCustomers: nonNegativeInteger,
    onboardedTechnicians: nonNegativeInteger
  }),
  confirmedPayments: money,
  orders: z.strictObject({
    total: nonNegativeInteger,
    serviceGmv: money,
    platformNetRevenue: signedMoney,
    agentCommission: money.nullable()
  }),
  realtimeOrders: z.strictObject({
    list: z.array(order).max(20),
    total: nonNegativeInteger,
    page: z.literal(1),
    page_size: z.literal(20)
  }),
  activity: z.array(order).max(20),
  trend: z.array(z.strictObject({
    key: requiredText,
    label: requiredText,
    orderCount: nonNegativeInteger,
    confirmedPayments: money
  })),
  serviceRanking: z.array(ranking).max(10),
  technicianRanking: z.array(ranking).max(10),
  coverage: z.strictObject({
    total: nonNegativeInteger,
    attributed: nonNegativeInteger,
    unresolved: nonNegativeInteger,
    completenessPercent: z.number().finite().min(0).max(100)
  })
}).superRefine((value, context) => {
  if (value.scope.admin2 && !value.scope.admin1) context.addIssue({ code: "custom", message: "admin1 required" });
  if (value.coverage.attributed + value.coverage.unresolved !== value.coverage.total) {
    context.addIssue({ code: "custom", path: ["coverage"], message: "coverage mismatch" });
  }
  if (value.realtimeOrders.list.length > value.realtimeOrders.total) {
    context.addIssue({ code: "custom", path: ["realtimeOrders"], message: "list exceeds total" });
  }
  const expectedChildPattern = value.scope.admin1 ? /^\d{5}$/u : /^\d{2}$/u;
  if (value.children.some((child) => !expectedChildPattern.test(child.code))) {
    context.addIssue({ code: "custom", path: ["children"], message: "child hierarchy mismatch" });
  }
});

const dashboardEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    id: z.string().regex(/^\d+-\d+$/u),
    type: z.literal("order.changed"),
    scope: eventScope,
    payload: z.strictObject({
      orderNo: requiredText,
      status: requiredText,
      serviceName: requiredText,
      amountJpy: nonNegativeInteger
    }),
    createdAt: timestamp
  }),
  z.strictObject({
    id: z.string().regex(/^\d+-\d+$/u),
    type: z.literal("metrics.invalidate"),
    scope: eventScope,
    payload: z.strictObject({
      sections: z.array(z.enum(["headline", "orders", "trend", "rankings"])).min(1)
    }),
    createdAt: timestamp
  })
]);

export type LiveDashboardSnapshot = z.infer<typeof snapshotSchema>;
export type LiveDashboardEvent = z.infer<typeof dashboardEventSchema>;

export const serializeLiveDashboardQuery = (scope: LiveDashboardScope): Record<string, ApiQueryValue> => ({
  country: scope.country,
  ...(scope.admin1 ? { admin1: scope.admin1 } : {}),
  ...(scope.admin2 ? { admin2: scope.admin2 } : {}),
  period: scope.period
});

export function requireLiveDashboardSnapshot(value: unknown, requestedScope: LiveDashboardScope): LiveDashboardSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) throw new Error("error.dashboard.invalid_snapshot");
  const responseScope = parsed.data.scope;
  if (
    responseScope.country !== requestedScope.country ||
    responseScope.admin1 !== (requestedScope.admin1 ?? null) ||
    responseScope.admin2 !== (requestedScope.admin2 ?? null)
  ) {
    throw new Error("error.dashboard.scope_mismatch");
  }
  return parsed.data;
}

export function requireLiveDashboardEvent(value: unknown): LiveDashboardEvent {
  const parsed = dashboardEventSchema.safeParse(value);
  if (!parsed.success) throw new Error("error.dashboard.invalid_event");
  return parsed.data;
}

export const liveDashboardApi = {
  async snapshot(scope: LiveDashboardScope, signal?: AbortSignal) {
    const value = await httpClient.request<unknown>("/backoffice/dashboard/live-snapshot", {
      query: serializeLiveDashboardQuery(scope),
      signal
    });
    return requireLiveDashboardSnapshot(value, scope);
  }
};
