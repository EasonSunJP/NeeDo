import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type {
  TechnicianDataCenterRepositoryPort,
  TechnicianDataCenterSource
} from "../src/services/technician-data-center.service";
import {
  TechnicianDataCenterService,
  resolveTechnicianDataCenterPeriod
} from "../src/services/technician-data-center.service";

const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "technician@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 2_000_000_000,
  currentIdentityId: 109,
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 31,
  roles: ["technician"],
  permissions: ["technician-data-center:read"]
};

const rule = {
  id: 81,
  sourceType: "technician_override" as const,
  shopId: 73,
  technicianProfileId: 31,
  name: "GINZA 专属技师",
  wageMode: "commission" as const,
  baseSalaryJpy: 280_000,
  hourlyRateJpy: 0,
  dailyRateJpy: 0,
  fixedOrderPayJpy: 0,
  commissionRatePercent: 50,
  extensionCommissionRatePercent: 70,
  nominationFeeJpy: 1_000,
  guaranteedMinimumJpy: 0,
  ndpFeeBearer: "shop" as const,
  technicianNdpSharePercent: 0,
  bonusRules: [{
    id: "monthly-five",
    name: "月间奖励",
    triggerType: "monthly_order_count" as const,
    threshold: 5,
    amountJpy: 3_000,
    active: true
  }],
  deductionRules: []
};

const source: TechnicianDataCenterSource = {
  technician: { id: 31, userId: 9, displayName: "Misaki", employmentStartedAt: "2026-04-01T00:00:00.000Z" },
  affiliation: {
    shopId: 73,
    shopName: "GINZA Calm Body Lab",
    relationshipType: "EXCLUSIVE",
    startsAt: "2026-04-01T00:00:00.000Z"
  },
  incomeModel: { ...rule, version: 3, updatedAt: "2026-08-31T03:00:00.000Z" },
  compensationRulesByBasis: { "technician_override:81": rule },
  recognizedIncomeByOrderId: { 501: 8_000 },
  periodOrders: [
    {
      id: 501,
      orderNo: "BK-501",
      serviceName: "肩颈护理",
      shopName: "GINZA Calm Body Lab",
      status: "completed",
      startsAt: "2026-08-30T01:00:00.000Z",
      endsAt: "2026-08-30T02:30:00.000Z",
      financial: null
    },
    {
      id: 502,
      orderNo: "BK-502",
      serviceName: "加钟护理",
      shopName: "GINZA Calm Body Lab",
      status: "completed",
      startsAt: "2026-08-31T06:00:00.000Z",
      endsAt: "2026-08-31T07:00:00.000Z",
      financial: {
        serviceIncomeStatus: "confirmed",
        baseServiceAmountJpy: 10_000,
        extensionAmountJpy: 4_000,
        nominationChargeAmountJpy: 1_000,
        wasTechnicianNominated: true,
        compensationBasisVersion: "technician_override:81"
      }
    }
  ],
  recentOrders: [],
  upcomingOrderCount: 4,
  nextOrder: null
};

describe("technician data center period resolution", () => {
  const now = new Date("2026-09-01T03:00:00.000Z");

  it.each([
    ["last7days", 7, "day"],
    ["last30days", 6, "five_days"],
    ["week", 7, "day"],
    ["month", 5, "week"],
    ["year", 12, "month"]
  ] as const)("builds aligned %s buckets", (period, bucketCount, bucketUnit) => {
    const result = resolveTechnicianDataCenterPeriod(period, now);
    expect(result.buckets).toHaveLength(bucketCount);
    expect(result.bucketUnit).toBe(bucketUnit);
    expect(result.buckets[0]?.startsAt.getTime()).toBe(result.startsAt.getTime());
    expect(result.buckets.at(-1)?.endsAt.getTime()).toBe(result.endsAt.getTime());
  });
});

describe("TechnicianDataCenterService", () => {
  it("combines payslip income and snapshotted component compensation without inventing values", async () => {
    const repository = { load: jest.fn(async () => source) } as unknown as TechnicianDataCenterRepositoryPort;
    const service = new TechnicianDataCenterService(
      repository,
      { record: jest.fn(async () => undefined) },
      () => new Date("2026-09-01T03:00:00.000Z")
    );

    const result = await service.getMine(actor, { ip: "127.0.0.1", userAgent: "jest" }, "last7days");

    expect(result.period).toBe("last7days");
    expect(result.series).toHaveLength(7);
    expect(result.summary).toMatchObject({
      recognizedIncomeJpy: 16_800,
      completedOrderCount: 2,
      workedMinutes: 150,
      upcomingOrderCount: 4
    });
    expect(result.incomeModel).toMatchObject({
      serviceCommissionRatePercent: 50,
      extensionCommissionRatePercent: 70,
      nominationFeeJpy: 1_000,
      hasBonus: true
    });
    expect(result.series.reduce((sum, point) => sum + point.incomeJpy, 0)).toBe(16_800);
    expect(repository.load).toHaveBeenCalledWith(9, 31, expect.objectContaining({ period: "last7days" }));
  });

  it("rejects non-technician identity scope", async () => {
    const service = new TechnicianDataCenterService(
      { load: jest.fn() },
      { record: jest.fn() }
    );
    await expect(service.getMine(
      { ...actor, currentIdentityType: "merchant_owner" },
      { ip: "127.0.0.1" },
      "week"
    )).rejects.toMatchObject({ statusCode: 403, message: "error.identity.forbidden" });
  });
});
