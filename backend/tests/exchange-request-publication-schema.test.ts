import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("Exchange Request publication schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260830300000_exchange_request_publication/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing model ${name}`);
    return match[1];
  };

  const enumBlock = (name: string): string => {
    const match = schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`missing enum ${name}`);
    return match[1];
  };

  it("persists the formal Request contract and publication fingerprint", () => {
    expect(enumBlock("ExchangeMatchMode")).toMatch(/QUICK\s+@map\("quick"\)/);
    expect(enumBlock("ExchangeMatchMode")).toMatch(/SELECTIVE\s+@map\("selective"\)/);
    expect(enumBlock("ExchangeBudgetMode")).toMatch(/TOTAL\s+@map\("total"\)/);
    expect(enumBlock("ExchangeBudgetMode")).toMatch(
      /PER_PROVIDER\s+@map\("per_provider"\)/
    );
    expect(enumBlock("ExchangePublisherCapacitySource")).toMatch(
      /CUSTOMER_MEMBERSHIP\s+@map\("customer_membership"\)/
    );
    expect(enumBlock("ExchangePublisherCapacitySource")).toMatch(
      /SHOP_MERCHANT\s+@map\("shop_merchant"\)/
    );

    const post = modelBlock("ExchangePost");
    expect(post).toMatch(
      /payloadFingerprint\s+String\?\s+@map\("payload_fingerprint"\)\s+@db\.Char\(64\)/
    );
    expect(post).toMatch(/requestFinancial\s+ExchangeRequestFinancial\?/);

    const demand = modelBlock("ExchangeDemand");
    expect(demand).toMatch(/targetProviderCount\s+Int\s+@default\(1\)/);
    expect(demand).toMatch(/targetProviderLimitSnapshot\s+Int\s+@default\(1\)/);
    expect(demand).toMatch(/publisherCapacitySource\s+ExchangePublisherCapacitySource/);
    expect(demand).toMatch(/membershipLevelSnapshot\s+String\?/);
    expect(demand).toMatch(/matchMode\s+ExchangeMatchMode/);
    expect(demand).toMatch(/budgetMode\s+ExchangeBudgetMode/);
    expect(demand).toMatch(/budgetMinJpy\s+Int\?/);
    expect(demand).toMatch(/budgetMaxJpy\s+Int/);
    expect(demand).toMatch(/addressLine1\s+String/);
    expect(demand).toMatch(/addressLine2\s+String\?/);
    expect(demand).toMatch(/addressLine3\s+String\?/);
    expect(demand).toMatch(/addressLine2Public\s+Boolean\s+@default\(false\)/);
    expect(demand).toMatch(/addressLine3Public\s+Boolean\s+@default\(false\)/);
    expect(demand).toMatch(/publisherIdentityPublic\s+Boolean\s+@default\(false\)/);
  });

  it("adds one immutable Request financial snapshot backed by existing fee and hold tables", () => {
    expect(enumBlock("ExchangeRequestFinancialState")).toMatch(/HELD\s+@map\("held"\)/);
    expect(enumBlock("ExchangeRequestFinancialState")).toMatch(
      /CAPTURED\s+@map\("captured"\)/
    );
    expect(enumBlock("ExchangeRequestFinancialState")).toMatch(
      /RELEASED\s+@map\("released"\)/
    );

    const financial = modelBlock("ExchangeRequestFinancial");
    expect(financial).toMatch(/exchangePostId\s+Int\s+@unique/);
    expect(financial).toMatch(/feeRuleSetId\s+Int/);
    expect(financial).toMatch(/feeRuleSetVersion\s+Int/);
    expect(financial).toMatch(/feeRuleId\s+Int/);
    expect(financial).toMatch(/feeCalculationLogId\s+Int\s+@unique/);
    expect(financial).toMatch(/walletHoldId\s+Int\s+@unique/);
    expect(financial).toMatch(/currency\s+String\s+@db\.VarChar\(10\)/);
    expect(financial).toMatch(/state\s+ExchangeRequestFinancialState\s+@default\(HELD\)/);
    expect(financial).toMatch(/deletedAt\s+DateTime\?/);

    const calculationLog = modelBlock("FeeCalculationLog");
    expect(calculationLog).toMatch(/exchangePostId\s+Int\?/);
    expect(calculationLog).toMatch(/@@index\(\[exchangePostId\]\)/);

    const hold = modelBlock("WalletHold");
    expect(hold).toMatch(/bookingOrderId\s+Int\?/);
    expect(hold).toMatch(/exchangePostId\s+Int\?\s+@unique/);
  });

  it("uses dedicated Request publication ledger vocabulary", () => {
    const ledgerTypes = enumBlock("LedgerTransactionType");
    expect(ledgerTypes).toMatch(
      /EXCHANGE_REQUEST_PUBLICATION_FREEZE\s+@map\("exchange_request_publication_freeze"\)/
    );
    expect(ledgerTypes).toMatch(
      /EXCHANGE_REQUEST_PUBLICATION_CAPTURE\s+@map\("exchange_request_publication_capture"\)/
    );
    expect(ledgerTypes).toMatch(
      /EXCHANGE_REQUEST_PUBLICATION_RELEASE\s+@map\("exchange_request_publication_release"\)/
    );
    expect(ledgerTypes).toMatch(/BOOKING_ACCEPT_FREEZE/);
    expect(ledgerTypes).toMatch(/TEST_BALANCE_CALIBRATION/);
  });

  it("ships an additive guarded migration with the initial 1000 NDP rule and exact role grants", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("wallet_holds_exactly_one_business_ref");
    expect(migration).toContain("exchange_request_financials");
    expect(migration).toContain("exchange_request_publication");
    expect(migration).toContain("exchange_request_publication_fee");
    expect(migration).toContain("'exchange_request'");
    expect(migration).toContain("'lock_at_publish'");
    expect(migration).toMatch(/'publisher',\s*1000,\s*'fixed'/);
    expect(migration).toContain("backoffice:exchange-request-fee:read");
    expect(migration).toContain("backoffice:exchange-request-fee:write");
    expect(migration).toMatch(
      /roles`\.`code`\s+IN\s+\('admin',\s*'customer',\s*'merchant_owner'\)/
    );
    expect(migration).not.toMatch(
      /exchange:posts:create-demand[\s\S]{0,500}roles`\.`code`\s+IN\s+\([^)]*merchant_staff/
    );
    expect(migration).not.toMatch(/DELETE\s+FROM|DROP\s+TABLE/i);
    expect(migration).not.toMatch(
      /UPDATE\s+`platform_fee_rules`[\s\S]*c_request_dispatch_fee/i
    );
  });
});
