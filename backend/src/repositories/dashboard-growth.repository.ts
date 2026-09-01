import { Prisma, type PrismaClient } from "@prisma/client";
import type { DashboardAggregateInput } from "../domain/dashboard";

type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;
type DashboardQueryClient = Pick<PrismaClient, "$queryRaw">;

export interface DashboardGrowthReadyFact {
  current: number;
  previous: number;
  dataStatus: "ready";
}

export interface GrowthFacts {
  newUsers: DashboardGrowthReadyFact;
  newPaidMembers: DashboardGrowthReadyFact;
  technicianOnboarding: DashboardGrowthReadyFact;
  agentOnboarding: { current: null; previous: null; dataStatus: "not_available" };
  franchiseeOnboarding: { current: null; previous: null; dataStatus: "not_available" };
  supplierOnboarding: { current: null; previous: null; dataStatus: "not_available" };
}

export interface DashboardGrowthReader {
  getGrowthFacts(input: DashboardAggregateInput): Promise<GrowthFacts>;
}

interface GrowthRow {
  periodKey?: string;
  period_key?: string;
  newUsers?: NumericValue;
  new_users?: NumericValue;
  newPaidMembers?: NumericValue;
  new_paid_members?: NumericValue;
  technicianOnboarding?: NumericValue;
  technician_onboarding?: NumericValue;
}

export interface PaidMembershipGrowthEvent {
  userId: number;
  issuedAt: string;
  issuanceSource: string;
  cardStatus: string;
  cardDeleted: boolean;
  membershipStatus: string;
  membershipDeleted: boolean;
  userActive: boolean;
  userDeleted: boolean;
  isTestUser: boolean;
  shopId: number;
  shopCity: string;
}

export interface TechnicianOnboardingGrowthEvent {
  userId: number;
  activatedAt: string;
  identityActive: boolean;
  identityDeleted: boolean;
  userActive: boolean;
  userDeleted: boolean;
  isTestUser: boolean;
  profileValid: boolean;
  shops: readonly { shopId: number; city: string }[];
}

interface GrowthFixtureInput<T> {
  events: readonly T[];
  range: { fromInclusive: Date; toExclusive: Date };
  scope: DashboardAggregateInput["scope"];
  city: string | null;
}

const aggregateError = "Dashboard growth aggregate must be a non-negative safe integer";

const eventTime = (value: string): number => {
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) throw new RangeError(aggregateError);
  return parsed;
};

const isInRange = (
  value: string,
  range: GrowthFixtureInput<unknown>["range"]
): boolean => {
  const time = eventTime(value);
  return time >= range.fromInclusive.getTime() && time < range.toExclusive.getTime();
};

const matchesScope = (
  shop: { shopId: number; city: string },
  scope: DashboardAggregateInput["scope"],
  city: string | null
): boolean => scope.kind === "shop" ? shop.shopId === scope.shopId : city === null || shop.city.trim() === city;

export const countFirstPaidMemberEvents = (
  input: GrowthFixtureInput<PaidMembershipGrowthEvent>
): number => {
  const firstPaidByUser = new Map<number, number>();
  for (const event of input.events) {
    if (event.issuanceSource !== "offline_paid") continue;
    const time = eventTime(event.issuedAt);
    const existing = firstPaidByUser.get(event.userId);
    if (existing === undefined || time < existing) firstPaidByUser.set(event.userId, time);
  }
  const counted = new Set<number>();
  for (const event of input.events) {
    if (
      event.issuanceSource !== "offline_paid" ||
      eventTime(event.issuedAt) !== firstPaidByUser.get(event.userId) ||
      !isInRange(event.issuedAt, input.range) ||
      event.cardStatus !== "active" ||
      event.cardDeleted ||
      event.membershipStatus !== "active" ||
      event.membershipDeleted ||
      !event.userActive ||
      event.userDeleted ||
      event.isTestUser ||
      !matchesScope({ shopId: event.shopId, city: event.shopCity }, input.scope, input.city)
    ) {
      continue;
    }
    counted.add(event.userId);
  }
  return counted.size;
};

export const countFirstTechnicianOnboardingEvents = (
  input: GrowthFixtureInput<TechnicianOnboardingGrowthEvent>
): number => {
  const firstIdentityByUser = new Map<number, number>();
  for (const event of input.events) {
    const time = eventTime(event.activatedAt);
    const existing = firstIdentityByUser.get(event.userId);
    if (existing === undefined || time < existing) firstIdentityByUser.set(event.userId, time);
  }
  const counted = new Set<number>();
  for (const event of input.events) {
    if (
      eventTime(event.activatedAt) !== firstIdentityByUser.get(event.userId) ||
      !isInRange(event.activatedAt, input.range) ||
      !event.identityActive ||
      event.identityDeleted ||
      !event.userActive ||
      event.userDeleted ||
      event.isTestUser ||
      !event.profileValid ||
      !event.shops.some((shop) => matchesScope(shop, input.scope, input.city))
    ) {
      continue;
    }
    counted.add(event.userId);
  }
  return counted.size;
};

export class DashboardGrowthRepository implements DashboardGrowthReader {
  public constructor(private readonly client: DashboardQueryClient) {}

  public async getGrowthFacts(input: DashboardAggregateInput): Promise<GrowthFacts> {
    const rows = await this.queryGrowthFacts(input);
    const periods = new Map<"current" | "previous", {
      newUsers: number;
      newPaidMembers: number;
      technicianOnboarding: number;
    }>();
    for (const row of rows) {
      const key = row.periodKey ?? row.period_key;
      if ((key !== "current" && key !== "previous") || periods.has(key)) {
        throw new RangeError(aggregateError);
      }
      periods.set(key, {
        newUsers: this.toSafeAggregate(row.newUsers ?? row.new_users),
        newPaidMembers: this.toSafeAggregate(row.newPaidMembers ?? row.new_paid_members),
        technicianOnboarding: this.toSafeAggregate(
          row.technicianOnboarding ?? row.technician_onboarding
        )
      });
    }
    const zero = { newUsers: 0, newPaidMembers: 0, technicianOnboarding: 0 };
    const current = periods.get("current") ?? zero;
    const previous = periods.get("previous") ?? zero;
    return {
      newUsers: { current: current.newUsers, previous: previous.newUsers, dataStatus: "ready" },
      newPaidMembers: { current: current.newPaidMembers, previous: previous.newPaidMembers, dataStatus: "ready" },
      technicianOnboarding: { current: current.technicianOnboarding, previous: previous.technicianOnboarding, dataStatus: "ready" },
      agentOnboarding: { current: null, previous: null, dataStatus: "not_available" },
      franchiseeOnboarding: { current: null, previous: null, dataStatus: "not_available" },
      supplierOnboarding: { current: null, previous: null, dataStatus: "not_available" }
    };
  }

  private periodTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join([
      Prisma.sql`SELECT ${"current"} AS period_key, ${input.window.fromInclusive} AS from_inclusive, ${input.window.toExclusive} AS to_exclusive`,
      Prisma.sql`SELECT ${"previous"} AS period_key, ${input.window.previousFromInclusive} AS from_inclusive, ${input.window.previousToExclusive} AS to_exclusive`
    ], " UNION ALL ");
  }

  private newUserScope(input: DashboardAggregateInput): Prisma.Sql {
    if (input.scope.kind === "shop") {
      return Prisma.sql`EXISTS (
        SELECT 1 FROM shop_customer_memberships AS user_membership
        WHERE user_membership.customer_profile_id = customer.id
          AND user_membership.shop_id = ${input.scope.shopId}
          AND user_membership.status = ${"active"}
          AND user_membership.deleted_at IS NULL
      )`;
    }
    if (input.city) return Prisma.sql`TRIM(customer.city) = ${input.city}`;
    return Prisma.sql`TRUE`;
  }

  private membershipScope(input: DashboardAggregateInput): Prisma.Sql {
    if (input.scope.kind === "shop") {
      return Prisma.sql`membership.shop_id = ${input.scope.shopId}`;
    }
    if (input.city) return Prisma.sql`TRIM(shop.city) = ${input.city}`;
    return Prisma.sql`TRUE`;
  }

  private technicianScope(input: DashboardAggregateInput): Prisma.Sql {
    if (input.scope.kind === "shop") {
      return Prisma.sql`resolved_shop.shop_id = ${input.scope.shopId}`;
    }
    if (input.city) return Prisma.sql`TRIM(shop.city) = ${input.city}`;
    return Prisma.sql`TRUE`;
  }

  private queryGrowthFacts(input: DashboardAggregateInput): Promise<GrowthRow[]> {
    const periods = this.periodTable(input);
    const newUserScope = this.newUserScope(input);
    const membershipScope = this.membershipScope(input);
    const technicianScope = this.technicianScope(input);
    return this.client.$queryRaw<GrowthRow[]>(Prisma.sql`
      /* dashboard_growth_facts */
      WITH periods AS (${periods}),
      registered_users AS (
        SELECT period.period_key, registered_user.id AS user_id
        FROM periods AS period
        INNER JOIN users AS registered_user
          ON registered_user.created_at >= period.from_inclusive
          AND registered_user.created_at < period.to_exclusive
          AND registered_user.is_active = ${true}
          AND registered_user.is_test_account = ${false}
          AND registered_user.deleted_at IS NULL
        LEFT JOIN customer_profiles AS customer
          ON customer.user_id = registered_user.id AND customer.deleted_at IS NULL
        WHERE ${newUserScope}
      ),
      historical_first_paid_at AS (
        SELECT customer.user_id, MIN(card.issued_at) AS issued_at
        FROM shop_membership_cards AS card
        INNER JOIN shop_customer_memberships AS membership
          ON membership.id = card.membership_id
        INNER JOIN customer_profiles AS customer
          ON customer.id = membership.customer_profile_id
        WHERE card.issuance_source = ${"offline_paid"}
        GROUP BY customer.user_id
      ),
      first_paid_members AS (
        SELECT period.period_key, first_paid.user_id
        FROM periods AS period
        INNER JOIN historical_first_paid_at AS first_paid
          ON first_paid.issued_at >= period.from_inclusive
          AND first_paid.issued_at < period.to_exclusive
        INNER JOIN customer_profiles AS customer
          ON customer.user_id = first_paid.user_id AND customer.deleted_at IS NULL
        INNER JOIN users AS member_user
          ON member_user.id = customer.user_id
          AND member_user.is_active = ${true}
          AND member_user.is_test_account = ${false}
          AND member_user.deleted_at IS NULL
        INNER JOIN shop_customer_memberships AS membership
          ON membership.customer_profile_id = customer.id
          AND membership.status = ${"active"}
          AND membership.deleted_at IS NULL
        INNER JOIN shop_membership_cards AS card
          ON card.membership_id = membership.id
          AND card.issued_at = first_paid.issued_at
          AND card.issuance_source = ${"offline_paid"}
          AND card.status = ${"active"}
          AND card.deleted_at IS NULL
        INNER JOIN shops AS shop
          ON membership.shop_id = shop.id AND shop.deleted_at IS NULL
        WHERE ${membershipScope}
      ),
      historical_first_technician_identity AS (
        SELECT identity_row.user_id, MIN(identity_row.created_at) AS activated_at
        FROM user_identities AS identity_row
        WHERE identity_row.type = ${"technician"}
        GROUP BY identity_row.user_id
      ),
      first_technician_identity AS (
        SELECT historical.user_id, historical.activated_at
        FROM historical_first_technician_identity AS historical
        INNER JOIN user_identities AS identity_row
          ON identity_row.user_id = historical.user_id
          AND identity_row.created_at = historical.activated_at
          AND identity_row.type = ${"technician"}
          AND identity_row.is_active = ${true}
          AND identity_row.deleted_at IS NULL
        INNER JOIN users AS technician_user
          ON technician_user.id = historical.user_id
          AND technician_user.is_active = ${true}
          AND technician_user.is_test_account = ${false}
          AND technician_user.deleted_at IS NULL
      ),
      resolved_shop AS (
        SELECT first_identity.user_id, first_identity.activated_at, technician.id AS technician_profile_id,
          affiliation.shop_id
        FROM first_technician_identity AS first_identity
        INNER JOIN technician_profiles AS technician
          ON technician.user_id = first_identity.user_id AND technician.deleted_at IS NULL
        INNER JOIN technician_shop_affiliations AS affiliation
          ON affiliation.technician_profile_id = technician.id
          AND affiliation.relationship_type IN (${"exclusive"}, ${"partner"})
          AND affiliation.work_status = ${"active"}
          AND affiliation.deleted_at IS NULL
          AND affiliation.starts_at <= first_identity.activated_at
          AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= first_identity.activated_at)
        UNION ALL
        SELECT first_identity.user_id, first_identity.activated_at, technician.id AS technician_profile_id,
          technician.shop_id
        FROM first_technician_identity AS first_identity
        INNER JOIN technician_profiles AS technician
          ON technician.user_id = first_identity.user_id
          AND technician.shop_id IS NOT NULL
          AND technician.deleted_at IS NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM technician_shop_affiliations AS affiliation
          WHERE affiliation.technician_profile_id = technician.id
            AND affiliation.relationship_type IN (${"exclusive"}, ${"partner"})
            AND affiliation.work_status = ${"active"}
            AND affiliation.deleted_at IS NULL
            AND affiliation.starts_at <= first_identity.activated_at
            AND (affiliation.ends_at IS NULL OR affiliation.ends_at >= first_identity.activated_at)
        )
      ),
      first_technicians AS (
        SELECT period.period_key, resolved_shop.user_id
        FROM periods AS period
        INNER JOIN resolved_shop
          ON resolved_shop.activated_at >= period.from_inclusive
          AND resolved_shop.activated_at < period.to_exclusive
        INNER JOIN shops AS shop
          ON shop.id = resolved_shop.shop_id AND shop.deleted_at IS NULL
        WHERE ${technicianScope}
      ),
      registered_counts AS (
        SELECT period_key, COUNT(DISTINCT user_id) AS aggregate_value
        FROM registered_users GROUP BY period_key
      ),
      paid_member_counts AS (
        SELECT period_key, COUNT(DISTINCT user_id) AS aggregate_value
        FROM first_paid_members GROUP BY period_key
      ),
      technician_counts AS (
        SELECT period_key, COUNT(DISTINCT user_id) AS aggregate_value
        FROM first_technicians GROUP BY period_key
      )
      SELECT period.period_key AS periodKey,
        COALESCE(registered.aggregate_value, 0) AS newUsers,
        COALESCE(member.aggregate_value, 0) AS newPaidMembers,
        COALESCE(technician.aggregate_value, 0) AS technicianOnboarding
      FROM periods AS period
      LEFT JOIN registered_counts AS registered ON registered.period_key = period.period_key
      LEFT JOIN paid_member_counts AS member ON member.period_key = period.period_key
      LEFT JOIN technician_counts AS technician ON technician.period_key = period.period_key
    `);
  }

  private toSafeAggregate(value: NumericValue): number {
    if (value === null || value === undefined) throw new RangeError(aggregateError);
    if (typeof value === "bigint") {
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(aggregateError);
      return Number(value);
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(aggregateError);
      return value;
    }
    const serialized = typeof value === "string" ? value : value.toString();
    if (!/^(0|[1-9]\d*)$/u.test(serialized)) throw new RangeError(aggregateError);
    const parsed = Number(serialized);
    if (!Number.isSafeInteger(parsed)) throw new RangeError(aggregateError);
    return parsed;
  }
}
