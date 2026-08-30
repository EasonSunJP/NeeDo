import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange Test NDP foundation schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260830210000_exchange_test_ndp_foundation/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) {
      throw new Error(`missing model ${name}`);
    }
    return match[1];
  };

  it("persists test classification and currency snapshots", () => {
    expect(schema).toMatch(
      /isTestAccount\s+Boolean\s+@default\(false\)\s+@map\("is_test_account"\)/
    );
    expect(schema).toMatch(/TEST_BALANCE_CALIBRATION\s+@map\("test_balance_calibration"\)/);
    expect(schema).toMatch(/TEST_ONLY\s+@map\("test_only"\)/);
    expect(modelBlock("WalletHold")).toMatch(/currency\s+String\s+@default\("NDP"\)/);
    expect(modelBlock("OrderFinancial")).toMatch(
      /ndpCurrency\s+String\s+@default\("NDP"\)\s+@map\("ndp_currency"\)/
    );
  });

  it("ships one migration that preserves history and reclassifies current data", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("UPDATE `users` SET `is_test_account` = TRUE");
    expect(migration).toContain("UPDATE `wallets` SET `currency` = 'TEST_NDP'");
    expect(migration).toContain("UPDATE `ledger_transactions` SET `currency` = 'TEST_NDP'");
    expect(migration).toContain("UPDATE `finance_reconciliations`");
    expect(migration).toContain("'user:test-account:update'");
    expect(migration).toContain("'button:user:test-account:update'");
    expect(migration).toContain("WHERE roles.code IN ('admin', 'operator')");
    expect(migration).toContain("AND permissions.deleted_at IS NULL");
    expect(migration).toContain("AND roles.deleted_at IS NULL");
    expect(migration).not.toMatch(/DELETE\s+FROM|DROP\s+TABLE/i);
  });
});
