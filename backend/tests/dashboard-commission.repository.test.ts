import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import {
  calculateTechnicianCommission,
  DashboardCommissionRepository,
  isProductionNdpEvidence,
  resolveTechnicianCompensationAllocations,
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
  it("resolves archived January and active February production profiles before allocating 52,000 JPY", () => {
    const resolved = resolveTechnicianCompensationAllocations({
      workDates: ["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"].map((workDate) => ({
        technicianProfileId: 1,
        shopId: 9,
        workDate
      })),
      profiles: [
        { id: 101, technicianProfileId: 1, shopId: 9, status: "archived", wageMode: "base_plus_commission", monthlyBaseJpy: 310_000, effectiveFrom: "2026-01-01", effectiveTo: "2026-01-31", deleted: false },
        { id: 102, technicianProfileId: 1, shopId: 9, status: "active", wageMode: "base_plus_commission", monthlyBaseJpy: 280_000, effectiveFrom: "2026-02-01", effectiveTo: null, deleted: false }
      ]
    });

    expect(resolved.anomalyCount).toBe(0);
    expect(calculateTechnicianCommission({
      workDates: resolved.workDates,
      settledShareJpy: 12_000
    })).toBe(52_000);
  });

  it("returns an explicit anomaly sentinel for an overlapping version or a history gap", () => {
    const base = { technicianProfileId: 1, shopId: 9, workDate: "2026-01-15" };
    const profile = { id: 1, technicianProfileId: 1, shopId: 9, status: "archived" as const, wageMode: "base_plus_commission" as const, monthlyBaseJpy: 310_000, effectiveFrom: "2026-01-01", effectiveTo: "2026-01-31", deleted: false };

    expect(resolveTechnicianCompensationAllocations({
      workDates: [base],
      profiles: [profile, { ...profile, id: 2, status: "active" }]
    })).toMatchObject({ anomalyCount: 1, workDates: [] });
    expect(resolveTechnicianCompensationAllocations({
      workDates: [{ ...base, workDate: "2026-02-01" }],
      profiles: [profile]
    })).toMatchObject({ anomalyCount: 1, workDates: [] });
    expect(resolveTechnicianCompensationAllocations({
      workDates: [base],
      profiles: [{ ...profile, monthlyBaseJpy: Number.MAX_SAFE_INTEGER + 1 }]
    })).toMatchObject({ anomalyCount: 1, workDates: [] });
    expect(resolveTechnicianCompensationAllocations({
      workDates: [base],
      profiles: [{ ...profile, effectiveFrom: "2026-02-01", effectiveTo: "2026-01-01" }]
    })).toMatchObject({ anomalyCount: 1, workDates: [] });
  });

  it("resolves one effective profile across all wage modes before allocating base salary", () => {
    const openSalary = {
      id: 1,
      technicianProfileId: 1,
      shopId: 9,
      status: "archived",
      wageMode: "base_plus_commission",
      monthlyBaseJpy: 310_000,
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      deleted: false
    };

    expect(resolveTechnicianCompensationAllocations({
      workDates: [{ technicianProfileId: 1, shopId: 9, workDate: "2026-02-01" }],
      profiles: [
        openSalary,
        { ...openSalary, id: 2, status: "active", wageMode: "commission", monthlyBaseJpy: 0, effectiveFrom: "2026-02-01" }
      ]
    })).toMatchObject({ anomalyCount: 1, workDates: [] });

    const closedTransition = resolveTechnicianCompensationAllocations({
      workDates: [
        { technicianProfileId: 1, shopId: 9, workDate: "2026-01-31" },
        { technicianProfileId: 1, shopId: 9, workDate: "2026-02-01" }
      ],
      profiles: [
        { ...openSalary, effectiveTo: "2026-01-31" },
        { ...openSalary, id: 2, status: "active", wageMode: "commission", monthlyBaseJpy: 0, effectiveFrom: "2026-02-01" }
      ]
    });
    expect(closedTransition.anomalyCount).toBe(0);
    expect(closedTransition.workDates).toEqual([
      expect.objectContaining({ workDate: "2026-01-31", compensationProfileId: 1 })
    ]);
    expect(calculateTechnicianCommission({
      workDates: closedTransition.workDates,
      settledShareJpy: 0
    })).toBe(10_000);
  });

  it("fails closed on malformed effective non-base compensation rows", () => {
    expect(resolveTechnicianCompensationAllocations({
      workDates: [{ technicianProfileId: 1, shopId: 9, workDate: "2026-02-01" }],
      profiles: [{
        id: 2,
        technicianProfileId: 1,
        shopId: 9,
        status: "active",
        wageMode: "commission",
        monthlyBaseJpy: -1,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        deleted: false
      }]
    })).toMatchObject({ anomalyCount: 1, workDates: [] });
  });

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
  it("accepts production NDP evidence and rejects a TEST_NDP checkout ledger", () => {
    expect(isProductionNdpEvidence({ financialCurrency: "NDP", ledgerCurrency: "NDP" }))
      .toBe(true);
    expect(isProductionNdpEvidence({ financialCurrency: "NDP", ledgerCurrency: "TEST_NDP" }))
      .toBe(false);
  });

  it("maps current/previous immutable commission facts from one bounded query", async () => {
    const fixture = createReader([
      { periodKey: "current", salaryAnomalyCount: 0, dedicatedJpy: 52_000n, partTimeJpy: "12000", marketingNdp: 500, ndpIncomeNdp: 900, affiliatePlatformNdp: 80 },
      { period_key: "previous", salary_anomaly_count: 0, dedicated_jpy: 40_000, part_time_jpy: 9_000, marketing_ndp: 300, ndp_income_ndp: 700, affiliate_platform_ndp: 50 }
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
    expect(sql).toContain("compensation.status IN");
    expect(sql).toContain("MAX(compensation.wage_mode) AS wage_mode");
    expect(sql).toContain("eligible.wage_mode =");
    expect(sql).not.toContain("AND compensation.wage_mode =");
    expect(sql).toContain("salary_anomaly_count");
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
    expect(sql).toContain("payment_ledger.currency =");
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
      "settled", "applied", "commission", "active", "archived", "approved", "scheduled", "paid", "locked", "Tokyo"
    ]));
  });

  it("uses ready zero for an absent period and fails closed on malformed facts", async () => {
    await expect(createReader([]).reader.getCommissionFacts(input)).resolves.toMatchObject({
      dedicatedTechnicianCommission: { current: 0, previous: 0, dataStatus: "ready" },
      marketingCommission: { current: 0, previous: 0, dataStatus: "ready" }
    });
    await expect(createReader([{ periodKey: "current", salaryAnomalyCount: 0, dedicatedJpy: -1, partTimeJpy: 0, marketingNdp: 0, ndpIncomeNdp: 0, affiliatePlatformNdp: 0 }]).reader.getCommissionFacts(input))
      .rejects.toThrow("Dashboard commission aggregate must be a non-negative safe integer");
    await expect(createReader([{ periodKey: "current", salaryAnomalyCount: 1, dedicatedJpy: 0, partTimeJpy: 0, marketingNdp: 0, ndpIncomeNdp: 0, affiliatePlatformNdp: 0 }]).reader.getCommissionFacts(input))
      .rejects.toThrow("Dashboard commission compensation anomaly detected");
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
