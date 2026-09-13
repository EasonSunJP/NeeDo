import { z } from "zod";
import { httpClient } from "./httpClient";

const nullableInteger = z.number().int().nullable();
const dateTime = z.string().datetime({ offset: true });
const nullableDateTime = dateTime.nullable();

const publisherSchema = z.strictObject({
  publicIdMasked: z.string().min(1),
  displayNameMasked: z.string().min(1),
  identityType: z.string().min(1)
});

const financialSchema = z.strictObject({
  state: z.enum(["held", "captured", "released"]),
  amountNdp: z.number().int().nonnegative(),
  currency: z.enum(["NDP", "TEST_NDP"]),
  heldAmountNdp: z.number().int().nonnegative(),
  capturedAmountNdp: z.number().int().nonnegative(),
  releasedAmountNdp: z.number().int().nonnegative(),
  ruleSetVersion: z.number().int().positive(),
  createdAt: dateTime,
  capturedAt: nullableDateTime,
  releasedAt: nullableDateTime
});

const postSchema = z.strictObject({
  id: z.number().int().positive(),
  type: z.enum(["demand", "intelligence"]),
  status: z.enum(["published", "matched", "expired", "withdrawn", "closed"]),
  title: z.string().min(1),
  publisher: publisherSchema,
  serviceMode: z.enum(["home", "store", "onsite", "flexible"]),
  areaLabel: z.string(),
  serviceStartAt: dateTime,
  serviceEndAt: dateTime,
  expiresAt: dateTime,
  publishedAt: dateTime,
  budgetMinJpy: nullableInteger,
  budgetMaxJpy: nullableInteger,
  matchMode: z.enum(["quick", "selective"]).nullable(),
  claimCount: z.number().int().nonnegative(),
  activeClaimCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  financial: financialSchema.nullable()
});

const demandSchema = z.strictObject({
  targetProviderCount: z.number().int().positive(),
  targetProviderLimitSnapshot: z.number().int().positive(),
  publisherCapacitySource: z.enum(["customer_membership", "shop_merchant"]),
  membershipLevelSnapshot: z.string().nullable(),
  matchMode: z.enum(["quick", "selective"]),
  budgetMode: z.enum(["total", "per_provider"]),
  budgetMinJpy: nullableInteger,
  budgetMaxJpy: z.number().int().nonnegative(),
  serviceMode: z.enum(["home", "store"]),
  addressLine1: z.string()
});

const intelligenceSchema = z.strictObject({
  serviceMode: z.enum(["store", "onsite", "flexible"]),
  addressLabel: z.string().nullable(),
  serviceAreas: z.array(z.string()),
  originalPriceJpy: nullableInteger,
  campaignPriceJpy: z.number().int().nonnegative(),
  serviceName: z.string().nullable(),
  serviceDurationMinutes: nullableInteger
});

const claimSchema = z.strictObject({
  id: z.number().int().positive(),
  status: z.enum(["active", "withdrawn", "request_withdrawn", "request_expired", "matched", "not_selected", "matching_closed"]),
  providerPublicIdMasked: z.string().min(1),
  providerDisplayNameMasked: z.string().min(1),
  shopName: z.string().min(1),
  technicianDisplayNameMasked: z.string().min(1),
  serviceName: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  quoteAmountJpy: z.number().int().nonnegative(),
  currency: z.literal("JPY"),
  message: z.string().nullable(),
  startsAt: dateTime,
  endsAt: dateTime,
  createdAt: dateTime,
  withdrawnAt: nullableDateTime,
  terminalAt: nullableDateTime
});

const participantSchema = z.strictObject({
  exchangeClaimId: z.number().int().positive(),
  providerPublicIdMasked: z.string().min(1),
  providerDisplayNameMasked: z.string().min(1),
  shopName: z.string().min(1),
  technicianDisplayNameMasked: z.string().min(1),
  serviceName: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  quoteAmountJpy: z.number().int().nonnegative(),
  currency: z.literal("JPY"),
  startsAt: dateTime,
  endsAt: dateTime,
  matchedAt: dateTime,
  bookingOrderNo: z.string().nullable(),
  bookingStatus: z.string().nullable()
});

const matchingSchema = z.strictObject({
  status: z.enum(["open", "matched", "closed"]),
  version: z.number().int().positive(),
  effectiveTargetProviderCount: z.number().int().positive(),
  effectiveBudgetMaxJpy: z.number().int().nonnegative(),
  selectedQuoteTotalJpy: z.number().int().nonnegative(),
  matchedAt: nullableDateTime,
  participants: z.array(participantSchema)
});

const timelineSchema = z.strictObject({
  id: z.string().min(1),
  source: z.enum(["post", "claim", "matching", "financial", "audit"]),
  event: z.string().min(1),
  status: z.string().nullable(),
  actorDisplayNameMasked: z.string().nullable(),
  amount: nullableInteger,
  currency: z.enum(["NDP", "TEST_NDP"]).nullable(),
  createdAt: dateTime
});

const detailSchema = postSchema.extend({
  detail: z.string(),
  contentLocale: z.string().min(1),
  demand: demandSchema.nullable(),
  intelligence: intelligenceSchema.nullable(),
  claims: z.array(claimSchema),
  matching: matchingSchema.nullable(),
  timeline: z.array(timelineSchema)
});

const pageSchema = z.strictObject({
  list: z.array(postSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  page_size: z.number().int().min(1).max(100)
});

export type ExchangeOperationsPost = z.infer<typeof postSchema>;
export type ExchangeOperationsDetail = z.infer<typeof detailSchema>;
export type ExchangeOperationsPage = z.infer<typeof pageSchema>;
export type ExchangeOperationsListInput = {
  type?: "demand" | "intelligence";
  status?: ExchangeOperationsPost["status"];
  matchMode?: "quick" | "selective";
  publisherIdentityType?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error("exchange.operations.invalid_response");
  return result.data;
};

export const exchangeOperationsApi = {
  async list(input: ExchangeOperationsListInput, signal?: AbortSignal): Promise<ExchangeOperationsPage> {
    const result = await httpClient.request<unknown>("/backoffice/exchange/posts", {
      query: {
        type: input.type,
        status: input.status,
        match_mode: input.matchMode,
        publisher_identity_type: input.publisherIdentityType,
        keyword: input.keyword,
        page: input.page,
        page_size: input.pageSize
      },
      signal
    });
    const page = parse(pageSchema, result);
    if (page.page !== input.page || page.page_size !== input.pageSize || page.list.length > page.page_size) {
      throw new Error("exchange.operations.invalid_response");
    }
    return page;
  },

  async detail(id: number, signal?: AbortSignal): Promise<ExchangeOperationsDetail> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("exchange.operations.invalid_id");
    const result = await httpClient.request<unknown>(`/backoffice/exchange/posts/${id}`, { signal });
    return parse(detailSchema, result);
  }
};
