import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("identity application schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const modelBlock = (name: string): string => {
    const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));

    if (!match) {
      throw new Error(`missing model ${name}`);
    }

    return match[1];
  };

  const sharedModels = [
    "IdentityApplication",
    "TechnicianApplicationDetail",
    "MerchantApplicationDetail",
    "ProtectedBankAccount",
    "ContractAcceptance",
    "IdentityApplicationMedia"
  ];
  const modelTables = [
    "identity_applications",
    "technician_application_details",
    "merchant_application_details",
    "protected_bank_accounts",
    "contract_acceptances",
    "identity_application_media"
  ];

  it.each(sharedModels)("defines %s with the shared lifecycle columns", (name) => {
    const block = modelBlock(name);

    expect(block).toMatch(/id\s+Int\s+@id/);
    expect(block).toContain("createdAt");
    expect(block).toContain("updatedAt");
    expect(block).toContain("deletedAt");
  });

  it("guards one active application and records immutable review/retention state", () => {
    const block = modelBlock("IdentityApplication");

    expect(block).toMatch(/activeKey\s+String\?\s+@unique/);
    expect(block).toContain("submittedSnapshotHash");
    expect(block).toContain("rejectionReason");
    expect(block).toContain("purgeAt");
    expect(block).toContain("purgeStartedAt");
    expect(block).toContain("purgedAt");
    expect(block).toContain("technicianDetail");
    expect(block).toContain("merchantDetail");
    expect(block).toMatch(/@@index\(\[userId, type, status/);
  });

  it("keeps technician and merchant payloads in typed one-to-one detail records", () => {
    const technician = modelBlock("TechnicianApplicationDetail");
    const merchant = modelBlock("MerchantApplicationDetail");

    expect(technician).toMatch(/applicationId\s+Int\s+@unique/);
    expect(technician).toContain("targetShopId");
    expect(technician).toContain("applicantName");
    expect(technician).toContain("birthDate");
    expect(technician).toContain("submittedSnapshot");

    expect(merchant).toMatch(/applicationId\s+Int\s+@unique/);
    expect(merchant).toContain("applicantKind");
    expect(merchant).toContain("corporateLegalNameKana");
    expect(merchant).toContain("representativeNameKana");
    expect(merchant).toContain("showcaseDraft");
    expect(merchant).toContain("bankAccountId");
    expect(merchant).toContain("contractAcceptanceId");
    expect(merchant).toContain("submittedSnapshot");
  });

  it("stores protected bank values and immutable contract evidence without IP", () => {
    const bank = modelBlock("ProtectedBankAccount");
    const contract = modelBlock("ContractAcceptance");
    const merchant = modelBlock("MerchantAccount");

    expect(bank).toContain("accountNumberEncrypted");
    expect(bank).toContain("accountHolderEncrypted");
    expect(bank).toContain("accountHolderNormalizedEncrypted");
    expect(bank).toContain("holderMatchHash");
    expect(bank).toContain("verificationSource");
    expect(bank).toContain("verificationStatus");
    expect(bank).not.toMatch(/\baccountNumber\s+String/);
    expect(bank).toContain("settlementMerchantAccounts");
    expect(merchant).toContain("settlementBankAccountId");

    expect(contract).toContain("contractVersion");
    expect(contract).toContain("acceptedTextSnapshot");
    expect(contract).toContain("contentHash");
    expect(contract).toContain("acceptedAt");
    expect(contract).toContain("sessionId");
    expect(contract).not.toMatch(/\bip(?:Address)?\b/i);
  });

  it("ships a migration that transfers approved merchant bank data to operations", () => {
    const migrationPath = join(
      process.cwd(),
      "prisma/migrations/20260826130000_merchant_settlement_bank_link/migration.sql"
    );

    expect(existsSync(migrationPath)).toBe(true);
    expect(readFileSync(migrationPath, "utf8")).toContain("settlement_bank_account_id");
  });

  it("links application media and adds integrity plus purge metadata to MediaAsset", () => {
    const link = modelBlock("IdentityApplicationMedia");
    const media = modelBlock("MediaAsset");

    expect(link).toContain("applicationId");
    expect(link).toContain("mediaAssetId");
    expect(link).toContain("purpose");
    expect(link).toContain("variant");
    expect(link).toContain("sourceMediaId");
    expect(link).toMatch(/@@unique\(\[sourceMediaId, variant\]\)/);
    expect(link).toMatch(/@@unique\(\[applicationId, mediaAssetId\]/);
    expect(media).toContain("checksumSha256");
    expect(media).toContain("purgeAt");
    expect(media).toContain("purgedAt");
  });

  it("ships a formal migration with all six tables", () => {
    const migrationPath = join(
      process.cwd(),
      "prisma/migrations/20260826120000_identity_application_workflows/migration.sql"
    );

    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    modelTables.forEach((tableName) => {
      expect(migration).toContain(`CREATE TABLE \`${tableName}\``);
    });
  });
});
