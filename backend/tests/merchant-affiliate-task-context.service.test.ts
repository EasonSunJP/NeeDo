import { ERROR_CODES } from "../src/constants/error-codes";
import type { AffiliateTaskFeeSnapshot } from "../src/services/affiliate-platform-fee.service";
import type { AffiliateTaskRecord } from "../src/services/affiliate-task.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  MerchantAffiliateTaskContextService,
  type MerchantAffiliatePublisherOption,
  type MerchantAffiliateServiceOption,
  type MerchantAffiliateShopOption,
  type MerchantAffiliateTaskContextRepositoryPort
} from "../src/services/merchant-affiliate-task-context.service";
import { AppError } from "../src/utils/app-error";
import { buildPaginatedResponse } from "../src/utils/pagination";

const now = new Date("2026-08-30T02:00:00.000Z");
const shopActor: AuthenticatedAccessContext = {
  userId: 7,
  email: "merchant@example.test",
  accessTokenJti: "affiliate-context-access",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 21,
  currentIdentityType: "merchant",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: ["page:merchant-affiliate-task"]
};

const taskFields = {
  name: "Shibuya campaign",
  description: "Completed bookings only",
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  customerDiscountType: "none" as const,
  fixedDiscountJpy: 0,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 0,
  claimStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  claimEndsAt: new Date("2026-09-20T00:00:00.000Z"),
  taskStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  taskEndsAt: new Date("2026-09-30T00:00:00.000Z"),
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: null,
  maxCompletedOrdersPerCustomer: 1,
  serviceScopeMode: "selected_services" as const
};

const buildTask = (
  input: Pick<
    AffiliateTaskRecord,
    "id" | "taskCode" | "publisherType" | "publisherMerchantAccountId" | "publisherShopId" | "shops"
  >
): AffiliateTaskRecord => ({
  ...taskFields,
  ...input,
  lineageKey: `lineage-${input.id}`,
  translations: {},
  version: 1,
  lockVersion: 1,
  status: "draft",
  reservedBudgetNdp: 0,
  allocatedBudgetNdp: 0,
  settledBudgetNdp: 0,
  releasedBudgetNdp: 0,
  platformFeeRuleId: null,
  platformFeeBps: 0,
  platformFeeReserveNdp: 0,
  settledPlatformFeeNdp: 0,
  releasedPlatformFeeNdp: 0,
  reviewedById: null,
  reviewedAt: null,
  rejectionReason: null,
  submittedAt: null,
  activatedAt: null,
  createdAt: now,
  updatedAt: now,
  services: [],
  budgetReservation: null
});

const shopTask = buildTask({
  id: 1,
  taskCode: "AT-20260830-0001",
  publisherType: "shop",
  publisherMerchantAccountId: null,
  publisherShopId: 11,
  shops: [{ id: 1, shopId: 11, shopNameSnapshot: "Shibuya Shop" }]
});
const merchantTask = buildTask({
  id: 2,
  taskCode: "AT-20260830-0002",
  publisherType: "merchant_account",
  publisherMerchantAccountId: 31,
  publisherShopId: null,
  shops: [{ id: 2, shopId: 12, shopNameSnapshot: "Shinjuku Shop" }]
});

class InMemoryContextRepository implements MerchantAffiliateTaskContextRepositoryPort {
  public writeCalls = 0;
  public taskDisplayResources: {
    merchantAccounts: Array<{ id: number; name: string }>;
    shops: Array<{ id: number; publicId: string | null }>;
  } = {
    merchantAccounts: [{ id: 31, name: "NeeDo Group" }],
    shops: [
      { id: 11, publicId: "shop0000000011" },
      { id: 12, publicId: "shop0000000012" }
    ]
  };
  public readonly findTaskDisplayResources = jest.fn(async () => this.taskDisplayResources);

  private readonly publishers: MerchantAffiliatePublisherOption[] = [
    {
      publisherType: "merchant_account",
      merchantAccountId: 31,
      shopId: null,
      publicId: null,
      displayName: "NeeDo Group",
      current: false,
      manageableShopCount: 2
    }
  ];
  private readonly shops: MerchantAffiliateShopOption[] = [
    { shopId: 11, publicId: "shop0000000011", name: "Shibuya Shop", city: "Tokyo", activeServiceCount: 1 },
    { shopId: 12, publicId: "shop0000000012", name: "Shinjuku Shop", city: "Tokyo", activeServiceCount: 1 }
  ];
  private readonly services: MerchantAffiliateServiceOption[] = [
    { serviceId: 101, shopId: 11, serviceName: "Cut", priceJpy: 5_000, shopName: "Shibuya Shop", shopPublicId: "shop0000000011" },
    { serviceId: 102, shopId: 12, serviceName: "Color", priceJpy: 8_000, shopName: "Shinjuku Shop", shopPublicId: "shop0000000012" },
    { serviceId: 999, shopId: 99, serviceName: "Outsider", priceJpy: 1, shopName: "Outside", shopPublicId: "shop0000000099" }
  ];

  public async findCurrentShopPublisher(input: { shopId: number; keyword?: string }) {
    const option: MerchantAffiliatePublisherOption = {
      publisherType: "shop",
      merchantAccountId: null,
      shopId: input.shopId,
      publicId: "shop0000000011",
      displayName: "Shibuya Shop",
      current: true,
      manageableShopCount: 1
    };
    return input.keyword && !option.displayName.toLowerCase().includes(input.keyword.toLowerCase()) ? null : option;
  }

  public async listManageableMerchantPublishers(input: { userId: number; keyword?: string; offset: number; limit: number }) {
    const filtered = this.publishers.filter((publisher) =>
      input.keyword ? publisher.displayName.toLowerCase().includes(input.keyword.toLowerCase()) : true
    );
    return { list: filtered.slice(input.offset, input.offset + input.limit), total: filtered.length };
  }

  public async isManageableMerchantAccount(userId: number, merchantAccountId: number) {
    return userId === 7 && merchantAccountId === 31;
  }

  public async listCurrentShop(input: { shopId: number; keyword?: string; page: number; pageSize: number }) {
    const list = this.shops.filter((shop) => shop.shopId === input.shopId && (!input.keyword || shop.name.includes(input.keyword)));
    return buildPaginatedResponse(list, list.length, input);
  }

  public async listMerchantShops(input: { merchantAccountId: number; keyword?: string; page: number; pageSize: number }) {
    const list = this.shops.filter((shop) => !input.keyword || shop.name.includes(input.keyword));
    return buildPaginatedResponse(list, input.merchantAccountId === 31 ? list.length : 0, input);
  }

  public async countEligibleShops(input: { merchantAccountId: number | null; currentShopId: number | null; shopIds: number[] }) {
    const eligible = input.currentShopId === 11 ? [11] : input.merchantAccountId === 31 ? [11, 12] : [];
    return input.shopIds.filter((shopId) => eligible.includes(shopId)).length;
  }

  public async listServices(input: { shopIds: number[]; keyword?: string; page: number; pageSize: number }) {
    const list = this.services.filter(
      (service) => input.shopIds.includes(service.shopId) && (!input.keyword || service.serviceName.includes(input.keyword))
    );
    return buildPaginatedResponse(list, list.length, input);
  }
}

class FeeServiceSpy {
  public readonly calls: Array<{ shopIds: number[]; effectiveAt: Date }> = [];
  public error: unknown;

  public async resolveForTask(shopIds: number[], effectiveAt: Date): Promise<AffiliateTaskFeeSnapshot> {
    this.calls.push({ shopIds, effectiveAt });
    if (this.error) throw this.error;
    return { ruleId: 81, ruleIds: [81], feeBps: 1_000, source: "global", shopIds, effectiveAt };
  }
}

describe("MerchantAffiliateTaskContextService", () => {
  let repository: InMemoryContextRepository;
  let feeService: FeeServiceSpy;
  let service: MerchantAffiliateTaskContextService;

  beforeEach(() => {
    repository = new InMemoryContextRepository();
    feeService = new FeeServiceSpy();
    service = new MerchantAffiliateTaskContextService(repository, feeService, () => now);
  });

  it("lists the current shop and manageable merchant publishers without internal IDs", async () => {
    await expect(service.listPublishers(shopActor, { page: 1, pageSize: 20 })).resolves.toEqual({
      list: [
        expect.objectContaining({
          publisherType: "shop",
          shopId: 11,
          merchantAccountId: null,
          publicId: "shop0000000011"
        }),
        expect.objectContaining({
          publisherType: "merchant_account",
          merchantAccountId: 31,
          shopId: null,
          displayName: "NeeDo Group"
        })
      ],
      total: 2,
      page: 1,
      page_size: 20
    });
  });

  it("rejects merchant accounts and shops outside the actor's publisher scope", async () => {
    await expect(
      service.listShops(shopActor, {
        publisherType: "merchant_account",
        merchantAccountId: 88,
        page: 1,
        pageSize: 20
      })
    ).rejects.toMatchObject({ statusCode: 403, message: "error.affiliate.publisher_scope_invalid" });

    await expect(
      service.listServices(shopActor, {
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: [11, 99],
        page: 1,
        pageSize: 20
      })
    ).rejects.toMatchObject({ statusCode: 403, message: "error.affiliate.publisher_scope_invalid" });
  });

  it("previews the commission and platform fee reserve without writes", async () => {
    await expect(
      service.previewFee(shopActor, {
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: [11, 12],
        totalBudgetNdp: 2_000_000
      })
    ).resolves.toEqual({
      evaluatedAt: now,
      effectiveAt: now,
      platformFeeBps: 1_000,
      commissionBudgetNdp: 2_000_000,
      platformFeeReserveNdp: 200_000,
      grossFreezeNdp: 2_200_000,
      shopRateStatus: "consistent"
    });
    expect(repository.writeCalls).toBe(0);
    expect(feeService.calls).toEqual([{ shopIds: [11, 12], effectiveAt: now }]);
  });

  it("propagates mixed-rate errors without writes", async () => {
    feeService.error = new AppError({
      code: ERROR_CODES.AFFILIATE_PLATFORM_FEE_RATE_MISMATCH,
      statusCode: 409,
      message: "error.affiliate.platform_fee_rate_mismatch"
    });

    await expect(
      service.previewFee(shopActor, {
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: [11, 12],
        totalBudgetNdp: 2_000_000
      })
    ).rejects.toMatchObject({ message: "error.affiliate.platform_fee_rate_mismatch" });
    expect(repository.writeCalls).toBe(0);
  });

  it("batch-projects publisher names and formal shop public IDs", async () => {
    const presented = await service.presentTaskPage({ list: [shopTask, merchantTask], total: 2, page: 1, page_size: 20 });

    expect(presented.list).toEqual([
      expect.objectContaining({
        taskCode: "AT-20260830-0001",
        publisherDisplayName: "Shibuya Shop",
        shops: [expect.objectContaining({ publicId: "shop0000000011" })]
      }),
      expect.objectContaining({
        taskCode: "AT-20260830-0002",
        publisherDisplayName: "NeeDo Group",
        shops: [expect.objectContaining({ publicId: "shop0000000012" })]
      })
    ]);
    expect(repository.findTaskDisplayResources).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a formal shop public ID is unavailable", async () => {
    repository.taskDisplayResources.shops[0] = { id: 11, publicId: null };

    await expect(service.presentTask(shopTask)).rejects.toMatchObject({
      code: 40954,
      statusCode: 409,
      message: "error.affiliate.shop_public_id_unavailable"
    });
  });
});
