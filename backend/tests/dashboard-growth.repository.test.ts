import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import {
  countNewUserEvents,
  countFirstPaidMemberEvents,
  countFirstTechnicianOnboardingEvents,
  DashboardGrowthRepository,
  type DashboardGrowthReader,
  type GrowthFacts,
  type TechnicianOnboardingGrowthEvent
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
  const range = {
    fromInclusive: new Date("2026-08-24T00:00:00.000Z"),
    toExclusive: new Date("2026-08-31T00:00:00.000Z")
  };

  const newUser = {
    userId: 1,
    createdAt: "2026-08-25T00:00:00.000Z",
    userActive: true,
    userDeleted: false,
    isTestUser: false,
    customerProfileActive: true,
    customerCity: "Tokyo",
    memberships: [{ shopId: 91, active: true, deleted: false }]
  };

  it.each([
    ["inactive user", { userActive: false }],
    ["deleted user", { userDeleted: true }],
    ["test user", { isTestUser: true }],
    ["missing customer profile for city scope", { customerProfileActive: false }],
    ["different customer city", { customerCity: "Osaka" }]
  ])("excludes a new user for each independent %s condition", (_label, change) => {
    expect(countNewUserEvents({
      events: [{ ...newUser, ...change }],
      range,
      scope: { kind: "platform" },
      city: "Tokyo"
    })).toBe(0);
  });

  it.each([
    ["inactive membership", { active: false }],
    ["deleted membership", { deleted: true }],
    ["different merchant shop", { shopId: 92 }]
  ])("excludes a shop-scoped new user for each independent %s condition", (_label, membershipChange) => {
    expect(countNewUserEvents({
      events: [{ ...newUser, memberships: [{ ...newUser.memberships[0]!, ...membershipChange }] }],
      range,
      scope: { kind: "shop", shopId: 91 },
      city: null
    })).toBe(0);
  });

  it("counts a formally eligible new user for platform city and merchant shop scope", () => {
    expect(countNewUserEvents({ events: [newUser], range, scope: { kind: "platform" }, city: "Tokyo" })).toBe(1);
    expect(countNewUserEvents({ events: [newUser], range, scope: { kind: "shop", shopId: 91 }, city: null })).toBe(1);
  });

  const paidMember = {
    cardId: 30,
    userId: 3,
    issuedAt: "2026-08-25T00:00:00.000Z",
    issuanceSource: "offline_paid",
    cardStatus: "active",
    cardDeleted: false,
    membershipStatus: "active",
    membershipDeleted: false,
    userActive: true,
    userDeleted: false,
    isTestUser: false,
    shopId: 91,
    shopCity: "Tokyo"
  };

  it.each([
    ["inactive user", { userActive: false }],
    ["deleted user", { userDeleted: true }],
    ["test user", { isTestUser: true }],
    ["gift source", { issuanceSource: "gift" }],
    ["manual grant source", { issuanceSource: "manual_grant" }],
    ["historical replacement source", { issuanceSource: "historical_replacement" }],
    ["renewal source", { issuanceSource: "renewal" }],
    ["different city", { shopCity: "Osaka" }]
  ])("excludes a paid-member event for each independent %s condition", (_label, change) => {
    expect(countFirstPaidMemberEvents({
      events: [{ ...paidMember, ...change }],
      range,
      scope: { kind: "platform" },
      city: "Tokyo"
    })).toBe(0);
  });

  it("does not erase the winning acquisition after card or membership mutation", () => {
    expect(countFirstPaidMemberEvents({
      events: [{ ...paidMember, cardStatus: "void", cardDeleted: true, membershipStatus: "ended", membershipDeleted: true }],
      range, scope: { kind: "platform" }, city: "Tokyo"
    })).toBe(1);
  });

  it("treats online paid as first-paid acquisition and groups history platform-wide", () => {
    const online = { ...paidMember, userId: 33, issuanceSource: "online_paid" };
    expect(countFirstPaidMemberEvents({ events: [online], range, scope: { kind: "platform" }, city: "Tokyo" })).toBe(1);
    expect(countFirstPaidMemberEvents({ events: [
      { ...online, cardId: 1, issuedAt: "2026-08-01T00:00:00.000Z", shopId: 92, shopCity: "Osaka", cardDeleted: true },
      { ...paidMember, userId: 33, cardId: 2 }
    ], range, scope: { kind: "platform" }, city: "Tokyo" })).toBe(0);
  });

  it("uses card id as the deterministic tie breaker and attributes the winning shop", () => {
    const sameTime = "2026-08-25T00:00:00.000Z";
    expect(countFirstPaidMemberEvents({
      events: [
        { ...paidMember, userId: 44, cardId: 20, issuedAt: sameTime, shopId: 91 },
        { ...paidMember, userId: 44, cardId: 10, issuedAt: sameTime, shopId: 92 }
      ], range, scope: { kind: "shop", shopId: 91 }, city: null
    })).toBe(0);
  });

  it.each([
    ["a prior deleted paid card", [
      { ...paidMember, cardId: 29, issuedAt: "2026-08-01T00:00:00.000Z", cardStatus: "void", cardDeleted: true },
      paidMember
    ], { kind: "platform" } as const, "Tokyo"],
    ["a different merchant shop", [paidMember], { kind: "shop", shopId: 92 } as const, null]
  ])("excludes paid-member growth for independent %s history/scope evidence", (_label, events, scope, city) => {
    expect(countFirstPaidMemberEvents({ events, range, scope, city })).toBe(0);
  });

  it.each([
    [{ kind: "platform" } as const, "Tokyo"],
    [{ kind: "shop", shopId: 91 } as const, null]
  ])("counts one eligible first paid member for %o scope", (scope, city) => {
    expect(countFirstPaidMemberEvents({ events: [paidMember], range, scope, city })).toBe(1);
  });

  const technician: TechnicianOnboardingGrowthEvent = {
    userId: 2,
    activatedAt: "2026-08-25T00:00:00.000Z",
    identityActive: true,
    identityDeleted: false,
    userActive: true,
    userDeleted: false,
    isTestUser: false,
    profileValid: true,
    shops: [{ shopId: 91, city: "Tokyo", source: "direct", active: true, deleted: false, effective: true }]
  };

  it.each([
    ["inactive user", { userActive: false }],
    ["deleted user", { userDeleted: true }],
    ["test user", { isTestUser: true }],
    ["inactive identity", { identityActive: false }],
    ["deleted identity", { identityDeleted: true }],
    ["invalid technician profile", { profileValid: false }]
  ])("excludes technician onboarding for each independent %s condition", (_label, change) => {
    expect(countFirstTechnicianOnboardingEvents({
      events: [{ ...technician, ...change }],
      range,
      scope: { kind: "platform" },
      city: "Tokyo"
    })).toBe(0);
  });

  it.each([
    ["inactive affiliation", { active: false }],
    ["deleted affiliation", { deleted: true }],
    ["affiliation outside the activation date", { effective: false }],
    ["different affiliation shop", { shopId: 92 }]
  ])("excludes technician onboarding for each independent %s condition", (_label, shopChange) => {
    const affiliation: TechnicianOnboardingGrowthEvent["shops"][number] = {
      shopId: 91,
      city: "Tokyo",
      source: "affiliation",
      active: true,
      deleted: false,
      effective: true,
      ...shopChange
    };
    expect(countFirstTechnicianOnboardingEvents({
      events: [{ ...technician, shops: [affiliation] }],
      range,
      scope: { kind: "shop", shopId: 91 },
      city: null
    })).toBe(0);
  });

  it.each([
    ["a prior deleted identity", [
      { ...technician, activatedAt: "2026-08-01T00:00:00.000Z", identityActive: false, identityDeleted: true },
      technician
    ], { kind: "platform" } as const, "Tokyo"],
    ["a different city", [technician], { kind: "platform" } as const, "Osaka"],
    ["a missing direct shop", [{ ...technician, shops: [] }], { kind: "shop", shopId: 91 } as const, null],
    ["a different direct shop", [{ ...technician, shops: [{ ...technician.shops[0]!, shopId: 92 }] }], { kind: "shop", shopId: 91 } as const, null]
  ])("excludes technician onboarding for independent %s evidence", (_label, events, scope, city) => {
    expect(countFirstTechnicianOnboardingEvents({ events, range, scope, city })).toBe(0);
  });

  it.each([
    [[technician], { kind: "platform" } as const, "Tokyo"],
    [[technician], { kind: "shop", shopId: 91 } as const, null],
    [[{ ...technician, shops: [{ ...technician.shops[0]!, source: "affiliation" as const }] }], { kind: "shop", shopId: 91 } as const, null]
  ])("counts one eligible technician for direct or affiliation scope", (events, scope, city) => {
    expect(countFirstTechnicianOnboardingEvents({ events, range, scope, city })).toBe(1);
  });
  it("maps current and previous first-event growth facts from one bounded query", async () => {
    const fixture = createReader([
      { periodKey: "current", newUsers: 18n, newPaidMembers: "1", technicianOnboarding: 4, agentOnboarding: 2, franchiseeOnboarding: 1, supplierOnboarding: 1 },
      { period_key: "previous", new_users: 12, new_paid_members: 3, technician_onboarding: 2, agent_onboarding: 1, franchisee_onboarding: 0, supplier_onboarding: 2 }
    ]);

    await expect(fixture.reader.getGrowthFacts(input)).resolves.toEqual({
      newUsers: { current: 18, previous: 12, dataStatus: "ready" },
      newPaidMembers: { current: 1, previous: 3, dataStatus: "ready" },
      technicianOnboarding: { current: 4, previous: 2, dataStatus: "ready" },
      agentOnboarding: { current: 2, previous: 1, dataStatus: "ready" },
      franchiseeOnboarding: { current: 1, previous: 0, dataStatus: "ready" },
      supplierOnboarding: { current: 1, previous: 2, dataStatus: "ready" }
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
    expect(sql).toContain("historical_paid_ranked");
    expect(sql).toContain("ORDER BY card.issued_at ASC, card.id ASC");
    expect(sql).toContain("card.issuance_source");
    expect(sql).toContain("membership.shop_id = shop.id");
    expect(sql).toContain("historical_first_technician_identity");
    expect(sql).toContain("MIN(identity_row.created_at)");
    expect(sql).toContain("identity_row.type");
    expect(sql).toContain("identity_row.is_active");
    expect(sql).toContain("technician.deleted_at IS NULL");
    expect(sql).toContain("affiliation.relationship_type");
    expect(sql).toContain("affiliation.starts_at <= first_identity.activated_at");
    expect(sql).toContain("historical_partner_ranked AS");
    expect(sql).toContain("platform_partner_profiles AS partner");
    expect(sql).toContain("PARTITION BY partner.user_id, partner.partner_type");
    expect(sql).toContain("ORDER BY partner.activated_at ASC, partner.id ASC");
    expect(sql).toContain("first_partner_onboarding AS");
    expect(sql).toContain("partner.activated_at >= period.from_inclusive");
    expect(sql).toContain("partner.activated_at < period.to_exclusive");
    expect(sql).toContain("partner_user.is_active =");
    expect(sql).toContain("partner_user.is_test_account =");
    expect(sql).toContain("partner_user.deleted_at IS NULL");
    expect(sql).toContain("TRIM(shop.city) =");
    expect(query.values).toEqual(expect.arrayContaining([
      "current", "previous", "offline_paid", "online_paid", "active", "technician", "Tokyo"
    ]));
    expect(query.values).not.toEqual(expect.arrayContaining(["manual_grant", "historical_replacement"]));

    const firstPaidDefinition = sql.slice(
      sql.indexOf("historical_paid_ranked AS"),
      sql.indexOf("first_paid_members AS")
    );
    expect(firstPaidDefinition).not.toContain("card.status =");
    expect(sql.slice(sql.indexOf("first_paid_members AS"))).not.toContain("card.status =");
  });

  it("uses authoritative membership/affiliation shops for merchant scope", async () => {
    const fixture = createReader([]);
    await fixture.reader.getGrowthFacts({ scope: { kind: "shop", shopId: 91 }, city: null, window });
    const query = fixture.queryRaw.mock.calls[0]![0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("membership.shop_id =");
    expect(sql).toContain("resolved_shop.shop_id =");
    expect(sql).toContain("scoped_referral.shop_id =");
    expect(sql).toContain("scoped_referral.status IN");
    expect(sql).not.toContain("technician.city");
    expect(query.values).toContain(91);
  });

  it("maps absent rows to zero and rejects negative, fractional, or unsafe aggregates", async () => {
    await expect(createReader([]).reader.getGrowthFacts(input)).resolves.toMatchObject({
      newUsers: { current: 0, previous: 0, dataStatus: "ready" },
      newPaidMembers: { current: 0, previous: 0, dataStatus: "ready" },
      technicianOnboarding: { current: 0, previous: 0, dataStatus: "ready" },
      agentOnboarding: { current: 0, previous: 0, dataStatus: "ready" },
      franchiseeOnboarding: { current: 0, previous: 0, dataStatus: "ready" },
      supplierOnboarding: { current: 0, previous: 0, dataStatus: "ready" }
    });

    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1.5"]) {
      await expect(createReader([{ periodKey: "current", newUsers: value, newPaidMembers: 0, technicianOnboarding: 0, agentOnboarding: 0, franchiseeOnboarding: 0, supplierOnboarding: 0 }]).reader.getGrowthFacts(input))
        .rejects.toThrow("Dashboard growth aggregate must be a non-negative safe integer");
    }
  });

  it("delegates through DashboardRepository without composing Task 4", async () => {
    const facts = {
      newUsers: { current: 1, previous: 0, dataStatus: "ready" },
      newPaidMembers: { current: 2, previous: 0, dataStatus: "ready" },
      technicianOnboarding: { current: 3, previous: 0, dataStatus: "ready" },
      agentOnboarding: { current: 4, previous: 0, dataStatus: "ready" },
      franchiseeOnboarding: { current: 5, previous: 0, dataStatus: "ready" },
      supplierOnboarding: { current: 6, previous: 0, dataStatus: "ready" }
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
