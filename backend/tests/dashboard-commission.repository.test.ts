import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import {
  calculateTechnicianCommission,
  DashboardCommissionRepository,
  toTokyoBusinessDate,
  type CommissionFacts,
  type DashboardCommissionReader
} from "../src/repositories/dashboard-commission.repository";
import { DashboardRepository } from "../src/repositories/dashboard.repository";

type SqlQuery = { sql?: string; strings?: readonly string[]; values?: unknown[] };
const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ") ?? "";

const window = resolveDashboardWindow(
  { period: "last7days" },
  new Date("2026-08-31T03:00:00.000Z")
);
const input = { scope: { kind: "platform" } as const, city: "Tokyo", window };

const createReader = (rows: unknown[]) => {
  const queryRaw = jest.fn(async (query: SqlQuery) => {
    void query;
    return rows;
  });
  return {
    reader: new DashboardCommissionRepository(
      { $queryRaw: queryRaw } as unknown as PrismaClient
    ),
    queryRaw
  };
};

describe("calculateTechnicianCommission", () => {
  it("allocates each calendar month separately, rounds each profile-month once, then adds settled share", () => {
    expect(calculateTechnicianCommission({
      workDates: [
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 101, monthlyBaseJpy: 310_000, workDate: "2026-01-30", effectiveFrom: "2026-01-01", effectiveTo: "2026-01-31" },
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 101, monthlyBaseJpy: 310_000, workDate: "2026-01-31", effectiveFrom: "2026-01-01", effectiveTo: "2026-01-31" },
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 102, monthlyBaseJpy: 280_000, workDate: "2026-02-01", effectiveFrom: "2026-02-01", effectiveTo: null },
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 102, monthlyBaseJpy: 280_000, workDate: "2026-02-02", effectiveFrom: "2026-02-01", effectiveTo: null }
      ],
      settledShareJpy: 12_000
    })).toBe(52_000);
  });

  it("uses leap-year/month boundaries and deduplicates repeated orders on one work date", () => {
    expect(calculateTechnicianCommission({
      workDates: [
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 1, monthlyBaseJpy: 290_000, workDate: "2024-02-29" },
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 1, monthlyBaseJpy: 290_000, workDate: "2024-02-29" },
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 2, monthlyBaseJpy: 310_000, workDate: "2025-01-01" }
      ],
      settledShareJpy: 0
    })).toBe(20_000);
  });

  it("allocates a part-time technician independently for each authoritative shop", () => {
    expect(calculateTechnicianCommission({
      workDates: [
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 1, monthlyBaseJpy: 310_000, workDate: "2026-01-01" },
        { technicianProfileId: 1, shopId: 10, compensationProfileId: 2, monthlyBaseJpy: 310_000, workDate: "2026-01-01" }
      ],
      settledShareJpy: 0
    })).toBe(20_000);
  });

  it("derives the work date in Tokyo and includes exact effective boundaries", () => {
    expect(toTokyoBusinessDate("2026-01-31T15:00:00.000Z")).toBe("2026-02-01");
    expect(calculateTechnicianCommission({
      workDates: [
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 1, monthlyBaseJpy: 310_000, workDate: "2026-01-01", effectiveFrom: "2026-01-01", effectiveTo: "2026-01-01" },
        { technicianProfileId: 1, shopId: 9, compensationProfileId: 2, monthlyBaseJpy: 280_000, workDate: "2026-02-01", effectiveFrom: "2026-02-01", effectiveTo: "2026-02-01" }
      ],
      settledShareJpy: 0
    })).toBe(20_000);
  });

  it("fails closed on overlapping profiles and unsafe or negative money", () => {
    const overlap = [
      { technicianProfileId: 1, shopId: 9, compensationProfileId: 1, monthlyBaseJpy: 310_000, workDate: "2026-01-01" },
      { technicianProfileId: 1, shopId: 9, compensationProfileId: 2, monthlyBaseJpy: 310_000, workDate: "2026-01-01" }
    ];
    expect(() => calculateTechnicianCommission({ workDates: overlap, settledShareJpy: 0 }))
      .toThrow("Technician commission allocation is invalid");
    expect(() => calculateTechnicianCommission({ workDates: [{ ...overlap[0]!, monthlyBaseJpy: -1 }], settledShareJpy: 0 }))
      .toThrow("Technician commission allocation is invalid");
    expect(() => calculateTechnicianCommission({
      workDates: [{ ...overlap[0]!, effectiveFrom: "2026-02-01", effectiveTo: "2026-01-01" }],
      settledShareJpy: 0
    })).toThrow("Technician commission allocation is invalid");
    expect(() => calculateTechnicianCommission({ workDates: [], settledShareJpy: Number.MAX_SAFE_INTEGER + 1 }))
      .toThrow("Technician commission allocation is invalid");
  });
});

describe("DashboardCommissionRepository", () => {
  it("maps current/previous immutable commission facts from one bounded query", async () => {
    const fixture = createReader([
      { periodKey: "current", dedicatedJpy: 52_000n, partTimeJpy: "12000", marketingNdp: 500, ndpIncomeNdp: 900, affiliatePlatformNdp: 80 },
      { period_key: "previous", dedicated_jpy: 40_000, part_time_jpy: 9_000, marketing_ndp: 300, ndp_income_ndp: 700, affiliate_platform_ndp: 50 }
    ]);

    await expect(fixture.reader.getCommissionFacts(input)).resolves.toEqual({
      dedicatedTechnicianCommission: { current: 52_000, previous: 40_000, dataStatus: "ready" },
      partTimeTechnicianCommission: { current: 12_000, previous: 9_000, dataStatus: "ready" },
      marketingCommission: { current: 500, previous: 300, dataStatus: "ready" },
      agentCommission: { current: null, previous: null, dataStatus: "not_available" },
      ndpIncome: { current: 900, previous: 700, dataStatus: "ready" },
      affiliatePlatformIncome: { current: 80, previous: 50, dataStatus: "ready" },
      consumablesProfit: { current: null, previous: null, dataStatus: "not_connected" }
    });
    expect(fixture.queryRaw).toHaveBeenCalledTimes(1);

    const query = fixture.queryRaw.mock.calls[0]![0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("dashboard_commission_facts");
    expect(sql).toContain("WITH periods AS");
    expect(sql).toContain("payment_confirmed_at >= period.from_inclusive");
    expect(sql).toContain("payment_confirmed_at < period.to_exclusive");
    expect(sql).toContain("service_ended_at >= period.from_inclusive");
    expect(sql).toContain("service_ended_at < period.to_exclusive");
    expect(sql).not.toContain("booking.starts_at >= period.from_inclusive");
    expect(sql).toContain("CONVERT_TZ(session.ended_at");
    expect(sql).toContain("service_end_event.event_type");
    expect(sql).toContain("COUNT(DISTINCT eligible.work_date)");
    expect(sql).toContain("DAY(LAST_DAY(eligible.work_date))");
    expect(sql).toContain("affiliation.relationship_type");
    expect(sql).toContain("profile.employment_type");
    expect(sql).toContain("line.line_type");
    expect(sql).toContain("line.order_id = classified.booking_order_id");
    expect(sql).not.toContain("commission_rate_bps");
    expect(sql).toContain("payslip.status IN");
    expect(sql).toContain("payslip.dispute_status");
    expect(sql).toContain("reward.settled_at >= period.from_inclusive");
    expect(sql).toContain("reward_transaction.kind");
    expect(sql).toContain("contradictory_transaction.kind IN");
    expect(sql).toContain("ledger.reference_id = reward.id");
    expect(sql).toContain("JSON_EXTRACT(ledger.metadata");
    expect(sql).not.toContain("affiliate_budget_reservations");
    expect(sql).toContain("ledger.currency");
    expect(sql).toContain("financial.ndp_currency");
    expect(sql).toContain("settled_platform_income AS");
    expect(sql).toContain("settled_user_rewards AS");
    expect(sql).toContain("financial.user_reward_granted_at >= period.from_inclusive");
    expect(sql).toContain("reward_entry.amount = financial.user_reward_ndp");
    expect(sql).toContain("reward_wallet.owner_id = financial.customer_user_id");
    expect(sql).toContain("booking.shop_id = shop.id");
    expect(sql).toContain("TRIM(shop.city) =");
    expect(query.values).toEqual(expect.arrayContaining([
      "current", "previous", "completed", "confirmed", "NDP", "settlement",
      "settled", "applied", "commission", "approved", "scheduled", "paid", "locked", "Tokyo"
    ]));
  });

  it("uses ready zero for an absent period and fails closed on malformed facts", async () => {
    await expect(createReader([]).reader.getCommissionFacts(input)).resolves.toMatchObject({
      dedicatedTechnicianCommission: { current: 0, previous: 0, dataStatus: "ready" },
      marketingCommission: { current: 0, previous: 0, dataStatus: "ready" }
    });
    await expect(createReader([{ periodKey: "current", dedicatedJpy: -1, partTimeJpy: 0, marketingNdp: 0, ndpIncomeNdp: 0, affiliatePlatformNdp: 0 }]).reader.getCommissionFacts(input))
      .rejects.toThrow("Dashboard commission aggregate must be a non-negative safe integer");
  });

  it("delegates through DashboardRepository without composing Task 4", async () => {
    const facts = {
      dedicatedTechnicianCommission: { current: 1, previous: 0, dataStatus: "ready" },
      partTimeTechnicianCommission: { current: 2, previous: 0, dataStatus: "ready" },
      marketingCommission: { current: 3, previous: 0, dataStatus: "ready" },
      agentCommission: { current: null, previous: null, dataStatus: "not_available" },
      ndpIncome: { current: 4, previous: 0, dataStatus: "ready" },
      affiliatePlatformIncome: { current: 5, previous: 0, dataStatus: "ready" },
      consumablesProfit: { current: null, previous: null, dataStatus: "not_connected" }
    } satisfies CommissionFacts;
    const commissionReader = { getCommissionFacts: jest.fn(async () => facts) } satisfies DashboardCommissionReader;
    const repository = new DashboardRepository(
      {} as PrismaClient,
      { getFinanceFacts: jest.fn() },
      { getMerchantFacts: jest.fn() },
      { getOperationsFinance: jest.fn() },
      commissionReader,
      { getGrowthFacts: jest.fn() }
    );

    await expect(repository.getCommissionFacts(input)).resolves.toBe(facts);
    expect(commissionReader.getCommissionFacts).toHaveBeenCalledWith(input);
  });
});
