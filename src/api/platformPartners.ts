import { httpClient, type ApiQueryValue } from "./httpClient";

export type Paginated<T> = {
  list: T[];
  total: number;
  page: number;
  page_size: number;
};
export type PartnerType = "agent" | "franchisee" | "supplier";
export type AgentStatus = "active" | "inactive";
export type ReferralStatus = "active" | "qualified" | "revoked";
export type PaymentMethod = "bank_transfer" | "ndp" | "other";

export interface PlatformPartnerProfile {
  publicId: string;
  partnerType: PartnerType;
  startsAt: string;
  endsAt: string | null;
  permanent: boolean;
  markedAt: string;
  reason: string;
  user: {
    id: number;
    needoId: string;
    nickname: string;
    avatarUrl: string | null;
    status: AgentStatus;
  };
}

export interface AgentProfileListItem extends PlatformPartnerProfile {
  administration: {
    referralCount: number;
    referredShops: Array<{ publicId: string; name: string; city: string }>;
    currentRule: Pick<
      AgentCommissionRule,
      | "version"
      | "fixedSuccessRewardJpy"
      | "profitShareRateBps"
      | "paymentMethod"
      | "effectiveFrom"
      | "effectiveTo"
    > | null;
    latestSettlement: Pick<
      AgentSettlement,
      | "publicId"
      | "status"
      | "periodStart"
      | "periodEnd"
      | "totalAmountJpy"
      | "confirmedAt"
      | "paidAt"
    > | null;
  };
}

export interface AgentShopReferral {
  publicId: string;
  agentPublicId: string;
  status: ReferralStatus;
  source: string;
  confirmedAt: string;
  successQualifiedAt: string | null;
  reason: string;
  createdAt: string;
  shop: { publicId: string; name: string; city: string };
}

export interface AgentCommissionRule {
  publicId: string;
  version: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  paymentMethod: PaymentMethod;
  paymentDetails: Record<string, unknown> | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  publishedAt: string;
  publishedById: number;
  reason: string;
  createdAt: string;
}

export interface AgentCommissionRuleOverview {
  current: AgentCommissionRule | null;
  latestVersion: number;
  evaluatedAt: string;
  history: Paginated<AgentCommissionRule>;
}

export interface AgentSettlementExternalDeduction {
  shopPublicId: string;
  channelFeesJpy: number;
  consumptionTaxJpy: number;
  evidenceReference: string;
  reason: string;
}

export interface AgentSettlementTotals {
  orderPlatformFeesJpy: number;
  saasFeesJpy: number;
  userRebatesJpy: number;
  refundsAndReversalsJpy: number;
  channelFeesJpy: number;
  consumptionTaxJpy: number;
  allocatedOperatingCostsJpy: number;
  pureProfitJpy: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  profitShareAmountJpy: number;
  totalAmountJpy: number;
}

export interface AgentSettlementShopPreview extends AgentSettlementTotals {
  referralPublicId: string;
  shopPublicId: string;
  shopName: string;
  successRewardEligible: boolean;
  externalEvidenceReference: string;
  externalEvidenceReason: string;
}

export interface AgentSettlementPreview {
  agentPublicId: string;
  periodStart: string;
  periodEnd: string;
  currency: "JPY";
  rule: Pick<
    AgentCommissionRule,
    | "publicId"
    | "version"
    | "fixedSuccessRewardJpy"
    | "profitShareRateBps"
    | "paymentMethod"
  >;
  totals: AgentSettlementTotals;
  shops: AgentSettlementShopPreview[];
  generatedAt: string;
}

export interface AgentSettlement extends AgentSettlementTotals {
  publicId: string;
  agentPublicId: string;
  periodStart: string;
  periodEnd: string;
  status: "confirmed" | "paid";
  currency: "JPY";
  rule: AgentSettlementPreview["rule"];
  idempotencyKey: string;
  confirmedAt: string;
  confirmedById: number;
  paidAt: string | null;
  paidById: number | null;
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  lines: AgentSettlementLine[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentSettlementLine {
  lineType: "success_reward" | "profit_share";
  referralPublicId: string;
  shopPublicId: string;
  shopName: string;
  orderPlatformFeesJpy: number;
  saasFeesJpy: number;
  userRebatesJpy: number;
  refundsAndReversalsJpy: number;
  channelFeesJpy: number;
  consumptionTaxJpy: number;
  allocatedOperatingCostsJpy: number;
  pureProfitJpy: number;
  fixedSuccessRewardJpy: number;
  profitShareRateBps: number;
  amountJpy: number;
}

export type OperatingCostCategory =
  | "personnel"
  | "server"
  | "third_party_api"
  | "other";
export type OperatingCostAllocationMode =
  | "equal_active_shops"
  | "platform_income_proportional"
  | "direct_shops";
export type OperatingCostStatus = "draft" | "published" | "archived";
export type OperatingCostDirectAssignment =
  | { shopPublicId: string; amountJpy: number }
  | { shopPublicId: string; shareBps: number };

export interface OperatingCostItem {
  publicId: string;
  costCode: string;
  version: number;
  categoryCode: OperatingCostCategory;
  name: string;
  amountJpy: number;
  currency: "JPY";
  periodStart: string;
  periodEnd: string;
  allocationMode: OperatingCostAllocationMode;
  status: OperatingCostStatus;
  effectiveAt: string;
  publishedAt: string | null;
  configuredById: number;
  reason: string;
  directAssignments: OperatingCostDirectAssignment[] | null;
  allocations: Array<{
    shopPublicId: string;
    shopName: string;
    amountJpy: number;
    allocationWeight: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface OperatingCostConfigurationInput {
  categoryCode: OperatingCostCategory;
  name: string;
  amountJpy: number;
  periodStart: string;
  periodEnd: string;
  allocationMode: OperatingCostAllocationMode;
  directAssignments?: OperatingCostDirectAssignment[];
  effectiveAt: string;
  reason: string;
}

type UnknownRecord = Record<string, unknown>;
const invalid = (): never => {
  throw new TypeError("Invalid platform partner response");
};
const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : invalid();
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : invalid();
const string = (value: unknown): string =>
  typeof value === "string" ? value : invalid();
const nullableString = (value: unknown): string | null =>
  value === null ? null : string(value);
const integer = (value: unknown): number =>
  Number.isSafeInteger(value) ? (value as number) : invalid();
const boolean = (value: unknown): boolean =>
  typeof value === "boolean" ? value : invalid();
const timestamp = (value: unknown): string => {
  const text = string(value);
  return Number.isFinite(Date.parse(text)) ? text : invalid();
};
const nullableTimestamp = (value: unknown): string | null =>
  value === null ? null : timestamp(value);
const enumValue = <T extends string>(
  value: unknown,
  values: readonly T[],
): T =>
  typeof value === "string" && values.includes(value as T)
    ? (value as T)
    : invalid();
const nullableInteger = (value: unknown): number | null =>
  value === null ? null : integer(value);
const page = <T>(
  value: unknown,
  decode: (item: unknown) => T,
): Paginated<T> => {
  const raw = record(value);
  return {
    list: array(raw.list).map(decode),
    total: integer(raw.total),
    page: integer(raw.page),
    page_size: integer(raw.page_size),
  };
};

const decodePartner = (value: unknown): PlatformPartnerProfile => {
  const raw = record(value);
  const user = record(raw.user);
  return {
    publicId: string(raw.publicId),
    partnerType: enumValue(raw.partnerType, [
      "agent",
      "franchisee",
      "supplier",
    ] as const),
    startsAt: timestamp(raw.startsAt),
    endsAt: nullableTimestamp(raw.endsAt),
    permanent: boolean(raw.permanent),
    markedAt: timestamp(raw.markedAt),
    reason: string(raw.reason),
    user: {
      id: integer(user.id),
      needoId: string(user.needoId),
      nickname: string(user.nickname),
      avatarUrl: nullableString(user.avatarUrl),
      status: enumValue(user.status, ["active", "inactive"] as const),
    },
  };
};

const decodeAgentListItem = (value: unknown): AgentProfileListItem => {
  const raw = record(value);
  const administration = record(raw.administration);
  const currentRule =
    administration.currentRule === null
      ? null
      : record(administration.currentRule);
  const latestSettlement =
    administration.latestSettlement === null
      ? null
      : record(administration.latestSettlement);
  return {
    ...decodePartner(raw),
    administration: {
      referralCount: integer(administration.referralCount),
      referredShops: array(administration.referredShops).map((item) => {
        const shop = record(item);
        return {
          publicId: string(shop.publicId),
          name: string(shop.name),
          city: string(shop.city),
        };
      }),
      currentRule: currentRule
        ? {
            version: integer(currentRule.version),
            fixedSuccessRewardJpy: integer(currentRule.fixedSuccessRewardJpy),
            profitShareRateBps: integer(currentRule.profitShareRateBps),
            paymentMethod: enumValue(currentRule.paymentMethod, [
              "bank_transfer",
              "ndp",
              "other",
            ] as const),
            effectiveFrom: timestamp(currentRule.effectiveFrom),
            effectiveTo: nullableTimestamp(currentRule.effectiveTo),
          }
        : null,
      latestSettlement: latestSettlement
        ? {
            publicId: string(latestSettlement.publicId),
            status: enumValue(latestSettlement.status, [
              "confirmed",
              "paid",
            ] as const),
            periodStart: timestamp(latestSettlement.periodStart),
            periodEnd: timestamp(latestSettlement.periodEnd),
            totalAmountJpy: integer(latestSettlement.totalAmountJpy),
            confirmedAt: timestamp(latestSettlement.confirmedAt),
            paidAt: nullableTimestamp(latestSettlement.paidAt),
          }
        : null,
    },
  };
};

const decodeReferral = (value: unknown): AgentShopReferral => {
  const raw = record(value);
  const shop = record(raw.shop);
  return {
    publicId: string(raw.publicId),
    agentPublicId: string(raw.agentPublicId),
    status: enumValue(raw.status, ["active", "qualified", "revoked"] as const),
    source: string(raw.source),
    confirmedAt: timestamp(raw.confirmedAt),
    successQualifiedAt: nullableTimestamp(raw.successQualifiedAt),
    reason: string(raw.reason),
    createdAt: timestamp(raw.createdAt),
    shop: {
      publicId: string(shop.publicId),
      name: string(shop.name),
      city: string(shop.city),
    },
  };
};

const decodeRule = (value: unknown): AgentCommissionRule => {
  const raw = record(value);
  return {
    publicId: string(raw.publicId),
    version: integer(raw.version),
    fixedSuccessRewardJpy: integer(raw.fixedSuccessRewardJpy),
    profitShareRateBps: integer(raw.profitShareRateBps),
    paymentMethod: enumValue(raw.paymentMethod, [
      "bank_transfer",
      "ndp",
      "other",
    ] as const),
    paymentDetails:
      raw.paymentDetails === null ? null : record(raw.paymentDetails),
    effectiveFrom: timestamp(raw.effectiveFrom),
    effectiveTo: nullableTimestamp(raw.effectiveTo),
    publishedAt: timestamp(raw.publishedAt),
    publishedById: integer(raw.publishedById),
    reason: string(raw.reason),
    createdAt: timestamp(raw.createdAt),
  };
};

const decodeRuleSummary = (value: unknown): AgentSettlementPreview["rule"] => {
  const raw = record(value);
  return {
    publicId: string(raw.publicId),
    version: integer(raw.version),
    fixedSuccessRewardJpy: integer(raw.fixedSuccessRewardJpy),
    profitShareRateBps: integer(raw.profitShareRateBps),
    paymentMethod: enumValue(raw.paymentMethod, [
      "bank_transfer",
      "ndp",
      "other",
    ] as const),
  };
};

const decodeTotals = (value: unknown): AgentSettlementTotals => {
  const raw = record(value);
  return {
    orderPlatformFeesJpy: integer(raw.orderPlatformFeesJpy),
    saasFeesJpy: integer(raw.saasFeesJpy),
    userRebatesJpy: integer(raw.userRebatesJpy),
    refundsAndReversalsJpy: integer(raw.refundsAndReversalsJpy),
    channelFeesJpy: integer(raw.channelFeesJpy),
    consumptionTaxJpy: integer(raw.consumptionTaxJpy),
    allocatedOperatingCostsJpy: integer(raw.allocatedOperatingCostsJpy),
    pureProfitJpy: integer(raw.pureProfitJpy),
    fixedSuccessRewardJpy: integer(raw.fixedSuccessRewardJpy),
    profitShareRateBps: integer(raw.profitShareRateBps),
    profitShareAmountJpy: integer(raw.profitShareAmountJpy),
    totalAmountJpy: integer(raw.totalAmountJpy),
  };
};

const decodeShopPreview = (value: unknown): AgentSettlementShopPreview => {
  const raw = record(value);
  return {
    ...decodeTotals(raw),
    referralPublicId: string(raw.referralPublicId),
    shopPublicId: string(raw.shopPublicId),
    shopName: string(raw.shopName),
    successRewardEligible: boolean(raw.successRewardEligible),
    externalEvidenceReference: string(raw.externalEvidenceReference),
    externalEvidenceReason: string(raw.externalEvidenceReason),
  };
};

const decodePreview = (value: unknown): AgentSettlementPreview => {
  const raw = record(value);
  return {
    agentPublicId: string(raw.agentPublicId),
    periodStart: timestamp(raw.periodStart),
    periodEnd: timestamp(raw.periodEnd),
    currency: enumValue(raw.currency, ["JPY"] as const),
    rule: decodeRuleSummary(raw.rule),
    totals: decodeTotals(raw.totals),
    shops: array(raw.shops).map(decodeShopPreview),
    generatedAt: timestamp(raw.generatedAt),
  };
};

const decodeSettlement = (value: unknown): AgentSettlement => {
  const raw = record(value);
  return {
    ...decodeTotals(raw),
    publicId: string(raw.publicId),
    agentPublicId: string(raw.agentPublicId),
    periodStart: timestamp(raw.periodStart),
    periodEnd: timestamp(raw.periodEnd),
    status: enumValue(raw.status, ["confirmed", "paid"] as const),
    currency: enumValue(raw.currency, ["JPY"] as const),
    rule: decodeRuleSummary(raw.rule),
    idempotencyKey: string(raw.idempotencyKey),
    confirmedAt: timestamp(raw.confirmedAt),
    confirmedById: integer(raw.confirmedById),
    paidAt: nullableTimestamp(raw.paidAt),
    paidById: nullableInteger(raw.paidById),
    paymentMethod:
      raw.paymentMethod === null
        ? null
        : enumValue(raw.paymentMethod, [
            "bank_transfer",
            "ndp",
            "other",
          ] as const),
    paymentReference: nullableString(raw.paymentReference),
    lines: array(raw.lines).map((item) => {
      const line = record(item);
      return {
        lineType: enumValue(line.lineType, [
          "success_reward",
          "profit_share",
        ] as const),
        referralPublicId: string(line.referralPublicId),
        shopPublicId: string(line.shopPublicId),
        shopName: string(line.shopName),
        orderPlatformFeesJpy: integer(line.orderPlatformFeesJpy),
        saasFeesJpy: integer(line.saasFeesJpy),
        userRebatesJpy: integer(line.userRebatesJpy),
        refundsAndReversalsJpy: integer(line.refundsAndReversalsJpy),
        channelFeesJpy: integer(line.channelFeesJpy),
        consumptionTaxJpy: integer(line.consumptionTaxJpy),
        allocatedOperatingCostsJpy: integer(line.allocatedOperatingCostsJpy),
        pureProfitJpy: integer(line.pureProfitJpy),
        fixedSuccessRewardJpy: integer(line.fixedSuccessRewardJpy),
        profitShareRateBps: integer(line.profitShareRateBps),
        amountJpy: integer(line.amountJpy),
      };
    }),
    createdAt: timestamp(raw.createdAt),
    updatedAt: timestamp(raw.updatedAt),
  };
};

const decodeAssignment = (value: unknown): OperatingCostDirectAssignment => {
  const raw = record(value);
  const shopPublicId = string(raw.shopPublicId);
  if (raw.amountJpy !== undefined)
    return { shopPublicId, amountJpy: integer(raw.amountJpy) };
  return { shopPublicId, shareBps: integer(raw.shareBps) };
};

const decodeOperatingCost = (value: unknown): OperatingCostItem => {
  const raw = record(value);
  return {
    publicId: string(raw.publicId),
    costCode: string(raw.costCode),
    version: integer(raw.version),
    categoryCode: enumValue(raw.categoryCode, [
      "personnel",
      "server",
      "third_party_api",
      "other",
    ] as const),
    name: string(raw.name),
    amountJpy: integer(raw.amountJpy),
    currency: enumValue(raw.currency, ["JPY"] as const),
    periodStart: timestamp(raw.periodStart),
    periodEnd: timestamp(raw.periodEnd),
    allocationMode: enumValue(raw.allocationMode, [
      "equal_active_shops",
      "platform_income_proportional",
      "direct_shops",
    ] as const),
    status: enumValue(raw.status, ["draft", "published", "archived"] as const),
    effectiveAt: timestamp(raw.effectiveAt),
    publishedAt: nullableTimestamp(raw.publishedAt),
    configuredById: integer(raw.configuredById),
    reason: string(raw.reason),
    directAssignments:
      raw.directAssignments === null
        ? null
        : array(raw.directAssignments).map(decodeAssignment),
    allocations: array(raw.allocations).map((item) => {
      const allocation = record(item);
      return {
        shopPublicId: string(allocation.shopPublicId),
        shopName: string(allocation.shopName),
        amountJpy: integer(allocation.amountJpy),
        allocationWeight: nullableString(allocation.allocationWeight),
      };
    }),
    createdAt: timestamp(raw.createdAt),
    updatedAt: timestamp(raw.updatedAt),
  };
};

const query = (value: Record<string, ApiQueryValue>) => value;
const agentPath = (agentPublicId: string) =>
  `/backoffice/agents/${encodeURIComponent(agentPublicId)}`;

export const platformPartnersApi = {
  async markPartnerProfile(
    userId: number,
    body: {
      partnerType: PartnerType;
      startsAt: string;
      endsAt: string | null;
      permanent: boolean;
      reason: string;
    },
  ) {
    return decodePartner(
      await httpClient.request<unknown>(
        `/backoffice/users/${userId}/partner-profiles`,
        { method: "POST", body },
      ),
    );
  },
  async listAgents(
    input: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      status?: AgentStatus;
    } = {},
  ) {
    return page(
      await httpClient.request<unknown>("/backoffice/agents", {
        query: query(input),
      }),
      decodeAgentListItem,
    );
  },
  async listShopReferrals(
    agentPublicId: string,
    input: { page?: number; pageSize?: number; status?: ReferralStatus } = {},
  ) {
    return page(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/shop-referrals`,
        { query: query(input) },
      ),
      decodeReferral,
    );
  },
  async linkShop(
    agentPublicId: string,
    body: {
      shopPublicId: string;
      source: string;
      confirmedAt: string;
      reason: string;
    },
  ) {
    return decodeReferral(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/shop-referrals`,
        { method: "POST", body },
      ),
    );
  },
  async getCommissionRules(
    agentPublicId: string,
    input: { page?: number; pageSize?: number; at?: string } = {},
  ) {
    const raw = record(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/commission-rules`,
        { query: query(input) },
      ),
    );
    return {
      current: raw.current === null ? null : decodeRule(raw.current),
      latestVersion: integer(raw.latestVersion),
      evaluatedAt: timestamp(raw.evaluatedAt),
      history: page(raw.history, decodeRule),
    } satisfies AgentCommissionRuleOverview;
  },
  async publishCommissionRule(
    agentPublicId: string,
    body: {
      fixedSuccessRewardJpy: number;
      profitShareRateBps: number;
      paymentMethod: PaymentMethod;
      paymentDetails?: Record<string, unknown> | null;
      effectiveFrom: string;
      reason: string;
    },
  ) {
    return decodeRule(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/commission-rules`,
        { method: "POST", body },
      ),
    );
  },
  async listSettlements(
    agentPublicId: string,
    input: {
      page?: number;
      pageSize?: number;
      status?: "confirmed" | "paid";
      periodStart?: string;
      periodEnd?: string;
    } = {},
  ) {
    return page(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/settlements`,
        { query: query(input) },
      ),
      decodeSettlement,
    );
  },
  async previewSettlement(
    agentPublicId: string,
    body: {
      periodStart: string;
      periodEnd: string;
      externalDeductions: AgentSettlementExternalDeduction[];
    },
  ) {
    return decodePreview(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/settlements/preview`,
        { method: "POST", body },
      ),
    );
  },
  async confirmSettlement(
    agentPublicId: string,
    body: {
      periodStart: string;
      periodEnd: string;
      externalDeductions: AgentSettlementExternalDeduction[];
      idempotencyKey: string;
    },
  ) {
    const raw = record(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/settlements`,
        { method: "POST", body },
      ),
    );
    return {
      settlement: decodeSettlement(raw.settlement ?? raw),
      applied: raw.applied === undefined ? true : boolean(raw.applied),
    };
  },
  async markSettlementPaid(
    agentPublicId: string,
    settlementPublicId: string,
    body: {
      paymentMethod: PaymentMethod;
      paymentReference: string;
      reason: string;
    },
  ) {
    const raw = record(
      await httpClient.request<unknown>(
        `${agentPath(agentPublicId)}/settlements/${encodeURIComponent(settlementPublicId)}/payment`,
        { method: "POST", body },
      ),
    );
    return {
      settlement: decodeSettlement(raw.settlement ?? raw),
      applied: raw.applied === undefined ? true : boolean(raw.applied),
    };
  },
  async listOperatingCosts(
    input: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      categoryCode?: OperatingCostCategory;
      status?: OperatingCostStatus;
      periodStart?: string;
      periodEnd?: string;
    } = {},
  ) {
    return page(
      await httpClient.request<unknown>("/backoffice/operating-costs", {
        query: query(input),
      }),
      decodeOperatingCost,
    );
  },
  async createOperatingCost(
    body: OperatingCostConfigurationInput & { costCode: string },
  ) {
    return decodeOperatingCost(
      await httpClient.request<unknown>("/backoffice/operating-costs", {
        method: "POST",
        body,
      }),
    );
  },
  async updateOperatingCost(
    publicId: string,
    body: OperatingCostConfigurationInput,
  ) {
    return decodeOperatingCost(
      await httpClient.request<unknown>(
        `/backoffice/operating-costs/${encodeURIComponent(publicId)}`,
        { method: "PATCH", body },
      ),
    );
  },
  deleteOperatingCost(publicId: string, reason: string) {
    return httpClient.request<void>(
      `/backoffice/operating-costs/${encodeURIComponent(publicId)}`,
      { method: "DELETE", body: { reason } },
    );
  },
  async publishOperatingCost(publicId: string, reason: string) {
    return decodeOperatingCost(
      await httpClient.request<unknown>(
        `/backoffice/operating-costs/${encodeURIComponent(publicId)}/publish`,
        { method: "POST", body: { reason } },
      ),
    );
  },
};
