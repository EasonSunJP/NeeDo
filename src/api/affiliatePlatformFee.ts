import { httpClient } from "./httpClient";

export type AffiliatePlatformFeeScope = "global" | "shop";

export interface AffiliatePlatformFeeRule {
  id: number;
  scopeType: AffiliatePlatformFeeScope;
  scopeKey: string;
  shopId: number | null;
  shopName: string | null;
  shopCity: string | null;
  feeBps: number;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  activeKey: string | null;
  reason: string;
  createdByNeedoId: string | null;
  updatedByNeedoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliatePlatformFeeRulePage {
  list: AffiliatePlatformFeeRule[];
  total: number;
  page: number;
  page_size: number;
}

export interface AffiliatePlatformFeeRuleSummary {
  evaluatedAt: string;
  current: AffiliatePlatformFeeRule | null;
  nextScheduled: AffiliatePlatformFeeRule | null;
  latestVersion: number;
}

export interface AffiliatePlatformFeeShopOption {
  id: number;
  name: string;
  city: string;
}

export interface AffiliatePlatformFeeShopPage {
  list: AffiliatePlatformFeeShopOption[];
  total: number;
  page: number;
  page_size: number;
}

export interface AffiliatePlatformFeeRuleQuery
  extends Record<string, boolean | number | string | null | undefined> {
  page?: number;
  pageSize?: number;
  scopeType?: AffiliatePlatformFeeScope;
  shopId?: number;
}

export interface AffiliatePlatformFeeShopQuery
  extends Record<string, boolean | number | string | null | undefined> {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface AffiliatePlatformFeeRuleCreateInput {
  scopeType: AffiliatePlatformFeeScope;
  shopId: number | null;
  feeBps: number;
  expectedVersion: number;
  effectiveFrom: string;
  reason: string;
}

export const affiliatePlatformFeeApi = {
  listRules(query: AffiliatePlatformFeeRuleQuery = {}) {
    return httpClient.request<AffiliatePlatformFeeRulePage>(
      "/backoffice/affiliate/fee-rules",
      { query }
    );
  },
  getGlobalSummary() {
    return httpClient.request<AffiliatePlatformFeeRuleSummary>(
      "/backoffice/affiliate/fee-rules/summary",
      { query: { scopeType: "global" } }
    );
  },
  searchShops(query: AffiliatePlatformFeeShopQuery = {}) {
    return httpClient.request<AffiliatePlatformFeeShopPage>(
      "/backoffice/affiliate/fee-rule-shops",
      { query }
    );
  },
  createRule(body: AffiliatePlatformFeeRuleCreateInput) {
    return httpClient.request<AffiliatePlatformFeeRule>(
      "/backoffice/affiliate/fee-rules",
      { body, method: "POST" }
    );
  }
};
