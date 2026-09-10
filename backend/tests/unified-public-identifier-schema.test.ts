import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("unified public identifier schema foundation", () => {
  const schemaPath = join(process.cwd(), "prisma/schema.prisma");
  const migrationPath = join(
    process.cwd(),
    "prisma/migrations/20260828090000_unified_public_identifier_foundation/migration.sql"
  );
  const schema = readFileSync(schemaPath, "utf8");
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
  const realtimeRepository = readFileSync(
    join(process.cwd(), "src/repositories/realtime.repository.ts"),
    "utf8"
  );
  const messageSendTransaction = readFileSync(
    join(process.cwd(), "src/repositories/im-message-send.transaction.ts"),
    "utf8"
  );
  const deployedPrerequisiteMigrations = [
    "20260826132000_im_message_lifecycle_policy",
    "20260826133000_im_deletion_sync",
    "20260826134000_group_privacy_mode",
    "20260827200000_technician_employment_type",
    "20260828030000_contact_block_state",
    "20260828031500_contact_block_permission",
    "20260828060000_message_recall_permission"
  ];

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

  it("adds nullable ten-digit allocation fields without removing the legacy needoId", () => {
    const user = modelBlock("User");
    const shop = modelBlock("Shop");
    const merchant = modelBlock("MerchantAccount");

    expect(user).toMatch(/needoId\s+String\s+@unique/);
    expect(user).toMatch(/accountNo\s+String\?\s+@unique\s+@map\("account_no"\)\s+@db\.Char\(10\)/);
    expect(user).toMatch(
      /primaryIdentityType\s+PrimaryIdentityType\?\s+@map\("primary_identity_type"\)/
    );
    expect(shop).toMatch(/shopNo\s+String\?\s+@unique\s+@map\("shop_no"\)\s+@db\.Char\(10\)/);
    expect(merchant).toMatch(/ownerNo\s+String\?\s+@unique\s+@map\("owner_no"\)\s+@db\.Char\(10\)/);
    expect(enumBlock("PrimaryIdentityType")).toMatch(/U\s+@map\("u"\)/);
    expect(enumBlock("PrimaryIdentityType")).toMatch(/NEEDO\s+@map\("needo"\)/);
  });

  it("defines one public identifier registry for identity and entity targets", () => {
    const identifier = modelBlock("PublicIdentifier");

    expect(identifier).toMatch(
      /publicId\s+String\s+@unique\s+@map\("public_id"\)\s+@db\.VarChar\(32\)/
    );
    expect(identifier).toMatch(/numberPart\s+String\s+@map\("number_part"\)\s+@db\.Char\(10\)/);
    expect(identifier).toMatch(/kind\s+PublicIdentifierKind/);
    expect(identifier).toMatch(/status\s+PublicIdentifierStatus\s+@default\(ACTIVE\)/);
    expect(identifier).toMatch(/userIdentityId\s+Int\?\s+@unique/);
    expect(identifier).toMatch(/shopId\s+Int\?\s+@unique/);
    expect(identifier).toMatch(/merchantAccountId\s+Int\?\s+@unique/);
    expect(identifier).toMatch(/customerSupportAccountId\s+Int\?\s+@unique/);
    expect(identifier).toMatch(/loginAllowed\s+Boolean\s+@default\(false\)/);
    expect(identifier).toMatch(/searchable\s+Boolean\s+@default\(false\)/);
    expect(identifier).toMatch(/@@unique\(\[kind, numberPart\]/);
    expect(identifier).toMatch(/@@index\(\[status\]/);
    expect(identifier).toMatch(/@@index\(\[deletedAt\]/);

    const kind = enumBlock("PublicIdentifierKind");
    for (const [value, mapped] of [
      ["U", "u"],
      ["NEEDO", "needo"],
      ["S", "s"],
      ["B", "b"],
      ["O", "o"],
      ["SHOP", "shop"],
      ["OWNER", "owner"],
      ["CUSTOMER_SUPPORT", "cs"]
    ]) {
      expect(kind).toMatch(new RegExp(`${value}\\s+@map\\("${mapped}"\\)`));
    }
    expect(enumBlock("PublicIdentifierStatus")).toMatch(/TOMBSTONED\s+@map\("tombstoned"\)/);
  });

  it("adds the minimal one-to-one customer support account foundation", () => {
    const supportAccount = modelBlock("CustomerSupportAccount");
    const shop = modelBlock("Shop");

    expect(supportAccount).toMatch(/shopId\s+Int\?\s+@unique/);
    expect(supportAccount).toMatch(/type\s+CustomerSupportAccountType/);
    expect(supportAccount).toMatch(/shop\s+Shop\?/);
    expect(supportAccount).toMatch(/publicIdentifier\s+PublicIdentifier\?/);
    expect(shop).toMatch(/customerSupportAccount\s+CustomerSupportAccount\?/);
  });

  it.each([
    "CustomerSupportAccount",
    "PublicIdentifier",
    "VanityNumberRule",
    "VanityNumberReservation"
  ])("defines %s with shared timestamps and soft deletion", (name) => {
    const block = modelBlock(name);
    expect(block).toMatch(/id\s+Int\s+@id/);
    expect(block).toContain("createdAt");
    expect(block).toContain("updatedAt");
    expect(block).toContain("deletedAt");
    expect(block).toMatch(/@@index\(\[deletedAt\]/);
  });

  it("seals vanity numbers with an immutable ten-digit reservation key", () => {
    const rule = modelBlock("VanityNumberRule");
    const reservation = modelBlock("VanityNumberReservation");

    expect(rule).toMatch(/code\s+String\s+@unique/);
    expect(rule).toMatch(/kind\s+VanityNumberRuleKind/);
    expect(rule).toMatch(/isActive\s+Boolean\s+@default\(true\)/);
    expect(reservation).toMatch(
      /numberPart\s+String\s+@unique\s+@map\("number_part"\)\s+@db\.Char\(10\)/
    );
    expect(reservation).toMatch(/ruleId\s+Int\?/);
    expect(reservation).toMatch(/status\s+String\s+@default\("sealed"\)/);
    expect(reservation).toMatch(/@@index\(\[status\]/);
  });

  it("ships an additive migration with database-enforced identifier invariants", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain("ADD COLUMN `account_no` CHAR(10) NULL");
    expect(migration).toContain("ADD COLUMN `shop_no` CHAR(10) NULL");
    expect(migration).toContain("ADD COLUMN `owner_no` CHAR(10) NULL");
    expect(migration).toContain("CREATE TABLE `customer_support_accounts`");
    expect(migration).toContain("CREATE TABLE `public_identifiers`");
    expect(migration).toContain("CREATE TABLE `vanity_number_rules`");
    expect(migration).toContain("CREATE TABLE `vanity_number_reservations`");
    expect(migration).toContain("CONSTRAINT `public_identifiers_single_target_check` CHECK");
    expect(migration).toContain("CONSTRAINT `public_identifiers_target_kind_check` CHECK");
    expect(migration).toContain("CONSTRAINT `public_identifiers_public_id_format_check` CHECK");
    expect(migration).toContain("BINARY `public_id` = BINARY CONCAT(`kind`, `number_part`)");
    expect(migration).toContain("ENUM('active', 'disabled', 'tombstoned')");
    expect(migration).not.toMatch(/^\s*(?:DROP|RENAME|CHANGE|UPDATE|INSERT|DELETE)\b/im);
  });

  it("uses restrictive updates for foreign keys whose columns participate in checks", () => {
    expect(migration).toMatch(
      /customer_support_accounts_shop_id_fkey[\s\S]*ON DELETE RESTRICT ON UPDATE RESTRICT/
    );
    for (const constraint of [
      "public_identifiers_user_identity_id_fkey",
      "public_identifiers_shop_id_fkey",
      "public_identifiers_merchant_account_id_fkey",
      "public_identifiers_customer_support_account_id_fkey"
    ]) {
      expect(migration).toMatch(
        new RegExp(`${constraint}[\\s\\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT`)
      );
    }
  });

  it("preserves already-deployed prerequisite migrations and their schema projections", () => {
    for (const migrationName of deployedPrerequisiteMigrations) {
      expect(
        existsSync(join(process.cwd(), `prisma/migrations/${migrationName}/migration.sql`))
      ).toBe(true);
    }

    const technician = modelBlock("TechnicianProfile");
    const conversation = modelBlock("Conversation");
    const message = modelBlock("Message");
    const contact = modelBlock("Contact");

    expect(enumBlock("TechnicianEmploymentType")).toContain("INDEPENDENT");
    expect(technician).toMatch(/employmentType\s+TechnicianEmploymentType/);
    expect(technician).toContain("employmentStartedAt");
    expect(enumBlock("MessageRecallMode")).toContain("TRACELESS");
    expect(enumBlock("ImDeletionAction")).toContain("SERVER_RETENTION_EXPIRED");
    expect(conversation).toContain("privacyModeEnabled");
    expect(conversation).toContain("disappearingTtlSeconds");
    expect(message).toContain("recallDeadlineAt");
    expect(message).toContain("privacyPolicyVersionAtSend");
    expect(modelBlock("ImPolicy")).toContain("recallWindowSeconds");
    expect(modelBlock("ImDeletionSync")).toContain("conversationId");
    expect(contact).toContain("blockedAt");
  });

  it("keeps formal message writes compatible with the deployed lifecycle constraint", () => {
    expect(realtimeRepository).toContain('from "./im-message-send.transaction"');
    expect(realtimeRepository).toContain("persistImMessageInTransaction(tx,");
    expect(messageSendTransaction).toContain("transaction.imPolicy.findFirst");
    expect(messageSendTransaction).toContain("recallWindowSeconds");
    expect(messageSendTransaction).toContain("recallDeadlineAt:");
    expect(messageSendTransaction).toContain("lifecycleVersion:");
  });
});
