import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  SYSTEM_PERMISSIONS
} from "../src/constants/permissions.constants";

describe("merchant SaaS billing schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it.each([
    "model MerchantAccount",
    "model MerchantShopMembership",
    "model SaasBillingProfile",
    "model SaasFreePeriod",
    "model SaasInvoice",
    "model SaasInvoiceLine",
    "model SaasPayment",
    "model EntitySuspension"
  ])("contains %s", (model) => {
    expect(schema).toContain(model);
  });

  it("uses soft deletion and an active-key uniqueness guard for mutable aggregates", () => {
    expect(schema).toContain('activeKey         String?   @unique @map("active_key")');
    expect(schema).toContain("batchKey");
    expect(schema.match(/deletedAt\s+DateTime\?/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });

  it("supports an open manual-free period until an administrator releases the lock", () => {
    expect(schema).toMatch(/endsAt\s+DateTime\?\s+@map\("ends_at"\)/);
    expect(
      existsSync(
        join(
          process.cwd(),
          "prisma/migrations/20260825120000_open_manual_free_periods/migration.sql"
        )
      )
    ).toBe(true);
  });

  it("persists the operator who created a shop without inventing historical creators", () => {
    const migrationPath = join(
      process.cwd(),
      "prisma/migrations/20260908193000_shop_creator_contract/migration.sql"
    );
    expect(schema).toContain('createdById                  Int?            @map("created_by_id")');
    expect(schema).toContain('@relation("ShopCreatedBy"');
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain("ADD COLUMN `created_by_id` INTEGER NULL");
    expect(migration).toContain("ON DELETE SET NULL ON UPDATE CASCADE");
    expect(migration).not.toMatch(/\bUPDATE\s+`?shops`?/i);

    const repository = readFileSync(
      join(process.cwd(), "src/repositories/merchant-saas-billing.repository.ts"),
      "utf8"
    );
    expect(repository).toContain("creator: { select: { id: true, needoId: true, username: true, email: true } }");
    expect(repository).toContain("createdBy: shop.creator");
  });

  it("registers granular backoffice permissions for billing and account actions", () => {
    const expectedCodes = [
      "backoffice:merchant-accounts:list",
      "backoffice:merchant-accounts:read",
      "backoffice:merchant-accounts:manage",
      "backoffice:saas-billing:read",
      "backoffice:saas-billing:write",
      "backoffice:saas-payment:review",
      "backoffice:entity-suspension:write",
      "backoffice:entity-suspension:release",
      "backoffice:entity-dissolution:write"
    ];

    expect(SYSTEM_PERMISSION_CODES).toEqual(expect.arrayContaining(expectedCodes));
    expect(SYSTEM_PERMISSIONS.map((permission) => permission.code)).toEqual(
      expect.arrayContaining(expectedCodes)
    );
  });
});
