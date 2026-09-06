import { Prisma } from "@prisma/client";
import type { BackofficeScope } from "../services/backoffice.service";
import type { BackofficeManagedUserListQuery } from "../validators/backoffice.validator";
import { createInternalError } from "../utils/app-error";

// Only the relation graph emitted by managedUserWhere is supported. Reusing its
// predicates preserves the same RBAC/filter scope for count, ordering and rows.
const relations: Record<string, Record<string, [string, string, string]>> = {
  User: {
    customerProfile: ["CustomerProfile", "id", "userId"],
    technicianProfile: ["TechnicianProfile", "id", "userId"],
    bookingOrders: ["BookingOrder", "id", "customerUserId"],
    identities: ["UserIdentity", "id", "userId"],
    externalAccounts: ["ExternalAuthAccount", "id", "userId"],
    ekycVerifications: ["EkycVerification", "id", "userId"],
    experienceAccount: ["UserExperienceAccount", "id", "userId"],
    membershipAdjustments: ["UserMembershipAdjustment", "id", "userId"],
    platformMembershipEntitlements: ["PlatformMembershipEntitlement", "id", "userId"],
    userRoles: ["UserRole", "id", "userId"],
    backofficeUserGroupMemberships: ["BackofficeUserGroupMembership", "id", "userId"]
  },
  UserMembershipAdjustment: { tierVersion: ["PlatformMembershipTierVersion", "tierVersionId", "id"] },
  PlatformMembershipEntitlement: { tierVersion: ["PlatformMembershipTierVersion", "tierVersionId", "id"] },
  PlatformMembershipTierVersion: { tier: ["PlatformMembershipTier", "tierId", "id"] },
  UserRole: { role: ["Role", "roleId", "id"] },
  BackofficeUserGroupMembership: { group: ["BackofficeUserGroup", "groupId", "id"] }
};
const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
const identifier = (name: string) => Prisma.raw(`\`${name.replace(/`/g, "``")}\``);
const invalid = (): never => { throw createInternalError("Unsupported managed-user sort predicate"); };
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)
    ? value as Record<string, unknown> : invalid();
const column = (model: string, alias: string, name: string) => {
  const field = models.get(model)?.fields.find((item) => item.name === name && item.kind !== "object");
  if (!field) return invalid();
  return Prisma.sql`${identifier(alias)}.${identifier(field.dbName ?? field.name)}`;
};
const combine = (parts: Prisma.Sql[], operator: "AND" | "OR") =>
  parts.length ? Prisma.sql`(${Prisma.join(parts, ` ${operator} `)})` : Prisma.sql`${operator === "AND" ? 1 : 0} = 1`;

function scalar(field: Prisma.Sql, input: unknown, enumType?: string): Prisma.Sql {
  const value = (item: unknown): unknown => {
    if (enumType) {
      if (!["PlatformMembershipTierCode", "PlatformMembershipVersionStatus", "BackofficeUserGroupStatus"].includes(enumType) || typeof item !== "string") return invalid();
      return item.toLowerCase();
    }
    if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "bigint" || typeof item === "boolean" || item instanceof Date) return item;
    return invalid();
  };
  if (input === null) return Prisma.sql`${field} IS NULL`;
  if (typeof input !== "object" || input instanceof Date) return Prisma.sql`${field} = ${value(input)}`;
  return combine(Object.entries(object(input)).filter(([, item]) => item !== undefined).map(([operator, item]) => {
    if (operator === "equals") return scalar(field, item, enumType);
    if (operator === "not") return item === null ? Prisma.sql`${field} IS NOT NULL` : Prisma.sql`NOT (${scalar(field, item, enumType)})`;
    if (operator === "in") {
      if (!Array.isArray(item)) return invalid();
      return item.length ? Prisma.sql`${field} IN (${Prisma.join(item.map(value))})` : Prisma.sql`1 = 0`;
    }
    if (operator === "contains" && typeof item === "string") return Prisma.sql`${field} LIKE ${`%${item}%`}`;
    const comparison = { gte: ">=", lte: "<=", gt: ">", lt: "<" }[operator];
    if (comparison) return Prisma.sql`${field} ${Prisma.raw(comparison)} ${value(item)}`;
    return invalid();
  }), "AND");
}

function predicate(model: string, alias: string, input: unknown, sequence: { value: number }): Prisma.Sql {
  return combine(Object.entries(object(input)).filter(([, value]) => value !== undefined).map(([key, value]) => {
    if (key === "AND" || key === "OR" || key === "NOT") {
      const parts = (Array.isArray(value) ? value : [value]).map((item) => predicate(model, alias, item, sequence));
      return key === "NOT" ? combine(parts.map((part) => Prisma.sql`NOT (${part})`), "AND") : combine(parts, key);
    }
    const relation = relations[model]?.[key];
    if (relation) {
      const [target, localKey, foreignKey] = relation;
      const nested = object(value);
      const kind = "some" in nested ? "some" : "none" in nested ? "none" : "is" in nested ? "is" : null;
      const nestedAlias = `r${++sequence.value}`;
      const table = models.get(target);
      if (!table) return invalid();
      const query = Prisma.sql`SELECT 1 FROM ${identifier(table.dbName ?? table.name)} ${identifier(nestedAlias)}
        WHERE ${column(target, nestedAlias, foreignKey)} = ${column(model, alias, localKey)}
        AND ${predicate(target, nestedAlias, kind ? nested[kind] : nested, sequence)}`;
      return kind === "none" ? Prisma.sql`NOT EXISTS (${query})` : Prisma.sql`EXISTS (${query})`;
    }
    const field = models.get(model)?.fields.find((item) => item.name === key && item.kind !== "object");
    if (!field) return invalid();
    return scalar(column(model, alias, key), value, field.kind === "enum" ? field.type : undefined);
  }), "AND");
}

export function buildManagedUserNumericPageQuery(
  where: Prisma.UserWhereInput,
  input: BackofficeScope & Pick<BackofficeManagedUserListQuery, "sortBy" | "sortDirection">,
  skip: number,
  take: number
): Prisma.Sql {
  const score = input.sortBy === "ndpBalance"
    ? Prisma.sql`COALESCE((SELECT w.available_balance FROM wallets w WHERE w.owner_type = 'user' AND w.owner_id = u.id AND w.currency = 'NDP' AND w.deleted_at IS NULL), 0)`
    : input.sortBy === "bookingCount"
      ? Prisma.sql`(SELECT COUNT(*) FROM booking_orders b WHERE b.customer_user_id = u.id AND b.deleted_at IS NULL ${input.scope === "merchant" ? Prisma.sql`AND b.shop_id = ${input.shopId}` : Prisma.empty})`
      : invalid();
  const direction = input.sortDirection === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return Prisma.sql`SELECT u.id FROM users u WHERE ${predicate("User", "u", where, { value: 0 })}
    ORDER BY ${score} ${direction}, u.id DESC LIMIT ${take} OFFSET ${skip}`;
}
