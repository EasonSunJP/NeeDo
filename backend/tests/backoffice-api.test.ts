import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AppError } from "../src/utils/app-error";
import {
  MerchantShopContextRepository,
  type MerchantShopContextRepositoryPort
} from "../src/repositories/merchant-shop-context.repository";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const key = `login:fail:${ip}:${email}`;
    const nextCount = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, nextCount);
    this.setValue(key, String(nextCount), options.windowSeconds);

    if (nextCount >= options.failureLimit) {
      this.setValue(`login:lock:${email}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }

    return { count: nextCount, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    this.failureCounts.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:fail:${ip}:${email}`);
    this.values.delete(`login:lock:${email}`);
  }

  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:${email}`, otp, ttlSeconds);
  }

  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(`otp:${email}`);
  }

  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }

  public async hasOtpCooldown(email: string): Promise<boolean> {
    return this.getValue(`otp:cooldown:${email}`) !== null;
  }

  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:cooldown:${email}`, "1", ttlSeconds);
  }

  public async clearOtpCooldown(email: string): Promise<void> {
    this.values.delete(`otp:cooldown:${email}`);
  }

  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);
    if (!stored) {
      return null;
    }
    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }
}

const now = new Date("2026-05-25T00:00:00.000Z");

const makePermission = (code: string, index: number) => ({
  id: index + 1,
  name: code,
  code,
  type: code.startsWith("menu:") ? "menu" : "api",
  module: code.split(":")[0],
  description: code,
  isSystem: true,
  createdAt: now,
  updatedAt: now,
  deletedAt: null
});

const createFixture = async (
  options: {
    merchantShopContextRepository?: MerchantShopContextRepositoryPort;
  } = {}
) => {
  const passwordHash = await hash("Abcd@1234", 12);
  const auditLogs: unknown[] = [];
  const backofficePermissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "backoffice:dashboard:read",
    "backoffice:orders:list",
    "backoffice:schedule:list",
    "backoffice:finance:list",
    "backoffice:finance:export",
    "backoffice:technicians:list",
    "backoffice:technicians:write",
    "backoffice:customers:list",
    "backoffice:customers:write",
    "backoffice:shops:list",
    "backoffice:shops:write",
    "backoffice:merchant-accounts:read",
    "merchant-admin:dashboard:read",
    "merchant-admin:orders:list",
    "merchant-admin:schedule:list",
    "merchant-admin:finance:list",
    "merchant-admin:finance:export",
    "merchant-admin:technicians:list",
    "merchant-admin:technicians:write",
    "merchant-admin:customers:list",
    "merchant-admin:services:list",
    "merchant-admin:shop:read",
    "merchant-admin:shop:write",
    "menu:dashboard",
    "page:dashboard"
  ].map(makePermission);
  const readOnlyPermissions = [
    "auth:me",
    "auth:refresh",
    "auth:logout",
    "backoffice:merchant-accounts:read"
  ].map((code, index) => makePermission(code, 100 + index));
  const adminRole = {
    id: 1,
    name: "Admin",
    code: "admin",
    description: "All permissions",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: backofficePermissions.map((permission, index) => ({
      id: index + 1,
      roleId: 1,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const merchantRole = {
    id: 2,
    name: "Merchant Owner",
    code: "merchant_owner",
    description: "Merchant permissions",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: backofficePermissions
      .filter(
        (permission) =>
          permission.code.startsWith("merchant-admin:") || permission.code.startsWith("auth:")
      )
      .map((permission, index) => ({
        id: 100 + index,
        roleId: 2,
        permissionId: permission.id,
        deletedAt: null,
        permission
      }))
  };
  const viewerRole = {
    id: 3,
    name: "Viewer",
    code: "viewer",
    description: "Read only",
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: readOnlyPermissions.map((permission, index) => ({
      id: 200 + index,
      roleId: 3,
      permissionId: permission.id,
      deletedAt: null,
      permission
    }))
  };
  const users = [
    {
      id: 1,
      email: "admin@example.com",
      phone: null,
      passwordHash,
      username: "NeeDo Admin",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 1,
          userId: 1,
          type: "platform_admin",
          scopeType: "global",
          scopeId: null,
          displayName: "NeeDo Admin",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: adminRole }]
    },
    {
      id: 2,
      email: "merchant@example.com",
      phone: null,
      passwordHash,
      username: "Aoyama Owner",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 2,
          userId: 2,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 11,
          displayName: "Aoyama Owner",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: merchantRole }]
    },
    {
      id: 3,
      email: "viewer@example.com",
      phone: null,
      passwordHash,
      username: "Viewer",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null as Date | null,
      deletedAt: null,
      identities: [
        {
          id: 3,
          userId: 3,
          type: "viewer",
          scopeType: "global",
          scopeId: null,
          displayName: "Viewer",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: viewerRole }]
    }
  ];
  const authRepository = {
    findUserByEmail: jest.fn(
      async (email: string) =>
        users.find((user) => user.email === email && user.deletedAt === null) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        users.find(
          (user) =>
            (user.email === identifier || user.username === identifier) && user.deletedAt === null
        ) ?? null
    ),
    findUserById: jest.fn(
      async (id: number) => users.find((user) => user.id === id && user.deletedAt === null) ?? null
    ),
    updateLastLoginAt: jest.fn(async (id: number, loggedInAt: Date) => {
      const user = users.find((item) => item.id === id);
      if (user) {
        user.lastLoginAt = loggedInAt;
      }
    }),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };
  const auditLogRepository = {
    create: jest.fn(async (entry: unknown) => {
      auditLogs.push(entry);
    })
  };
  const merchantShopContextRepository = {
    listManageableShops: jest.fn(
      async (input: {
        identityScopeType: string;
        identityScopeId: number;
        selectedShopPublicId: string | null;
        page: number;
        pageSize: number;
      }) => ({
        list:
          input.page === 1
            ? [
                {
                  publicId: "shop0000000011",
                  name: "Aoyama Care Studio",
                  city: "Tokyo",
                  status: "published",
                  selected: true
                }
              ]
            : [],
        total: 1,
        page: input.page,
        page_size: input.pageSize
      })
    ),
    resolveShop: jest.fn(),
    resolveDefaultShop: jest.fn()
  };
  let shopState = {
    id: 11,
    shopNo: "0000000011",
    name: "Aoyama Care Studio",
    status: "published",
    serviceLocation: null as null | {
      countryCode: "JP";
      admin1Code: string;
      admin2Code: string;
      verifiedById: number;
    }
  };
  const backofficeRepository = {
    getDashboard: jest.fn(
      async (input: {
        scope: { kind: "platform" } | { kind: "shop"; shopId: number };
        window: { buckets: Array<{ key: string; label: string }> };
      }) => ({
        current: {
          availableScheduleSlots: 8,
          activeTechnicians: 6,
          registeredTechnicians: 10,
          shopCount: input.scope.kind === "platform" ? 4 : null,
          newCustomers: input.scope.kind === "platform" ? 3 : null,
          pendingOrders: 2,
          serviceGmvJpy: 8_800,
          completedCustomerCount: 2
        },
        previous: {
          availableScheduleSlots: 5,
          activeTechnicians: 4,
          registeredTechnicians: 8,
          shopCount: input.scope.kind === "platform" ? 3 : null,
          newCustomers: input.scope.kind === "platform" ? 2 : null,
          serviceGmvJpy: 7_000,
          completedCustomerCount: 1
        },
        buckets: input.window.buckets.map((bucket) => ({
          ...bucket,
          orderCount: 0,
          serviceGmvJpy: 0,
          shopCount: input.scope.kind === "platform" ? 4 : 0,
          registeredTechnicianCount: 10,
          scheduleTotalHours: 0,
          scheduleAvailableHours: 0,
          scheduleAttendanceCount: 0,
          scheduleBookedHours: 0
        })),
        finance: {
          platformNetRevenue: { ndp: 900, testNdp: 90 },
          frozen: { ndp: 500, testNdp: 50 },
          userReward: { ndp: 100, testNdp: 20 },
          walletStock: input.scope.kind === "platform" ? { ndp: 5_000, testNdp: 500 } : null,
          withdrawn: input.scope.kind === "platform" ? { ndp: 200, testNdp: 0 } : null,
          shopNdpCost:
            input.scope.kind === "shop"
              ? { totalNdp: 500, platformNdp: 400, userRewardNdp: 100 }
              : null,
          bucketPlatformNetRevenueNdp: new Map(),
          bucketFrozenNdp: new Map(),
          bucketShopEstimatedGrossProfitJpy: new Map()
        },
        merchant:
          input.scope.kind === "shop"
            ? {
                publicId: "shop0000000011",
                name: "Aoyama Care Studio",
                city: "Tokyo",
                address: "Aoyama 1-1",
                status: "published",
                activeTechnicianCount: 6,
                billing: null,
                wallet: null
              }
            : null,
        membership:
          input.scope.kind === "shop" ? { memberCount: 6, completedCustomerCount: 4 } : null,
        availableCities: input.scope.kind === "platform" ? ["Osaka", "Tokyo"] : []
      })
    ),
    getHeadlineSeries3d: jest.fn(
      async (input: { window: { buckets: Array<{ key: string; label: string }> } }) =>
        input.window.buckets.map((bucket, index) => ({
          ...bucket,
          availableScheduleSlots: index + 1,
          activeTechnicians: index + 2,
          registeredTechnicians: index + 10,
          shopCount: index + 4,
          newCustomers: index
        }))
    ),
    listOrders: jest.fn(async (input: unknown) => ({
      list: [{ id: 31, orderNo: "ND202605250001", status: "pending", shopId: 11 }],
      total: 1,
      page: 1,
      page_size: 20,
      input
    })),
    findOrderById: jest.fn(async ({ id }: { id: number }) =>
      id === 31
        ? {
            id: 31,
            orderNo: "ND202605250001",
            status: "cancelled",
            paymentStatus: "pending" as const,
            customerUserId: 101,
            customerProfileId: 201,
            customerName: "Aya Customer",
            serviceId: 1,
            serviceName: "Shiatsu Recovery",
            shopId: 11,
            shopName: "Aoyama Care Studio",
            technicianProfileId: 301,
            technicianNeedoId: "s0000000301",
            technicianName: "Mika Tanaka",
            fulfillmentMode: "store",
            priceAmount: 8800,
            totalAmountJpy: 14500,
            amountSource: "checkout" as const,
            currency: "JPY",
            paymentMethod: "ndp" as const,
            checkoutPaymentAmountNdp: 14500,
            ndpCurrency: "TEST_NDP" as const,
            startsAt: "2026-05-25T01:00:00.000Z",
            endsAt: "2026-05-25T02:00:00.000Z",
            note: null,
            cancelReason: "技师临时无法到达",
            createdAt: "2026-05-24T23:00:00.000Z",
            updatedAt: "2026-05-25T04:00:00.000Z",
            performanceAssessment: {
              id: 81,
              bookingOrderId: 31,
              technicianProfileId: 301,
              outcome: "technician_cancelled" as const,
              treatment: "counted" as const,
              version: 3,
              currentRevisionId: 93,
              createdAt: "2026-05-25T02:00:00.000Z",
              updatedAt: "2026-05-25T04:00:00.000Z"
            },
            timelineEvents: [
              {
                id: "service:501",
                type: "ADD_ON_ACCEPTED" as const,
                createdAt: "2026-05-25T02:20:00.000Z",
                actorUserId: 301,
                actorName: "Mika Tanaka",
                actorAvatarUrl: "/avatars/mika.png",
                publicReason: null,
                addOnId: 44,
                serviceId: 7,
                serviceName: "Extended care 60 minutes",
                priceAmountJpy: 8800,
                currency: "JPY" as const,
                durationMinutes: 60
              },
              {
                id: "performance:92",
                type: "SPECIAL_CANCELLATION_APPLIED" as const,
                createdAt: "2026-05-25T03:00:00.000Z",
                actorUserId: 1,
                actorName: "Operations Admin",
                actorAvatarUrl: "/avatars/admin.png",
                publicReason: "不可抗力",
                internalNote: "后台核验材料 A"
              },
              {
                id: "performance:93",
                type: "SPECIAL_CANCELLATION_REVOKED" as const,
                createdAt: "2026-05-25T04:00:00.000Z",
                actorUserId: 1,
                actorName: "Operations Admin",
                actorAvatarUrl: "/avatars/admin.png",
                publicReason: "用户投诉后复核",
                internalNote: "投诉工单 C-123"
              }
            ]
          }
        : null
    ),
    listSchedule: jest.fn(async () => ({
      list: [{ id: 41, shopId: 11, status: "available" }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listFinanceSettlements: jest.fn(async () => ({
      list: [
        {
          id: 51,
          bookingOrderId: 31,
          orderType: "request",
          orderNo: "ND202605250001",
          referenceType: "booking_order",
          referenceId: 31,
          status: "settled",
          shopId: 11,
          shopName: "Aoyama Care Studio",
          estimatedServiceGmvJpy: 8800,
          platformCollectedServiceAmountJpy: 0,
          offlineReportedServiceAmountJpy: 0,
          unknownOrUnreportedServiceAmountJpy: 8800,
          platformNdpRevenue: 700,
          cRequestFeeHoldNdp: 300,
          cRequestFeeActualNdp: 300,
          requestFeeNdpRevenue: 300,
          userRewardNdpCost: 100,
          pendingHoldNdp: 0,
          campaignDiscountNdp: 0,
          releasedNdp: 0,
          penaltyNdp: 0,
          compensationToUserNdp: 0,
          appliedFeeRuleIds: ["rule_set:1:rule:1"],
          moneyTimeline: [],
          createdAt: now.toISOString()
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    summarizeNdpByCurrency: jest.fn(async () => [
      {
        ndpCurrency: "NDP",
        checkoutPaymentNdp: 5_000,
        bPlatformFeeActualNdp: 700,
        cRequestFeeActualNdp: 300,
        penaltyNdp: 10,
        userRewardNdp: 100,
        compensationToUserNdp: 50,
        bPlatformFeeHoldNdp: 800,
        cRequestFeeHoldNdp: 350,
        releasedNdp: 25,
        campaignDiscountNdp: 40
      },
      {
        ndpCurrency: "TEST_NDP",
        checkoutPaymentNdp: 17_600,
        bPlatformFeeActualNdp: 999,
        cRequestFeeActualNdp: 99,
        penaltyNdp: 2,
        userRewardNdp: 50,
        compensationToUserNdp: 10,
        bPlatformFeeHoldNdp: 1200,
        cRequestFeeHoldNdp: 200,
        releasedNdp: 20,
        campaignDiscountNdp: 30
      }
    ]),
    exportFinanceSettlements: jest.fn(async () => ({
      filename: "merchant-finance-settlements.csv",
      contentType: "text/csv; charset=utf-8",
      content:
        "id,orderType,orderNo,platformNdpRevenue,requestFeeNdpRevenue\n51,request,ND202605250001,700,300"
    })),
    listTechnicians: jest.fn(async () => ({
      list: [{ id: 7, displayName: "Mika Tanaka", shopId: 11 }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    listCustomers: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    listServices: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    listCustomerTimeline: jest.fn(async (input: { page: number; pageSize: number }) => ({
      list: [
        {
          id: "audit-1",
          action: "backoffice.customer.update",
          actorName: "NeeDo Admin",
          actorAvatarUrl: null,
          createdAt: now.toISOString(),
          metadata: { message: "updated" }
        }
      ],
      total: 31,
      page: input.page,
      page_size: input.pageSize
    })),
    findCustomerMembershipGrantContext: jest.fn(async () => ({
      customerUserId: 42,
      membershipGrantedBy: { needoId: "o0000000001", username: "NeeDo Admin" }
    })),
    listTechnicianRankings: jest.fn(async () => ({
      list: [
        {
          rank: 1,
          technicianProfileId: 7,
          userId: 17,
          displayName: "Mika Tanaka",
          email: "mika@example.com",
          avatarUrl: null,
          shopId: 11,
          shopName: "Aoyama Care Studio",
          city: "Tokyo",
          serviceArea: "Minato",
          status: "published",
          verifiedAt: now.toISOString(),
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        technicianCount: 1,
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      total: 1,
      page: 1,
      page_size: 20
    })),
    listShops: jest.fn(async () => ({
      list: [{ id: 11, name: "Aoyama Care Studio", status: "published" }],
      total: 1,
      page: 1,
      page_size: 20
    })),
    get shopState() {
      return shopState;
    },
    findUserByEmail: jest.fn(async () => null),
    createShop: jest.fn(
      async (input: {
        name: string;
        serviceCountryCode?: "JP";
        serviceAdmin1Code?: string;
        serviceAdmin2Code?: string;
        serviceLocationAudit?: Record<string, unknown>;
      }) => {
        shopState = {
          ...shopState,
          name: input.name,
          serviceLocation: input.serviceCountryCode
            ? {
                countryCode: input.serviceCountryCode,
                admin1Code: input.serviceAdmin1Code!,
                admin2Code: input.serviceAdmin2Code!,
                verifiedById: 1
              }
            : shopState.serviceLocation
        };
        if (input.serviceLocationAudit) {
          auditLogs.push({
            ...input.serviceLocationAudit,
            metadata: {
              ...(input.serviceLocationAudit.metadata as Record<string, unknown>),
              shopNo: shopState.shopNo
            }
          });
        }
        return shopState;
      }
    ),
    updateShop: jest.fn(
      async (
        id: number,
        input: {
          name?: string;
          serviceCountryCode?: "JP";
          serviceAdmin1Code?: string;
          serviceAdmin2Code?: string;
        },
        mutation?: {
          verifiedById: number;
          serviceLocationAudit?: Record<string, unknown>;
        }
      ) => {
        if (
          input.serviceCountryCode &&
          (input.serviceAdmin1Code !== "13" || input.serviceAdmin2Code !== "13104")
        ) {
          throw new AppError({
            code: ERROR_CODES.VALIDATION,
            message: "error.administrative_region.invalid_hierarchy",
            statusCode: 400
          });
        }
        shopState = {
          ...shopState,
          name: input.name ?? shopState.name,
          serviceLocation: input.serviceCountryCode
            ? {
                countryCode: input.serviceCountryCode,
                admin1Code: input.serviceAdmin1Code!,
                admin2Code: input.serviceAdmin2Code!,
                verifiedById: mutation!.verifiedById
              }
            : shopState.serviceLocation
        };
        if (mutation?.serviceLocationAudit) {
          auditLogs.push({
            ...mutation.serviceLocationAudit,
            metadata: {
              ...(mutation.serviceLocationAudit.metadata as Record<string, unknown>),
              shopNo: shopState.shopNo
            }
          });
        }
        return shopState;
      }
    ),
    updateTechnician: jest.fn(async (input: Record<string, unknown>) => ({
      id: input.technicianId,
      userId: 17,
      needoId: "n0000000017",
      displayName: "Mika Tanaka",
      email: "mika@example.com",
      avatarUrl: null,
      shopId: 11,
      shopName: "Aoyama Care Studio",
      city: "Tokyo",
      serviceArea: "Minato",
      employmentType: input.employmentType,
      employmentStartedAt: input.employmentStartedAt,
      status: "published",
      verifiedAt: now.toISOString(),
      createdAt: now.toISOString()
    }))
  };
  const platformMembershipService = {
    changeEntitlement: jest.fn(
      async (
        _actor: unknown,
        _context: unknown,
        _userId: number,
        command: {
          targetTierCode: "silver" | "gold" | "black_diamond";
          billingCycle: "monthly" | "annual";
        }
      ) => ({
        kind: "grant" as const,
        tierCode: command.targetTierCode,
        tierVersionPublicId: `tier-${command.targetTierCode}-v1`,
        entitlementPublicId: `entitlement-${command.targetTierCode}-1`,
        startsAt: now,
        expiresAt:
          command.billingCycle === "annual"
            ? new Date("2027-05-25T00:00:00.000Z")
            : new Date("2026-06-24T00:00:00.000Z"),
        experienceValueNdp: command.targetTierCode === "gold" ? 1_999 : 0,
        idempotent: false
      })
    )
  };
  let showTestNdpData: boolean | null = null;
  const backofficePreferenceRepository = {
    findByUserId: jest.fn(async () => showTestNdpData === null ? null : { showTestNdpData }),
    update: jest.fn(async (input: { showTestNdpData: boolean }) => {
      showTestNdpData = input.showTestNdpData;
      return { showTestNdpData };
    })
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    backofficeRepository,
    backofficePreferenceRepository,
    platformMembershipService,
    merchantShopContextRepository:
      options.merchantShopContextRepository ?? merchantShopContextRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  return {
    app,
    auditLogs,
    backofficeRepository,
    backofficePreferenceRepository,
    merchantShopContextRepository,
    platformMembershipService,
    login
  };
};

describe("Step 12 backoffice and merchant-admin real data APIs", () => {
  it("stores Test NDP visibility separately for the authenticated administrator", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/preferences/test-ndp-visibility")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ showTestNdpData: true, source: "environment_default" });
      });

    await request(fixture.app)
      .put("/api/v1/backoffice/preferences/test-ndp-visibility")
      .set("Authorization", `Bearer ${token}`)
      .send({ showTestNdpData: false })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ showTestNdpData: false, source: "explicit" });
      });

    expect(fixture.backofficePreferenceRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, showTestNdpData: false })
    );

    await request(fixture.app)
      .get("/api/v1/backoffice/finance/ndp-summary?date=2026-05-25")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.testNdpVisible).toBe(false);
        expect(body.data.todayNdpConsumption.testNdp).toBe(0);
        expect(body.data.platformNetRevenue.testNdp).toBe(0);
      });
  });

  it("lists only safe manageable-shop fields with strict pagination, permission, and audit", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    const response = await request(fixture.app)
      .get("/api/v1/merchant-admin/manageable-shops?page=1&page_size=10")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);

    expect(response.body.data).toEqual({
      list: [
        {
          publicId: "shop0000000011",
          name: "Aoyama Care Studio",
          city: "Tokyo",
          status: "published",
          selected: true
        }
      ],
      total: 1,
      page: 1,
      page_size: 10
    });
    expect(fixture.merchantShopContextRepository.listManageableShops).toHaveBeenCalledWith(
      expect.objectContaining({
        identityScopeType: "shop",
        identityScopeId: 11,
        selectedShopPublicId: null,
        page: 1,
        pageSize: 10
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "merchant_admin.manageable_shops.read" })
      ])
    );

    await request(fixture.app)
      .get("/api/v1/merchant-admin/manageable-shops?pageSize=10")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(400);
    await request(fixture.app).get("/api/v1/merchant-admin/manageable-shops").expect(401);

    const viewerToken = await fixture.login("viewer@example.com");
    await request(fixture.app)
      .get("/api/v1/merchant-admin/manageable-shops")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403);
  });

  it("returns the real direct-shop repository row as selected without a token selection", async () => {
    const findFirst = jest.fn(async () => ({
      name: "Aoyama Care Studio",
      city: "Tokyo",
      status: "published",
      publicIdentifier: { publicId: "shop0000000011" }
    }));
    const contextRepository = new MerchantShopContextRepository({
      shop: { findFirst }
    } as never);
    const fixture = await createFixture({ merchantShopContextRepository: contextRepository });
    const merchantToken = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/manageable-shops?page=1&page_size=10")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toEqual({
          list: [
            {
              publicId: "shop0000000011",
              name: "Aoyama Care Studio",
              city: "Tokyo",
              status: "published",
              selected: true
            }
          ],
          total: 1,
          page: 1,
          page_size: 10
        });
      });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 11, deletedAt: null })
      })
    );
  });

  it("routes complimentary membership grants through the formal entitlement service", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .put("/api/v1/backoffice/customers/44/membership")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        membershipLevel: "gold",
        grantMode: "operator_complimentary",
        durationUnit: "month",
        durationValue: 1,
        startsAt: now.toISOString()
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      membershipLevel: "gold",
      membershipGrantMode: "operator_complimentary",
      membershipDurationUnit: "month",
      membershipDurationValue: 1,
      membershipExpiresAt: "2026-06-24T00:00:00.000Z"
    });
    expect(fixture.backofficeRepository.findCustomerMembershipGrantContext).toHaveBeenCalledWith(
      44,
      expect.any(Number)
    );
    expect(fixture.platformMembershipService.changeEntitlement).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      42,
      expect.objectContaining({
        kind: "grant",
        targetTierCode: "gold",
        billingCycle: "monthly",
        source: "operations",
        expectedCurrentLockVersion: null
      })
    );

    await request(fixture.app)
      .put("/api/v1/backoffice/customers/44/membership")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        membershipLevel: "gold",
        grantMode: "operator_complimentary",
        durationUnit: "month",
        durationValue: 3,
        startsAt: now.toISOString()
      })
      .expect(400);
  });

  it("serves paginated user timelines in platform and merchant scope without auditing the read", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const adminAuditCount = fixture.auditLogs.length;

    const platformResponse = await request(fixture.app)
      .get("/api/v1/backoffice/customers/44/timeline?page=2&pageSize=30")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(platformResponse.body.data).toMatchObject({
      total: 31,
      page: 2,
      page_size: 30
    });
    expect(fixture.backofficeRepository.listCustomerTimeline).toHaveBeenCalledWith({
      scope: "platform",
      id: 44,
      page: 2,
      pageSize: 30
    });
    expect(fixture.auditLogs).toHaveLength(adminAuditCount);

    const merchantToken = await fixture.login("merchant@example.com");
    const merchantAuditCount = fixture.auditLogs.length;
    await request(fixture.app)
      .get("/api/v1/merchant-admin/customers/44/timeline?page=3&pageSize=50")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);
    expect(fixture.backofficeRepository.listCustomerTimeline).toHaveBeenLastCalledWith({
      scope: "merchant",
      shopId: 11,
      id: 44,
      page: 3,
      pageSize: 50
    });
    expect(fixture.auditLogs).toHaveLength(merchantAuditCount);

    await request(fixture.app)
      .get("/api/v1/backoffice/customers/44/timeline?pageSize=101")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
  });

  it("updates persisted employment through the protected technician API", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .patch("/api/v1/backoffice/technicians/7")
      .set("Authorization", `Bearer ${token}`)
      .send({
        employmentType: "temporary",
        employmentStartedAt: "2026-08-01T00:00:00.000Z"
      })
      .expect(200);

    expect(response.body.data).toMatchObject({
      employmentType: "temporary",
      employmentStartedAt: "2026-08-01T00:00:00.000Z"
    });
    expect(fixture.backofficeRepository.updateTechnician).toHaveBeenCalledWith({
      scope: "platform",
      technicianId: 7,
      employmentType: "temporary",
      employmentStartedAt: "2026-08-01T00:00:00.000Z"
    });

    await request(fixture.app)
      .patch("/api/v1/backoffice/technicians/7")
      .set("Authorization", `Bearer ${token}`)
      .send({ employmentType: "contractor" })
      .expect(400);

    await request(fixture.app)
      .patch("/api/v1/backoffice/technicians/7")
      .set("Authorization", `Bearer ${token}`)
      .send({ employmentType: "independent" })
      .expect(400);
  });

  it("serves the completed-order technician leaderboard in a Tokyo custom period", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .get(
        "/api/v1/backoffice/technician-rankings?period=custom&from=2026-08-01&to=2026-08-31&sortBy=revenue&sortOrder=desc"
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      list: [
        {
          rank: 1,
          displayName: "Mika Tanaka",
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      period: {
        key: "custom",
        timeZone: "Asia/Tokyo",
        from: "2026-08-01",
        to: "2026-08-31"
      }
    });
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "platform",
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-31",
        window: expect.objectContaining({
          fromInclusive: new Date("2026-07-31T15:00:00.000Z"),
          toExclusive: new Date("2026-08-31T15:00:00.000Z")
        })
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "backoffice.technician_rankings.list",
          targetType: "technician_ranking"
        })
      ])
    );
  });

  it("validates, protects, and exports technician rankings with the same read permission", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const viewerToken = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings?period=custom&from=2026-08-01")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.VALIDATION));

    await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));

    const repositoryCallsBeforeDeniedExport =
      fixture.backofficeRepository.listTechnicianRankings.mock.calls.length;
    await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledTimes(
      repositoryCallsBeforeDeniedExport
    );

    const listResponse = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings?period=month&sortBy=revenue")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const exportResponse = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=month&sortBy=revenue")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(exportResponse.body.data).toMatchObject({
      contentType: "text/csv; charset=utf-8"
    });
    expect(exportResponse.body.data.filename).toContain("technician-rankings-month");
    expect(listResponse.body.data.period).toMatchObject({ key: "month", timeZone: "Asia/Tokyo" });
    expect(exportResponse.body.data.content.replace(/^\uFEFF/, "").split("\n")).toEqual([
      "rank,technicianProfileId,displayName,shopName,city,completedServiceAmountJpy,completedOrderCount,workingDayCount,averageOrderValueJpy",
      "1,7,Mika Tanaka,Aoyama Care Studio,Tokyo,15000,2,1,7500"
    ]);
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "backoffice.technician_rankings.export",
          targetType: "technician_ranking_export"
        })
      ])
    );
  });

  it("neutralizes spreadsheet formulas and escapes CSV delimiter characters in technician ranking exports", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");

    fixture.backofficeRepository.listTechnicianRankings.mockResolvedValue({
      list: [
        {
          rank: 1,
          technicianProfileId: 7,
          userId: 17,
          displayName: "=SUM(1,1)",
          email: "mika@example.com",
          avatarUrl: null,
          shopId: 11,
          shopName: '+Aoyama "Care"',
          city: "@Tokyo",
          serviceArea: "Minato",
          status: "published",
          verifiedAt: now.toISOString(),
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        technicianCount: 1,
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      total: 1,
      page: 1,
      page_size: 100
    });

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=month")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.data.content).toBe(
      '\uFEFFrank,technicianProfileId,displayName,shopName,city,completedServiceAmountJpy,completedOrderCount,workingDayCount,averageOrderValueJpy\n1,7,"\'=SUM(1,1)","\'+Aoyama ""Care""",\'@Tokyo,15000,2,1,7500'
    );
  });

  it("forwards the full custom ranking filter to list and export while preserving CSV order", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const rows = [
      {
        rank: 1,
        technicianProfileId: 31,
        userId: 131,
        displayName: "Kiko Arai",
        email: "kiko@example.com",
        avatarUrl: null,
        shopId: 11,
        shopName: "Aoyama Care Studio",
        city: "Tokyo",
        serviceArea: "Minato",
        status: "published",
        verifiedAt: now.toISOString(),
        completedServiceAmountJpy: 10_000,
        completedOrderCount: 3,
        workingDayCount: 1
      },
      {
        rank: 2,
        technicianProfileId: 32,
        userId: 132,
        displayName: "Riku Sato",
        email: "riku@example.com",
        avatarUrl: null,
        shopId: 11,
        shopName: "Aoyama Care Studio",
        city: "Tokyo",
        serviceArea: "Minato",
        status: "published",
        verifiedAt: now.toISOString(),
        completedServiceAmountJpy: 9_000,
        completedOrderCount: 2,
        workingDayCount: 2
      },
      {
        rank: 3,
        technicianProfileId: 33,
        userId: 133,
        displayName: "Yui Mori",
        email: "yui@example.com",
        avatarUrl: null,
        shopId: 11,
        shopName: "Aoyama Care Studio",
        city: "Tokyo",
        serviceArea: "Minato",
        status: "published",
        verifiedAt: now.toISOString(),
        completedServiceAmountJpy: 6_000,
        completedOrderCount: 1,
        workingDayCount: 3
      }
    ];
    (fixture.backofficeRepository.listTechnicianRankings as jest.Mock).mockImplementation(
      async (input: { page: number; pageSize: number }) => ({
        list: input.page === 1 ? rows.slice(0, 2) : rows.slice(2),
        summary: {
          technicianCount: 3,
          completedServiceAmountJpy: 25_000,
          completedOrderCount: 6,
          workingDayCount: 6
        },
        total: 3,
        page: input.page,
        page_size: input.pageSize
      })
    );
    const query =
      "period=custom&from=2026-08-01&to=2026-08-31&keyword=Kiko&shopId=11&city=Tokyo&sortBy=workingDays&sortOrder=asc&page=1&pageSize=2";

    const listResponse = await request(fixture.app)
      .get(`/api/v1/backoffice/technician-rankings?${query}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const exportResponse = await request(fixture.app)
      .get(`/api/v1/backoffice/technician-rankings/export?${query}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    const expectedInput = {
      scope: "platform",
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
      keyword: "Kiko",
      shopId: 11,
      city: "Tokyo",
      sortBy: "workingDays",
      sortOrder: "asc",
      window: expect.objectContaining({
        period: "custom",
        fromInclusive: new Date("2026-07-31T15:00:00.000Z"),
        toExclusive: new Date("2026-08-31T15:00:00.000Z")
      })
    };
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ ...expectedInput, page: 1, pageSize: 2 })
    );
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ ...expectedInput, page: 1, pageSize: 100 })
    );
    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ ...expectedInput, page: 2, pageSize: 100 })
    );
    expect(listResponse.body.data).toMatchObject({
      period: { key: "custom", from: "2026-08-01", to: "2026-08-31" },
      list: [{ technicianProfileId: 31 }, { technicianProfileId: 32 }]
    });
    expect(exportResponse.body.data.filename).toBe(
      "technician-rankings-custom-2026-08-01_2026-08-31.csv"
    );
    expect(exportResponse.body.data.content.replace(/^\uFEFF/, "").split("\n")).toEqual([
      "rank,technicianProfileId,displayName,shopName,city,completedServiceAmountJpy,completedOrderCount,workingDayCount,averageOrderValueJpy",
      "1,31,Kiko Arai,Aoyama Care Studio,Tokyo,10000,3,1,3333",
      "2,32,Riku Sato,Aoyama Care Studio,Tokyo,9000,2,2,4500",
      "3,33,Yui Mori,Aoyama Care Studio,Tokyo,6000,1,3,6000"
    ]);
  });

  it("stops a technician ranking export when a later page is empty despite its total", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const firstPage = {
      list: [
        {
          rank: 1,
          technicianProfileId: 7,
          userId: 17,
          displayName: "Mika Tanaka",
          email: "mika@example.com",
          avatarUrl: null,
          shopId: 11,
          shopName: "Aoyama Care Studio",
          city: "Tokyo",
          serviceArea: "Minato",
          status: "published",
          verifiedAt: now.toISOString(),
          completedServiceAmountJpy: 15_000,
          completedOrderCount: 2,
          workingDayCount: 1
        }
      ],
      summary: {
        technicianCount: 5_001,
        completedServiceAmountJpy: 15_000,
        completedOrderCount: 2,
        workingDayCount: 1
      },
      total: 5_001,
      page: 1,
      page_size: 100
    };
    fixture.backofficeRepository.listTechnicianRankings
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({ ...firstPage, list: [], page: 2 });

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=month")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledTimes(2);
    expect(response.body.data.content.replace(/^\uFEFF/, "").split("\n")).toHaveLength(2);
  });

  it("caps technician ranking CSV exports at 5,000 rows", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    (fixture.backofficeRepository.listTechnicianRankings as jest.Mock).mockImplementation(
      async (input: { page: number; pageSize: number }) => ({
        list:
          input.page <= 50
            ? Array.from({ length: 100 }, (_, index) => ({
                rank: (input.page - 1) * 100 + index + 1,
                technicianProfileId: (input.page - 1) * 100 + index + 1,
                userId: (input.page - 1) * 100 + index + 101,
                displayName: `Technician ${input.page}-${index + 1}`,
                email: `technician-${input.page}-${index + 1}@example.com`,
                avatarUrl: null,
                shopId: 11,
                shopName: "Aoyama Care Studio",
                city: "Tokyo",
                serviceArea: "Minato",
                status: "published",
                verifiedAt: now.toISOString(),
                completedServiceAmountJpy: 1_000,
                completedOrderCount: 1,
                workingDayCount: 1
              }))
            : [],
        summary: {
          technicianCount: 5_001,
          completedServiceAmountJpy: 5_001_000,
          completedOrderCount: 5_001,
          workingDayCount: 5_001
        },
        total: 5_001,
        page: input.page,
        page_size: input.pageSize
      })
    );

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/technician-rankings/export?period=all")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);

    expect(fixture.backofficeRepository.listTechnicianRankings).toHaveBeenCalledTimes(50);
    expect(response.body.data.content.replace(/^\uFEFF/, "").split("\n")).toHaveLength(5_001);
  });

  it("serves the named operations dashboard from one aggregate call and records filter metadata", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/dashboard?period=custom&from=2026-05-19&to=2026-05-25&city=Tokyo")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      filter: {
        period: "custom",
        from: "2026-05-19",
        to: "2026-05-25",
        timeZone: "Asia/Tokyo",
        granularity: "day",
        city: "Tokyo",
        availableCities: ["Osaka", "Tokyo"]
      },
      summary: {
        availableScheduleSlots: { current: 8, previous: 5, changeRatePercent: 60 },
        activeTechnicians: { current: 6, previous: 4, changeRatePercent: 50 },
        registeredTechnicians: { current: 10, previous: 8, changeRatePercent: 25 },
        shopCount: { current: 4, previous: 3, changeRatePercent: 33.33 },
        newCustomers: { current: 3, previous: 2, changeRatePercent: 50 },
        pendingOrders: 2,
        serviceGmvJpy: 8_800
      },
      series: { buckets: expect.any(Array) },
      headlineSeries3d: {
        from: "2026-05-23",
        to: "2026-05-25",
        timeZone: "Asia/Tokyo",
        buckets: expect.arrayContaining([
          expect.objectContaining({ key: "2026-05-25", availableScheduleSlots: 3 })
        ])
      },
      finance: {
        userReward: { ndp: 100, testNdp: 20 },
        walletStock: expect.objectContaining({
          ndp: 5_000,
          cityFilterApplied: false,
          scopeLabel: "platform_global"
        }),
        withdrawn: expect.objectContaining({ testNdp: 0 })
      },
      shop: null,
      membership: null,
      scope: { kind: "platform", shopPublicId: null }
    });
    expect(response.body.data).not.toHaveProperty("metrics");
    expect(response.body.data).not.toHaveProperty("orders");
    expect(response.body.data).not.toHaveProperty("technicians");
    expect(response.body.data).not.toHaveProperty("shops");
    expect(fixture.backofficeRepository.getDashboard).toHaveBeenCalledTimes(1);
    expect(fixture.backofficeRepository.getHeadlineSeries3d).toHaveBeenCalledTimes(1);
    expect(fixture.backofficeRepository.getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "platform" },
        city: "Tokyo",
        window: expect.objectContaining({
          period: "custom",
          fromDate: "2026-05-19",
          toDate: "2026-05-25"
        })
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "backoffice.dashboard.read",
          targetType: "backoffice_dashboard",
          metadata: {
            period: "custom",
            from: "2026-05-19",
            to: "2026-05-25",
            city: "Tokyo",
            shopId: null
          }
        })
      ])
    );
  });

  it("returns the merchant dashboard without platform-global wallet data", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    const response = await request(fixture.app)
      .get("/api/v1/merchant-admin/dashboard?period=last7days")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      summary: { shopCount: null, newCustomers: null },
      finance: {
        walletStock: null,
        withdrawn: null,
        shopNdpCost: { totalNdp: 500, platformNdp: 400, userRewardNdp: 100 }
      },
      shop: { publicId: "shop0000000011" },
      membership: {
        memberCount: 6,
        memberDataStatus: "ready",
        completedCustomerCount: 4
      },
      scope: { kind: "shop", shopPublicId: "shop0000000011" }
    });
    expect(fixture.backofficeRepository.getDashboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: { kind: "shop", shopId: 11 }, city: null })
    );
  });

  it("strictly rejects dashboard query parameters before aggregate access", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const merchantToken = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard?shopId=11")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard?unknown=value")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/dashboard?city=Tokyo")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/merchant-admin/dashboard?shopId=11")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(400);

    expect(fixture.backofficeRepository.getDashboard).not.toHaveBeenCalled();
  });

  it("keeps dashboard authentication and permission failures stable", async () => {
    const fixture = await createFixture();
    const viewerToken = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard")
      .expect(401)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.TOKEN_INVALID));
    await request(fixture.app)
      .get("/api/v1/backoffice/dashboard")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));
    await request(fixture.app)
      .get("/api/v1/merchant-admin/dashboard")
      .expect(401)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.TOKEN_INVALID));
    await request(fixture.app)
      .get("/api/v1/merchant-admin/dashboard")
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));

    expect(fixture.backofficeRepository.getDashboard).not.toHaveBeenCalled();
  });

  it("reports formal and Test NDP separately while keeping settlement formal-only", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/finance/ndp-summary?date=2026-05-25")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({
      testNdpVisible: true,
      period: { date: "2026-05-25", timeZone: "Asia/Tokyo" },
      todayNdpConsumption: { ndp: 5000, testNdp: 17600 },
      platformNetRevenue: { ndp: 860, testNdp: 1040 },
      requestFeeRevenue: { ndp: 300, testNdp: 99 },
      userRewardCost: { ndp: 100, testNdp: 50 },
      pendingHold: { ndp: 125, testNdp: 282 },
      campaignDiscount: { ndp: 40, testNdp: 30 },
      settleableNdp: 860
    });
    expect(fixture.backofficeRepository.summarizeNdpByCurrency).toHaveBeenCalledWith({
      fromInclusive: new Date("2026-05-24T15:00:00.000Z"),
      toExclusive: new Date("2026-05-25T15:00:00.000Z")
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 1,
          action: "backoffice.finance.ndp_summary.read",
          targetType: "finance_ndp_summary",
          metadata: { date: "2026-05-25", timeZone: "Asia/Tokyo" }
        })
      ])
    );
  });

  it("rejects invalid NDP summary calendar dates before repository access", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/finance/ndp-summary?date=2026-02-30")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(fixture.backofficeRepository.summarizeNdpByCurrency).not.toHaveBeenCalled();
  });

  it("returns a fresh authorized order-performance detail including immutable internal notes", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    const response = await request(fixture.app)
      .get("/api/v1/backoffice/orders/31")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.performanceAssessment).toMatchObject({
      outcome: "technician_cancelled",
      treatment: "counted",
      version: 3
    });
    expect(response.body.data.timelineEvents).toEqual([
      expect.objectContaining({
        id: "service:501",
        type: "ADD_ON_ACCEPTED",
        actorName: "Mika Tanaka",
        serviceName: "Extended care 60 minutes",
        priceAmountJpy: 8800,
        durationMinutes: 60
      }),
      expect.objectContaining({
        id: "performance:92",
        type: "SPECIAL_CANCELLATION_APPLIED",
        internalNote: "后台核验材料 A"
      }),
      expect.objectContaining({
        id: "performance:93",
        type: "SPECIAL_CANCELLATION_REVOKED",
        internalNote: "投诉工单 C-123"
      })
    ]);
    expect(fixture.backofficeRepository.findOrderById).toHaveBeenCalledWith({
      id: 31,
      scope: "platform",
      showTestNdpData: true
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "backoffice.order.read",
          targetType: "booking_order",
          targetId: 31
        })
      ])
    );
  });

  it("returns merchant order detail only inside the authenticated shop and omits internal notes", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    const response = await request(fixture.app)
      .get("/api/v1/merchant-admin/orders/31")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.orderNo).toBe("ND202605250001");
    expect(response.body.data.timelineEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "service:501", actorName: "Mika Tanaka" }),
      expect.objectContaining({ id: "performance:92", internalNote: null })
    ]));
    expect(fixture.backofficeRepository.findOrderById).toHaveBeenCalledWith({
      id: 31,
      scope: "merchant",
      shopId: 11
    });
    expect(fixture.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "merchant_admin.order.read",
        targetType: "booking_order",
        targetId: 31,
        metadata: { bookingOrderId: 31, shopId: 11 }
      })
    ]));
  });

  it("blocks users without the matching backoffice permission", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(403)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN);
      });
    expect(fixture.backofficeRepository.listOrders).not.toHaveBeenCalled();

    await request(fixture.app)
      .get("/api/v1/backoffice/finance/ndp-summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
    expect(fixture.backofficeRepository.summarizeNdpByCurrency).not.toHaveBeenCalled();
  });

  it("scopes merchant-admin orders and exports to the authenticated shop", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/orders")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(fixture.backofficeRepository.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "merchant",
        shopId: 11
      })
    );

    const exportResponse = await request(fixture.app)
      .get("/api/v1/merchant-admin/finance/settlements/export")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(exportResponse.body.data.content).toContain("ND202605250001");
    expect(fixture.backofficeRepository.exportFinanceSettlements).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "merchant",
        shopId: 11
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: 2,
          action: "merchant_admin.finance.export",
          targetType: "finance_settlement_export",
          metadata: { shopId: 11 }
        })
      ])
    );
  });

  it("validates and forwards operations finance search, status, period, city and pagination", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/finance/settlements")
      .query({
        keyword: "ND202609101341243926",
        status: "ready_for_payroll",
        period: "week",
        city: "東京都",
        page: 2,
        pageSize: 20
      })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(fixture.backofficeRepository.listFinanceSettlements).toHaveBeenCalledWith({
      scope: "platform",
      keyword: "ND202609101341243926",
      status: "ready_for_payroll",
      city: "東京都",
      page: 2,
      pageSize: 20,
      from: expect.any(Date),
      to: expect.any(Date)
    });

    fixture.backofficeRepository.listFinanceSettlements.mockClear();
    await request(fixture.app)
      .get("/api/v1/backoffice/finance/settlements?status=paid")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
    expect(fixture.backofficeRepository.listFinanceSettlements).not.toHaveBeenCalled();
  });

  it.each([
    ["orders", "listOrders"],
    ["schedule", "listSchedule"],
    ["finance/settlements", "listFinanceSettlements"],
    ["finance/settlements/export", "exportFinanceSettlements"],
    ["technicians", "listTechnicians"],
    ["customers", "listCustomers"],
    ["services", "listServices"]
  ] as const)("rejects client shop scope on merchant-admin %s", async (path, repositoryMethod) => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");
    const method = (fixture.backofficeRepository as unknown as Record<string, jest.Mock>)[
      repositoryMethod
    ];
    method.mockClear();

    await request(fixture.app)
      .get(`/api/v1/merchant-admin/${path}?shopId=22`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe(ERROR_CODES.VALIDATION);
      });

    expect(method).not.toHaveBeenCalled();
  });

  it("lets an operations administrator preview a selected shop through merchant-admin reads", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("viewer@example.com");

    await request(fixture.app)
      .get("/api/v1/merchant-admin/orders")
      .set("Authorization", `Bearer ${token}`)
      .set("X-NeeDo-Merchant-Preview-Shop-Id", "22")
      .expect(200);

    expect(fixture.backofficeRepository.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "merchant",
        shopId: 22
      })
    );
  });

  it("rejects every write attempted from an operations read-only merchant preview", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .patch("/api/v1/merchant-admin/shop")
      .set("Authorization", `Bearer ${token}`)
      .set("X-NeeDo-Merchant-Preview-Shop-Id", "22")
      .send({ name: "Must not be saved" })
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: ERROR_CODES.FORBIDDEN,
          message: "error.merchant_preview.read_only"
        });
      });

    expect(fixture.backofficeRepository.updateShop).not.toHaveBeenCalled();
  });

  it("creates a shop with one verified service-region assignment and atomic public audit input", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .post("/api/v1/backoffice/shops")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ownerEmail: "new-shop@example.com",
        ownerUsername: "New Shop Owner",
        ownerPassword: "Abcd@1234",
        name: "New Formal Shop",
        city: "Tokyo",
        address: "Shinjuku",
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13",
        serviceAdmin2Code: "13104"
      })
      .expect(201);

    expect(fixture.backofficeRepository.createShop).toHaveBeenCalledWith(
      expect.objectContaining({
        createdById: 1,
        verifiedById: 1,
        serviceLocationAudit: expect.objectContaining({
          actorId: 1,
          action: "backoffice.shop.service_location.verify",
          targetType: "shop",
          targetId: null,
          metadata: {
            countryCode: "JP",
            admin1Code: "13",
            admin2Code: "13104"
          }
        })
      })
    );
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "backoffice.shop.service_location.verify",
          metadata: expect.objectContaining({ shopNo: "0000000011" })
        })
      ])
    );
  });

  it("writes one verified service-region assignment and passes its audit into the mutation", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");

    await request(fixture.app)
      .patch("/api/v1/backoffice/shops/11")
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13",
        serviceAdmin2Code: "13104"
      })
      .expect(200);

    expect(fixture.backofficeRepository.updateShop).toHaveBeenCalledWith(
      11,
      {
        serviceCountryCode: "JP",
        serviceAdmin1Code: "13",
        serviceAdmin2Code: "13104"
      },
      expect.objectContaining({
        verifiedById: 1,
        serviceLocationAudit: expect.objectContaining({
          action: "backoffice.shop.service_location.verify",
          targetType: "shop",
          targetId: null,
          metadata: {
            countryCode: "JP",
            admin1Code: "13",
            admin2Code: "13104"
          }
        })
      })
    );
    expect(fixture.backofficeRepository.shopState.serviceLocation).toEqual({
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104",
      verifiedById: 1
    });
    expect(fixture.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "backoffice.shop.service_location.verify",
          targetType: "shop",
          targetId: null,
          metadata: {
            shopNo: "0000000011",
            countryCode: "JP",
            admin1Code: "13",
            admin2Code: "13104"
          }
        })
      ])
    );
  });

  it("rejects an invalid administrative hierarchy without changing the shop", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");
    const before = structuredClone(fixture.backofficeRepository.shopState);

    await request(fixture.app)
      .patch("/api/v1/backoffice/shops/11")
      .set("Authorization", `Bearer ${token}`)
      .send({
        serviceCountryCode: "JP",
        serviceAdmin1Code: "27",
        serviceAdmin2Code: "13104"
      })
      .expect(400)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          code: ERROR_CODES.VALIDATION,
          message: "error.administrative_region.invalid_hierarchy"
        });
      });

    expect(fixture.backofficeRepository.shopState).toEqual(before);
  });
});
