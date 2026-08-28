import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("booking platform fee debt schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260829010000_booking_platform_fee_debt_reward/migration.sql"
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

  it("defines explicit platform fee debt and user reward states", () => {
    const debt = enumBlock("PlatformFeeDebtStatus");
    expect(debt).toMatch(/NONE\s+@map\("none"\)/);
    expect(debt).toMatch(/OUTSTANDING\s+@map\("outstanding"\)/);
    expect(debt).toMatch(/SETTLED\s+@map\("settled"\)/);

    const reward = enumBlock("UserRewardStatus");
    expect(reward).toMatch(/DISABLED\s+@map\("disabled"\)/);
    expect(reward).toMatch(/IMMEDIATE\s+@map\("immediate"\)/);
    expect(reward).toMatch(/PENDING\s+@map\("pending"\)/);
    expect(reward).toMatch(/PAID\s+@map\("paid"\)/);
    expect(reward).toMatch(/EXPIRED\s+@map\("expired"\)/);
  });

  it("persists the immutable acceptance snapshot and mutable debt/reward lifecycle", () => {
    const financial = modelBlock("OrderFinancial");

    for (const field of [
      "platformFeeEnabledSnapshot",
      "platformFeeGlobalVersion",
      "platformFeePolicyVersion",
      "platformFeeAmountNdpSnapshot",
      "platformFeeWalletOwnerType",
      "platformFeeWalletOwnerId",
      "platformFeeWalletId",
      "platformFeeShortfallNdp",
      "platformFeeOutstandingNdp",
      "platformFeeDebtStatus",
      "platformFeeAcceptedAt",
      "platformFeeOverdraftConfirmationKey",
      "platformFeePreviewVersion",
      "userRewardEligibleNdp",
      "userRewardStatus",
      "userRewardDeadlineAt",
      "userRewardGrantedAt"
    ]) {
      expect(financial).toContain(field);
    }

    expect(financial).toContain(
      '@@index([platformFeeWalletId, platformFeeDebtStatus, platformFeeAcceptedAt, id], map: "order_financials_wallet_debt_accepted_idx")'
    );
    expect(financial).toContain(
      '@@index([userRewardStatus, userRewardDeadlineAt, id], map: "order_financials_reward_deadline_idx")'
    );
    expect(financial).toMatch(
      /platformFeeOverdraftConfirmationKey\s+String\?\s+@unique\(map: "order_financials_overdraft_confirmation_key"\)/
    );
  });

  it("ships one additive migration without rewriting financial history", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("platform_fee_enabled_snapshot");
    expect(migration).toContain("platform_fee_outstanding_ndp");
    expect(migration).toContain("user_reward_deadline_at");
    expect(migration).toContain("order_financials_wallet_debt_accepted_idx");
    expect(migration).toContain("order_financials_reward_deadline_idx");
    expect(migration).not.toMatch(/DROP\s+(?:COLUMN|TABLE)/i);
    expect(migration).not.toMatch(/DELETE\s+FROM|UPDATE\s+`?order_financials`?/i);
  });
});
