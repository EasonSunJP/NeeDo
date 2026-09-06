import { DatabaseSync } from "node:sqlite";
import type { Prisma } from "@prisma/client";
import { buildManagedUserNumericPageQuery } from "../src/repositories/managed-user-numeric-sort";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, deleted_at TEXT, email TEXT, is_active INTEGER);
    CREATE TABLE wallets (owner_type TEXT, owner_id INTEGER, currency TEXT, available_balance INTEGER, deleted_at TEXT);
    CREATE TABLE booking_orders (customer_user_id INTEGER, shop_id INTEGER, deleted_at TEXT);
    CREATE TABLE customer_profiles (user_id INTEGER, city TEXT, deleted_at TEXT);
    CREATE TABLE external_auth_accounts (user_id INTEGER, provider TEXT, deleted_at TEXT);
    INSERT INTO users VALUES (1,NULL,'one',1),(2,NULL,'two',1),(3,NULL,'three',1),(4,NULL,'four',1),(5,'deleted','five',1);
    INSERT INTO wallets VALUES ('user',1,'NDP',20,NULL),('user',2,'NDP',100,NULL),('user',3,'TEST_NDP',90000,NULL),('user',4,'NDP',900,'deleted'),('user',5,'NDP',9999,NULL),('shop',3,'NDP',8888,NULL);
    INSERT INTO booking_orders VALUES (1,7,NULL),(1,7,NULL),(2,7,NULL),(2,8,NULL),(2,8,NULL),(3,8,NULL),(4,7,'deleted');
    INSERT INTO customer_profiles VALUES (1,'Tokyo',NULL),(2,'Tokyo',NULL),(3,'Osaka',NULL),(4,'Tokyo',NULL);
    INSERT INTO external_auth_accounts VALUES (1,'google',NULL);`);
  return db;
}
function ids(db: DatabaseSync, where: Prisma.UserWhereInput, sortBy: "ndpBalance" | "bookingCount", sortDirection: "asc" | "desc", skip = 0, take = 20, shopId?: number) {
  const query = buildManagedUserNumericPageQuery(where, { sortBy, sortDirection, ...(shopId ? { scope: "merchant", shopId } : { scope: "platform" }) } as never, skip, take);
  return db.prepare(query.sql).all(...query.values.map((v) => typeof v === "boolean" ? Number(v) : v) as never[]).map((row) => row.id);
}
describe("managed-user numeric SQL paging", () => {
  it("orders NDP numerically before pagination and treats absent/deleted wallets as zero", () => {
    const db = database();
    try {
      expect(ids(db, { deletedAt: null }, "ndpBalance", "desc", 0, 2)).toEqual([2,1]);
      expect(ids(db, { deletedAt: null }, "ndpBalance", "desc", 2, 2)).toEqual([4,3]);
      expect(ids(db, { deletedAt: null }, "ndpBalance", "asc")).toEqual([4,3,1,2]);
      expect(ids(db, { deletedAt: null, customerProfile: { is: { city: "Tokyo", deletedAt: null } } }, "ndpBalance", "desc")).toEqual([2,1,4]);
    } finally { db.close(); }
  });
  it("counts only nondeleted orders in the authenticated merchant shop", () => {
    const db = database();
    try {
      expect(ids(db, { deletedAt: null }, "bookingCount", "desc")).toEqual([2,1,3,4]);
      expect(ids(db, { deletedAt: null, bookingOrders: { some: { shopId: 7, deletedAt: null } } }, "bookingCount", "desc", 0, 20, 7)).toEqual([1,2]);
    } finally { db.close(); }
  });
  it("keeps scalar filters parameterized and unknown predicates fail closed", () => {
    const db = database();
    try {
      expect(ids(db, { deletedAt: null, email: { contains: "' OR 1=1 --" } }, "ndpBalance", "desc")).toEqual([]);
      expect(ids(db, { deletedAt: null, AND: [{ id: { in: [1,2,3] } }, { NOT: { id: { in: [2] } } }], OR: [{ email: "one" }, { email: "three" }] }, "ndpBalance", "desc")).toEqual([1,3]);
      expect(() => ids(db, { invented: 1 } as never, "ndpBalance", "desc")).toThrow();
    } finally { db.close(); }
  });
  it("preserves external sign-in filters alongside numeric sorting", () => {
    const db = database();
    try {
      expect(ids(db, { deletedAt: null, externalAccounts: { some: { provider: "google", deletedAt: null } } }, "ndpBalance", "desc")).toEqual([1]);
    } finally { db.close(); }
  });
  it("supports nested membership, group and identity predicates using mapped schema names", () => {
    const query = buildManagedUserNumericPageQuery({ deletedAt: null, AND: [
      { technicianProfile: { is: { city: { in: ["Tokyo"] }, deletedAt: null } } },
      { identities: { some: { type: "merchant", isActive: true, scopeType: "shop", scopeId: 7, deletedAt: null } } },
      { ekycVerifications: { none: { status: "verified", verifiedAt: { not: null }, deletedAt: null } } },
      { experienceAccount: { is: { currentLevel: { gte: 2, lte: 10 }, totalExpUnits: { gte: 0n }, deletedAt: null } } },
      { membershipAdjustments: { some: { supersededAt: null, tierVersion: { tier: { code: "GOLD" } } } } },
      { platformMembershipEntitlements: { some: { tierVersion: { status: "PUBLISHED", tier: { code: "GOLD" } } } } },
      { userRoles: { some: { role: { code: "admin", deletedAt: null } } } },
      { backofficeUserGroupMemberships: { some: { group: { code: "group-1", status: "ACTIVE" } } } }
    ] }, { scope: "platform", sortBy: "ndpBalance", sortDirection: "desc" }, 0, 20);
    expect(query.values).toEqual(expect.arrayContaining(["gold", "published", "active", "group-1"]));
    expect(query.sql).toContain("`platform_membership_tiers`");
    expect(query.sql).not.toContain("group-1");
  });
});
