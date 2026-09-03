import { ERROR_CODES } from "../src/constants/error-codes";
import {
  MembershipAnalyticsIncompleteHistoryError,
  type MembershipAnalyticsListInput,
  type MembershipAnalyticsRepositoryInput,
  type MembershipTrendSeries
} from "../src/domain/membership-analytics";
import type { MembershipAnalyticsRepositoryPort } from "../src/repositories/membership-analytics.repository";
import { MembershipAnalyticsService } from "../src/services/membership-analytics.service";
import {
  backofficeMembershipListQuerySchema,
  backofficeMembershipTrendQuerySchema,
  merchantMembershipListQuerySchema,
  merchantMembershipTrendQuerySchema
} from "../src/validators/membership-analytics.validator";

const now = new Date("2026-09-01T05:30:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "jest" };
const fixedPoints = ["08-26", "08-27", "08-28", "08-29", "08-30", "08-31", "09-01"].map(
  (label, index) => ({ key: `2026-${label}`, label, value: index === 0 ? 1 : 0 })
);
const emptySeries: MembershipTrendSeries = [
  { seriesKey: "added", label: "Added members", unit: "people", points: fixedPoints },
  { seriesKey: "removed", label: "Removed members", unit: "people", points: fixedPoints },
  { seriesKey: "net", label: "Net members", unit: "people", points: fixedPoints }
];

const actor = (overrides: Record<string, unknown> = {}) =>
  ({
    userId: 9,
    roles: ["operator"],
    permissions: ["backoffice.member.analytics.view"],
    currentIdentityType: "platform_admin",
    currentIdentityScopeType: "global",
    currentIdentityScopeId: null,
    ...overrides
  }) as never;

const repository = (): jest.Mocked<MembershipAnalyticsRepositoryPort> => ({
  getTrend: jest.fn<Promise<MembershipTrendSeries>, [MembershipAnalyticsRepositoryInput]>(
    async () => emptySeries
  ),
  listAddedMembers: jest.fn<
    ReturnType<MembershipAnalyticsRepositoryPort["listAddedMembers"]>,
    [MembershipAnalyticsListInput]
  >(async (input) => ({
    list: [],
    total: 0,
    page: input.page,
    page_size: input.pageSize
  }))
});

const audit = () => ({ record: jest.fn<Promise<void>, [unknown]>(async () => undefined) });

describe("membership analytics validation", () => {
  it("reuses strict dashboard periods and normalizes list filters", () => {
    expect(
      backofficeMembershipTrendQuerySchema.parse({
        period: "custom",
        from: "2026-08-01",
        to: "2026-08-31",
        city: " 东京 "
      })
    ).toEqual({ period: "custom", from: "2026-08-01", to: "2026-08-31", city: "东京" });
    expect(
      backofficeMembershipListQuerySchema.parse({
        period: "last7days",
        needoId: " u0000000041 ",
        nickname: " 美咲 ",
        page: "2",
        pageSize: "100"
      })
    ).toMatchObject({
      period: "last7days",
      needoId: "u0000000041",
      nickname: "美咲",
      page: 2,
      pageSize: 100
    });
    expect(merchantMembershipListQuerySchema.parse({ period: "last30days" })).toMatchObject({
      period: "last30days",
      page: 1,
      pageSize: 20
    });
  });

  it.each([
    [backofficeMembershipTrendQuerySchema, { period: "custom", from: "2026-08-01" }],
    [backofficeMembershipTrendQuerySchema, { period: "last7days", from: "2026-08-01" }],
    [
      backofficeMembershipTrendQuerySchema,
      { period: "custom", from: "2026-09-02", to: "2026-09-01" }
    ],
    [backofficeMembershipTrendQuerySchema, { period: "last7days", city: " " }],
    [backofficeMembershipListQuerySchema, { period: "last7days", needoId: "U0000000041" }],
    [backofficeMembershipListQuerySchema, { period: "last7days", needoId: "u41" }],
    [backofficeMembershipListQuerySchema, { period: "last7days", nickname: " " }],
    [backofficeMembershipListQuerySchema, { period: "last7days", page: 0 }],
    [backofficeMembershipListQuerySchema, { period: "last7days", pageSize: 101 }],
    [merchantMembershipTrendQuerySchema, { period: "last7days", city: "东京" }],
    [merchantMembershipTrendQuerySchema, { period: "last7days", shopId: 71 }],
    [merchantMembershipListQuerySchema, { period: "last7days", unknown: true }]
  ])("rejects malformed or out-of-scope query %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });
});

describe("MembershipAnalyticsService", () => {
  it("captures one clock for the platform trend and writes bounded audit metadata", async () => {
    const repo = repository();
    const auditLog = audit();
    const service = new MembershipAnalyticsService(repo, auditLog, () => now);
    const payload = await service.getBackofficeTrend(actor(), context, {
      period: "last7days",
      city: "东京"
    });

    expect(payload).toMatchObject({
      dataStatus: "ready",
      filter: {
        period: "last7days",
        from: "2026-08-26",
        to: "2026-09-01",
        previousFrom: "2026-08-19",
        previousTo: "2026-08-25",
        timeZone: "Asia/Tokyo",
        granularity: "day",
        city: "东京",
        evaluatedAt: now.toISOString()
      }
    });
    expect(repo.getTrend).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "platform" },
        city: "东京",
        evaluatedAt: now,
        window: expect.objectContaining({ fromDate: "2026-08-26", toDate: "2026-09-01" })
      })
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.members.analytics.trend.read",
        targetType: "MembershipAnalytics",
        targetId: null,
        metadata: {
          period: "last7days",
          from: "2026-08-26",
          to: "2026-09-01",
          city: "东京",
          shopId: null,
          page: 1,
          pageSize: 0,
          hasNeedoId: false,
          hasNickname: false,
          resultCount: 21
        }
      })
    );
  });

  it("resolves merchant scope only from the authenticated selected shop", async () => {
    const repo = repository();
    const auditLog = audit();
    const service = new MembershipAnalyticsService(repo, auditLog, () => now);
    const merchant = actor({
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "merchant_account",
      currentIdentityScopeId: 501,
      selectedMerchantShopId: 71
    });
    await service.listMerchantMembers(merchant, context, {
      period: "last7days",
      page: 2,
      pageSize: 20,
      needoId: "u0000000041",
      nickname: "美咲"
    });
    expect(repo.listAddedMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: "shop", shopId: 71 },
        city: null,
        page: 2,
        pageSize: 20
      })
    );
    const auditCall = auditLog.record.mock.calls[0]?.[0];
    expect(auditCall).toEqual(
      expect.objectContaining({
        action: "merchant.members.analytics.list.read",
        targetId: 71,
        metadata: expect.objectContaining({
          city: null,
          shopId: 71,
          page: 2,
          pageSize: 20,
          hasNeedoId: true,
          hasNickname: true,
          resultCount: 0
        })
      })
    );
    expect(JSON.stringify(auditCall)).not.toContain("u0000000041");
    expect(JSON.stringify(auditCall)).not.toContain("美咲");
  });

  it.each([
    actor({
      currentIdentityType: "merchant",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 71
    }),
    actor({
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 41
    }),
    actor({
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 51
    })
  ])("rejects non-platform identities from backoffice reads", async (invalidActor) => {
    const repo = repository();
    const service = new MembershipAnalyticsService(repo, audit(), () => now);
    await expect(
      service.getBackofficeTrend(invalidActor, context, { period: "last7days" })
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repo.getTrend).not.toHaveBeenCalled();
  });

  it("rejects customer and technician identities before merchant repository access", async () => {
    const repo = repository();
    const service = new MembershipAnalyticsService(repo, audit(), () => now);
    await expect(
      service.getMerchantTrend(
        actor({
          currentIdentityType: "customer",
          currentIdentityScopeType: "customer_profile",
          currentIdentityScopeId: 41
        }),
        context,
        { period: "last7days" }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
    expect(repo.getTrend).not.toHaveBeenCalled();
  });

  it("maps incomplete lifecycle authority to the stable public 409", async () => {
    const repo = repository();
    repo.getTrend.mockRejectedValueOnce(new MembershipAnalyticsIncompleteHistoryError());
    const service = new MembershipAnalyticsService(repo, audit(), () => now);
    await expect(
      service.getBackofficeTrend(actor(), context, { period: "last7days" })
    ).rejects.toMatchObject({
      code: ERROR_CODES.MEMBERSHIP_ANALYTICS_INCOMPLETE_HISTORY,
      message: "error.membership_analytics.incomplete_history",
      statusCode: 409
    });
  });
});
