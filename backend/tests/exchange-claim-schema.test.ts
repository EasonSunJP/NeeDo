import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXCHANGE_PERMISSIONS,
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

describe("Exchange selective claim persistence contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260901100000_exchange_selective_claim/migration.sql"
  );
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
  const withdrawalMigrationPath = join(
    process.cwd(),
    "prisma/migrations/20260901130000_exchange_claim_withdraw_idempotency/migration.sql"
  );
  const withdrawalMigration = existsSync(withdrawalMigrationPath)
    ? readFileSync(withdrawalMigrationPath, "utf8")
    : "";

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

  it("defines the four pre-match claim states", () => {
    const claimStatus = enumBlock("ExchangeClaimStatus");

    expect(claimStatus).toMatch(/ACTIVE\s+@map\("active"\)/);
    expect(claimStatus).toMatch(/WITHDRAWN\s+@map\("withdrawn"\)/);
    expect(claimStatus).toMatch(/REQUEST_WITHDRAWN\s+@map\("request_withdrawn"\)/);
    expect(claimStatus).toMatch(/REQUEST_EXPIRED\s+@map\("request_expired"\)/);
  });

  it("persists one technician-level claim with idempotency and an active time-lock key", () => {
    const claim = modelBlock("ExchangeClaim");

    expect(claim).toMatch(/exchangePostId\s+Int\s+@map\("exchange_post_id"\)/);
    expect(claim).toMatch(/claimantUserId\s+Int\s+@map\("claimant_user_id"\)/);
    expect(claim).toMatch(/claimantIdentityId\s+Int\s+@map\("claimant_identity_id"\)/);
    expect(claim).toMatch(/shopId\s+Int\s+@map\("shop_id"\)/);
    expect(claim).toMatch(/technicianProfileId\s+Int\s+@map\("technician_profile_id"\)/);
    expect(claim).toMatch(/serviceId\s+Int\?/);
    expect(claim).toMatch(/technicianServiceId\s+Int\?/);
    expect(claim).toMatch(/scheduleSlotId\s+Int\s+@map\("schedule_slot_id"\)/);
    expect(claim).toMatch(/quoteAmountJpy\s+Int\s+@map\("quote_amount_jpy"\)/);
    expect(claim).toMatch(/activeKey\s+String\?\s+@unique/);
    expect(claim).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(claim).toMatch(/payloadFingerprint\s+String\s+@map\("payload_fingerprint"\)/);
    expect(claim).toMatch(/withdrawalIdempotencyKey\s+String\?\s+@unique/);
    expect(claim).toMatch(
      /withdrawalPayloadFingerprint\s+String\?\s+@map\("withdrawal_payload_fingerprint"\)/
    );
    expect(claim).toMatch(/deletedAt\s+DateTime\?/);
    expect(claim).toMatch(/@@map\("exchange_claims"\)/);
  });

  it("adds a retry-safe withdrawal idempotency pair without rewriting the applied claim migration", () => {
    expect(withdrawalMigration).toContain("ALTER TABLE `exchange_claims`");
    expect(withdrawalMigration).toContain("withdrawal_idempotency_key");
    expect(withdrawalMigration).toContain("withdrawal_payload_fingerprint");
    expect(withdrawalMigration).toContain("exchange_claims_withdrawal_idem_pair");
    expect(withdrawalMigration).toContain("UNIQUE INDEX");
  });

  it("adds restrictive relations, checks and bounded indexes in the migration", () => {
    expect(migration).toContain("CREATE TABLE `exchange_claims`");
    expect(migration).toContain("exchange_claims_exactly_one_service_ref");
    expect(migration).toContain("exchange_claims_active_key_matches_status");
    expect(migration).toMatch(/FOREIGN KEY \(`exchange_post_id`\)[\s\S]*ON DELETE RESTRICT ON UPDATE RESTRICT/);
    expect(migration).toMatch(/FOREIGN KEY \(`schedule_slot_id`\)[\s\S]*ON DELETE RESTRICT ON UPDATE RESTRICT/);
    expect(migration).not.toMatch(/ON DELETE CASCADE/);
  });

  it("registers and assigns the exact claim permissions", () => {
    expect(EXCHANGE_PERMISSIONS).toMatchObject({
      claimOptionList: "exchange:claim-options:list",
      claimCreate: "exchange:claims:create",
      claimReadOwn: "exchange:claims:read-own",
      claimListOwnedRequest: "exchange:claims:list-owned-request",
      claimWithdrawOwn: "exchange:claims:withdraw-own"
    });

    const assignments = buildRolePermissionAssignments();
    for (const code of Object.values(EXCHANGE_PERMISSIONS).filter((permission) =>
      permission.startsWith("exchange:claim")
    )) {
      expect(SYSTEM_PERMISSION_CODES.filter((permission) => permission === code)).toHaveLength(1);
    }

    for (const role of ["merchant_owner", "merchant_staff", "technician"] as const) {
      expect(assignments[role]).toEqual(
        expect.arrayContaining([
          "exchange:claim-options:list",
          "exchange:claims:create",
          "exchange:claims:read-own",
          "exchange:claims:withdraw-own"
        ])
      );
    }
    expect(assignments.customer).toContain("exchange:claims:list-owned-request");
    expect(assignments.merchant_owner).toContain("exchange:claims:list-owned-request");
    expect(assignments.merchant_staff).not.toContain("exchange:claims:list-owned-request");
    expect(assignments.technician).not.toContain("exchange:claims:list-owned-request");
  });
});
