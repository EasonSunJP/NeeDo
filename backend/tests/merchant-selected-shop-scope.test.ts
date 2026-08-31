import { ERROR_CODES } from "../src/constants/error-codes";
import { BackofficeService } from "../src/services/backoffice.service";
import { BookingService } from "../src/services/booking.service";
import { CompensationProfileService } from "../src/services/compensation-profile.service";
import { LedgerService } from "../src/services/ledger.service";
import { assertMerchantShopId, requireMerchantShopId } from "../src/services/merchant-shop-scope";
import { PayrollSchedulePolicyService } from "../src/services/payroll-schedule-policy.service";
import { PricingModeService } from "../src/services/pricing-mode.service";
import { TechnicianShopAffiliationService } from "../src/services/technician-shop-affiliation.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";

const SHOP_A_ID = 11;
const SHOP_B_ID = 12;
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };

// This is the access context produced after Task 5 has revalidated the token's
// public shop claim against the merchant-account membership repository.
const selectedShopBActor = {
  userId: 5,
  email: "merchant@example.com",
  accessTokenJti: "selected-shop-b",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 51,
  currentIdentityType: "merchant_organization",
  currentIdentityScopeType: "merchant_account",
  currentIdentityScopeId: 41,
  selectedMerchantShopId: SHOP_B_ID,
  selectedMerchantShopPublicId: "shop0000000002",
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:dashboard:read"]
} as AuthenticatedAccessContext;

const emptyPage = { list: [], total: 0, page: 1, page_size: 20 };
const dashboardFacts = {
  current: {
    availableScheduleSlots: 0,
    activeTechnicians: 0,
    registeredTechnicians: 0,
    shopCount: null,
    newCustomers: null,
    pendingOrders: 0,
    serviceGmvJpy: 0,
    completedCustomerCount: 0
  },
  previous: {
    availableScheduleSlots: 0,
    activeTechnicians: 0,
    registeredTechnicians: 0,
    shopCount: null,
    newCustomers: null,
    pendingOrders: 0,
    serviceGmvJpy: 0,
    completedCustomerCount: 0
  },
  buckets: [],
  finance: {
    platformNetRevenue: { ndp: 0, testNdp: 0 },
    frozen: { ndp: 0, testNdp: 0 },
    userReward: { ndp: 0, testNdp: 0 },
    walletStock: null,
    withdrawn: null,
    shopNdpCost: { totalNdp: 0, platformNdp: 0, userRewardNdp: 0 },
    bucketPlatformNetRevenueNdp: new Map(),
    bucketFrozenNdp: new Map(),
    bucketShopEstimatedGrossProfitJpy: new Map()
  },
  merchant: {
    publicId: "shop0000000002",
    name: "Shop B",
    city: "Tokyo",
    address: "2-2",
    status: "published",
    activeTechnicianCount: 0,
    billing: null,
    wallet: null
  },
  availableCities: []
};

describe("merchant-account selected shop scope", () => {
  it("resolves preview, direct identity, and selected merchant-account shop in that order", () => {
    expect(
      requireMerchantShopId({
        ...selectedShopBActor,
        isReadOnlyMerchantPreview: true,
        merchantPreviewShopId: 99,
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 77
      })
    ).toBe(99);
    expect(
      requireMerchantShopId({
        ...selectedShopBActor,
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 77
      })
    ).toBe(77);
    expect(requireMerchantShopId(selectedShopBActor)).toBe(SHOP_B_ID);
    expect(assertMerchantShopId(selectedShopBActor, SHOP_B_ID)).toBe(SHOP_B_ID);
    expect(() => assertMerchantShopId(selectedShopBActor, SHOP_A_ID)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 })
    );
    expect(() =>
      requireMerchantShopId({
        ...selectedShopBActor,
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: 5
      })
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 }));
  });

  it("uses Shop B across dashboard, orders, schedule, finance, employees, and settings reads/writes", async () => {
    const repository = {
      getDashboard: jest.fn(async () => dashboardFacts),
      listOrders: jest.fn(async () => emptyPage),
      listSchedule: jest.fn(async () => emptyPage),
      listFinanceSettlements: jest.fn(async () => emptyPage),
      listShops: jest.fn(async () => emptyPage),
      updateMerchantShopProfile: jest.fn(async ({ shopId }: { shopId: number }) => ({
        id: shopId
      }))
    };
    const service = new BackofficeService(
      repository as never,
      { record: jest.fn(async () => undefined) } as never,
      () => new Date("2026-08-31T00:00:00.000Z")
    );

    await service.getMerchantDashboard(selectedShopBActor, context, { period: "today" });
    await service.listMerchantOrders(selectedShopBActor, context, { page: 1, pageSize: 20 });
    await service.listMerchantSchedule(selectedShopBActor, context, { page: 1, pageSize: 20 });
    await service.listMerchantFinance(selectedShopBActor, context, { page: 1, pageSize: 20 });
    await service.getMerchantShop(selectedShopBActor, context);
    await service.updateMerchantShop({ name: "Shop B updated" }, selectedShopBActor, context);

    expect(repository.getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "shop", shopId: SHOP_B_ID } })
    );
    expect(repository.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_B_ID })
    );
    expect(repository.listSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_B_ID })
    );
    expect(repository.listFinanceSettlements).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_B_ID })
    );
    expect(repository.listShops).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_B_ID })
    );
    expect(repository.updateMerchantShopProfile).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_B_ID })
    );

    const employeeRepository = { listCurrentShopEmployees: jest.fn(async () => emptyPage) };
    const employees = new TechnicianShopAffiliationService(
      employeeRepository as never,
      {} as never,
      { record: jest.fn(async () => undefined) } as never
    );
    await employees.listCurrentShopEmployees(selectedShopBActor, context, {
      page: 1,
      pageSize: 20
    });
    expect(employeeRepository.listCurrentShopEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_B_ID })
    );
  });

  it("keeps merchant-account manageable-shop pagination deterministic without fabricating selected rows", async () => {
    const contextRepository = {
      listManageableShops: jest.fn(async () => ({
        list: [
          {
            publicId: "shop0000000001",
            name: "Shop A",
            city: "Tokyo",
            status: "published",
            selected: false
          }
        ],
        total: 2,
        page: 1,
        page_size: 1
      }))
    };
    const service = new BackofficeService(
      {} as never,
      { record: jest.fn(async () => undefined) } as never,
      () => new Date("2026-08-31T00:00:00.000Z"),
      undefined,
      contextRepository as never
    );

    const result = await service.listManageableMerchantShops(selectedShopBActor, context, {
      page: 1,
      page_size: 1
    });

    expect(result.list).toEqual([
      expect.objectContaining({ publicId: "shop0000000001", selected: false })
    ]);
    expect(result.list.filter((shop) => shop.selected)).toHaveLength(0);
    expect(contextRepository.listManageableShops).toHaveBeenCalledWith({
      identityScopeType: "merchant_account",
      identityScopeId: 41,
      selectedShopPublicId: "shop0000000002",
      now: new Date("2026-08-31T00:00:00.000Z"),
      page: 1,
      pageSize: 1
    });
  });

  it("uses Shop B for booking order and schedule queries", async () => {
    const repository = {
      listOrders: jest.fn(async () => emptyPage),
      listScheduleSlots: jest.fn(async () => emptyPage)
    };
    const service = new BookingService(repository as never);

    await service.listOrders(selectedShopBActor, { page: 1, pageSize: 20 });
    await service.listScheduleSlots(selectedShopBActor, {
      page: 1,
      pageSize: 20,
      from: new Date("2026-08-31T00:00:00.000Z"),
      to: new Date("2026-09-01T00:00:00.000Z")
    });

    expect(repository.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: SHOP_B_ID })
    );
    expect(repository.listScheduleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: SHOP_B_ID })
    );
  });

  it("uses Shop B for payroll policy, pricing, compensation, and wallet", async () => {
    const shopPolicy = {
      id: 3,
      shopId: SHOP_B_ID,
      cadence: "monthly",
      weeklySettlementWeekday: null,
      monthlySettlementDay: 25,
      holidayAdjustment: "next_business_day",
      timezone: "Asia/Tokyo",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      status: "active",
      version: 1,
      createdById: 5,
      updatedById: 5,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    } as const;
    const policyRepository = {
      findActiveShopPolicy: jest.fn(async () => shopPolicy),
      replaceShopPolicy: jest.fn(async () => ({ ...shopPolicy, version: 2 })),
      listNonBusinessDateKeys: jest.fn(async () => [])
    };
    const policies = new PayrollSchedulePolicyService(
      policyRepository as never,
      { record: jest.fn(async () => undefined) } as never,
      () => "2026-08-31"
    );
    await policies.getShopPolicy(selectedShopBActor, context);
    await policies.updateShopPolicy(selectedShopBActor, context, {
      cadence: "monthly",
      weeklySettlementWeekday: null,
      monthlySettlementDay: 25,
      holidayAdjustment: "next_business_day",
      timezone: "Asia/Tokyo",
      effectiveFrom: "2026-01-01",
      effectiveTo: null
    });
    expect(policyRepository.findActiveShopPolicy).toHaveBeenCalledWith(
      SHOP_B_ID,
      expect.any(String)
    );
    expect(policyRepository.replaceShopPolicy).toHaveBeenCalledWith(
      SHOP_B_ID,
      expect.any(Object),
      selectedShopBActor.userId
    );

    const pricingRepository = {
      findShopPricingMode: jest.fn(async () => ({
        shopId: SHOP_B_ID,
        pricingMode: "merchant",
        technicianPricingRatePercent: 100,
        updatedAt: null,
        updatedBy: null
      })),
      updateShopPricingMode: jest.fn(async () => ({
        shopId: SHOP_B_ID,
        pricingMode: "technician",
        technicianPricingRatePercent: 80,
        updatedAt: null,
        updatedBy: selectedShopBActor.userId
      }))
    };
    const pricing = new PricingModeService(
      pricingRepository as never,
      { record: jest.fn(async () => undefined) } as never
    );
    await pricing.getShopPricingMode(selectedShopBActor, context, SHOP_B_ID);
    await pricing.updateShopPricingMode(selectedShopBActor, context, SHOP_B_ID, "technician", 80);

    const compensationRepository = {
      findActiveProfile: jest.fn(async () => null),
      findShopFallbackRule: jest.fn(async () => null)
    };
    const compensation = new CompensationProfileService(
      compensationRepository as never,
      { record: jest.fn(async () => undefined) } as never
    );
    await compensation.getCompensationProfile(selectedShopBActor, context, SHOP_B_ID, 71);
    expect(compensationRepository.findActiveProfile).toHaveBeenCalledWith(SHOP_B_ID, 71);

    const walletRepository = {
      findUserAccountClassification: jest.fn(async () => ({ isTestAccount: false })),
      findWallet: jest.fn(async () => ({
        id: 9,
        ownerType: "shop",
        ownerId: SHOP_B_ID,
        currency: "NDP",
        availableBalance: 0,
        frozenBalance: 0,
        createdAt: new Date(0),
        updatedAt: new Date(0)
      })),
      getOrCreateWallet: jest.fn()
    };
    await new LedgerService(walletRepository as never).getMyWallet(selectedShopBActor);
    expect(walletRepository.findWallet).toHaveBeenCalledWith({
      ownerType: "shop",
      ownerId: SHOP_B_ID,
      currency: "NDP"
    });
  });

  it("rejects Shop A before a repository mutation", async () => {
    const pricingRepository = {
      findShopPricingMode: jest.fn(),
      updateShopPricingMode: jest.fn()
    };
    const service = new PricingModeService(
      pricingRepository as never,
      { record: jest.fn(async () => undefined) } as never
    );

    await expect(
      service.updateShopPricingMode(selectedShopBActor, context, SHOP_A_ID, "merchant")
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(pricingRepository.findShopPricingMode).not.toHaveBeenCalled();
    expect(pricingRepository.updateShopPricingMode).not.toHaveBeenCalled();
  });
});
