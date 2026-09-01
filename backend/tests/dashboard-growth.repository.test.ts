import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import {
  DashboardGrowthRepository,
  type DashboardGrowthReader,
  type GrowthFacts
} from "../src/repositories/dashboard-growth.repository";
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
    reader: new DashboardGrowthRepository({ $queryRaw: queryRaw } as unknown as PrismaClient),
    queryRaw
  };
};

describe("DashboardGrowthRepository", () => {
  it("maps current and previous first-event growth facts from one bounded query", async () => {
    const fixture = createReader([
      { periodKey: "current", newUsers: 18n, newPaidMembers: "1", technicianOnboarding: 4 },
      { period_key: "previous", new_users: 12, new_paid_members: 3, technician_onboarding: 2 }
    ]);

    await expect(fixture.reader.getGrowthFacts(input)).resolves.toEqual({
      newUsers: { current: 18, previous: 12, dataStatus: "ready" },
      newPaidMembers: { current: 1, previous: 3, dataStatus: "ready" },
      technicianOnboarding: { current: 4, previous: 2, dataStatus: "ready" },
      agentOnboarding: { current: null, previous: null, dataStatus: "not_available" },
      franchiseeOnboarding: { current: null, previous: null, dataStatus: "not_available" },
      supplierOnboarding: { current: null, previous: null, dataStatus: "not_available" }
    });
    expect(fixture.queryRaw).toHaveBeenCalledTimes(1);

    const query = fixture.queryRaw.mock.calls[0]![0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("dashboard_growth_facts");
    expect(sql).toContain("WITH periods AS");
    expect(sql).toContain("registered_user.created_at >= period.from_inclusive");
    expect(sql).toContain("registered_user.created_at < period.to_exclusive");
    expect(sql).toContain("registered_user.is_active =");
    expect(sql).toContain("registered_user.is_test_account =");
    expect(sql).toContain("customer.deleted_at IS NULL");
    expect(sql).toContain("MIN(card.issued_at)");
    expect(sql).toContain("card.issuance_source");
    expect(sql).toContain("card.status");
    expect(sql).toContain("membership.shop_id = shop.id");
    expect(sql).toContain("MIN(identity_row.created_at)");
    expect(sql).toContain("identity_row.type");
    expect(sql).toContain("identity_row.is_active");
    expect(sql).toContain("technician.deleted_at IS NULL");
    expect(sql).toContain("affiliation.relationship_type");
    expect(sql).toContain("affiliation.starts_at <= first_identity.activated_at");
    expect(sql).toContain("TRIM(shop.city) =");
    expect(query.values).toEqual(expect.arrayContaining([
      "current", "previous", "offline_paid", "active", "technician", "Tokyo"
    ]));
    expect(query.values).not.toEqual(expect.arrayContaining(["manual_grant", "historical_replacement"]));

    const firstPaidDefinition = sql.slice(
      sql.indexOf("first_paid_at AS"),
      sql.indexOf("first_paid_members AS")
    );
    expect(firstPaidDefinition).not.toContain("card.status =");
    expect(sql.slice(sql.indexOf("first_paid_members AS"))).toContain("card.status =");
  });

  it("uses authoritative membership/affiliation shops for merchant scope", async () => {
    const fixture = createReader([]);
    await fixture.reader.getGrowthFacts({ scope: { kind: "shop", shopId: 91 }, city: null, window });
    const query = fixture.queryRaw.mock.calls[0]![0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("membership.shop_id =");
    expect(sql).toContain("resolved_shop.shop_id =");
    expect(sql).not.toContain("technician.city");
    expect(query.values).toContain(91);
  });

  it("maps absent rows to zero and rejects negative, fractional, or unsafe aggregates", async () => {
    await expect(createReader([]).reader.getGrowthFacts(input)).resolves.toMatchObject({
      newUsers: { current: 0, previous: 0, dataStatus: "ready" },
      newPaidMembers: { current: 0, previous: 0, dataStatus: "ready" },
      technicianOnboarding: { current: 0, previous: 0, dataStatus: "ready" }
    });

    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1.5"]) {
      await expect(createReader([{ periodKey: "current", newUsers: value, newPaidMembers: 0, technicianOnboarding: 0 }]).reader.getGrowthFacts(input))
        .rejects.toThrow("Dashboard growth aggregate must be a non-negative safe integer");
    }
  });

  it("delegates through DashboardRepository without composing Task 4", async () => {
    const facts = {
      newUsers: { current: 1, previous: 0, dataStatus: "ready" },
      newPaidMembers: { current: 2, previous: 0, dataStatus: "ready" },
      technicianOnboarding: { current: 3, previous: 0, dataStatus: "ready" },
      agentOnboarding: { current: null, previous: null, dataStatus: "not_available" },
      franchiseeOnboarding: { current: null, previous: null, dataStatus: "not_available" },
      supplierOnboarding: { current: null, previous: null, dataStatus: "not_available" }
    } satisfies GrowthFacts;
    const growthReader = { getGrowthFacts: jest.fn(async () => facts) } satisfies DashboardGrowthReader;
    const repository = new DashboardRepository(
      {} as PrismaClient,
      { getFinanceFacts: jest.fn() },
      { getMerchantFacts: jest.fn() },
      { getOperationsFinance: jest.fn() },
      { getCommissionFacts: jest.fn() },
      growthReader
    );

    await expect(repository.getGrowthFacts(input)).resolves.toBe(facts);
    expect(growthReader.getGrowthFacts).toHaveBeenCalledWith(input);
  });
});
