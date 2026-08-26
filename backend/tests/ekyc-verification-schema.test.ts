import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal eKYC verification schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("stores provider-backed verification evidence and only encrypted names", () => {
    const match = schema.match(/model EkycVerification \{([\s\S]*?)\n\}/);
    if (!match) throw new Error("missing model EkycVerification");
    const block = match[1];

    expect(block).toMatch(/id\s+Int\s+@id/);
    expect(block).toContain("providerReference");
    expect(block).toContain("verifiedNameEncrypted");
    expect(block).toContain("verifiedNameKanaEncrypted");
    expect(block).toContain("nameMatchHash");
    expect(block).toContain("resultHash");
    expect(block).toContain("verifiedAt");
    expect(block).toContain("expiresAt");
    expect(block).toContain("createdAt");
    expect(block).toContain("updatedAt");
    expect(block).toContain("deletedAt");
    expect(block).not.toMatch(/\bverifiedName\s+String/);
    expect(block).not.toMatch(/\bverifiedNameKana\s+String/);
  });

  it("ships the eKYC evidence migration", () => {
    expect(
      existsSync(
        join(
          process.cwd(),
          "prisma/migrations/20260826123000_ekyc_verification_foundation/migration.sql"
        )
      )
    ).toBe(true);
  });
});
