import { readFileSync } from "node:fs";
import { join } from "node:path";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20260831120000_shop_membership_foundation/migration.sql"),
  "utf8"
);

describe("shop membership foundation schema", () => {
  it("defines a shop-scoped customer membership and read-only card projection", () => {
    for (const token of [
      "enum ShopCustomerMembershipStatus",
      "enum ShopCustomerMembershipSource",
      "enum ShopMembershipCardType",
      "enum ShopMembershipCardStatus",
      "model ShopCustomerMembership",
      "model ShopMembershipCard",
      "shop_customer_memberships_active_key_key",
      "shop_customer_memberships_shop_status_idx",
      "shop_customer_memberships_customer_status_idx",
      "shop_membership_cards_membership_status_idx",
      "shop_membership_cards_status_expiry_idx"
    ]) {
      expect(schema).toContain(token);
    }
  });

  it("creates only additive tables, foreign keys, and indexes without demo rows", () => {
    expect(migration).toContain("CREATE TABLE `shop_customer_memberships`");
    expect(migration).toContain("CREATE TABLE `shop_membership_cards`");
    expect(migration).toContain("FOREIGN KEY (`shop_id`) REFERENCES `shops`(`id`)");
    expect(migration).toContain(
      "FOREIGN KEY (`customer_profile_id`) REFERENCES `customer_profiles`(`id`)"
    );
    expect(migration).toContain(
      "FOREIGN KEY (`membership_id`) REFERENCES `shop_customer_memberships`(`id`)"
    );
    expect(migration).not.toContain("INSERT INTO");
    expect(migration).not.toContain("UPDATE `");
  });
});
