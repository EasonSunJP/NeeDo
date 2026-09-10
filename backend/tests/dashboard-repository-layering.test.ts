import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import type { DashboardFinanceFacts, DashboardMerchantFacts } from "../src/domain/dashboard";
import { DashboardRepository } from "../src/repositories/dashboard.repository";
import type { DashboardFinanceReader } from "../src/repositories/dashboard-finance.repository";
import type { DashboardMerchantReader } from "../src/repositories/dashboard-merchant.repository";

const input = {
  scope: { kind: "shop", shopId: 21 } as const,
  city: null,
  window: resolveDashboardWindow({ period: "last7days" }, new Date("2026-08-31T03:00:00.000Z"))
};

describe("DashboardRepository finance and merchant layering", () => {
  it("delegates focused reads without applying billing policy in the repository layer", async () => {
    const financeFacts = {
      platformNetRevenue: { ndp: 0, testNdp: 0 },
      frozen: { ndp: 0, testNdp: 0 },
      userReward: { ndp: 0, testNdp: 0 },
      walletStock: null,
      withdrawn: null,
      shopNdpCost: { totalNdp: 0, platformNdp: 0, userRewardNdp: 0 },
      bucketPlatformNetRevenueNdp: new Map(),
      bucketFrozenNdp: new Map(),
      bucketShopEstimatedGrossProfitJpy: new Map()
    } satisfies DashboardFinanceFacts;
    const merchantFacts = {
      publicId: "s0000000021",
      name: "Aoyama",
      city: "Tokyo",
      address: "Aoyama",
      status: "published",
      activeTechnicianCount: 0,
      billing: null,
      wallet: null
    } satisfies DashboardMerchantFacts;
    const financeReader = {
      getFinanceFacts: jest.fn(async () => financeFacts)
    } satisfies DashboardFinanceReader;
    const merchantReader = {
      getMerchantFacts: jest.fn(async () => merchantFacts)
    } satisfies DashboardMerchantReader;
    const repository = new DashboardRepository({} as PrismaClient, financeReader, merchantReader);

    await expect(repository.getFinanceFacts(input)).resolves.toBe(financeFacts);
    await expect(repository.getMerchantFacts(input)).resolves.toBe(merchantFacts);
    expect(financeReader.getFinanceFacts).toHaveBeenCalledWith(input);
    expect(merchantReader.getMerchantFacts).toHaveBeenCalledWith(input);

    const repositorySource = readFileSync(
      join(__dirname, "../src/repositories/dashboard.repository.ts"),
      "utf8"
    );
    expect(repositorySource).not.toContain("SaasBillingPolicyService");
    expect(repositorySource).not.toContain("toISOString()");
    expect(repositorySource).not.toContain("dashboard_finance_flows");
    expect(repositorySource).not.toContain("dashboard_merchant_shop_snapshot");
  });
});
