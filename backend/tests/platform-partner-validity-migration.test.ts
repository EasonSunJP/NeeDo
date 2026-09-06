import fs from "fs";
import path from "path";
import { platformPartnerProfileBodySchema } from "../src/validators/platform-partner.validator";

describe("platform partner validity ranges", () => {
  it("accepts permanent and dated ranges but rejects reversed dates", () => {
    expect(
      platformPartnerProfileBodySchema.parse({
        partnerType: "agent",
        startsAt: "2026-09-06T00:00:00+09:00",
        endsAt: null,
        permanent: true,
        reason: "Signed agency contract"
      })
    ).toMatchObject({ permanent: true, endsAt: null });

    expect(() =>
      platformPartnerProfileBodySchema.parse({
        partnerType: "agent",
        startsAt: "2026-10-01T00:00:00+09:00",
        endsAt: "2026-09-30T00:00:00+09:00",
        permanent: false,
        reason: "Invalid range"
      })
    ).toThrow();
  });

  it("adds an end date and removes the single-active-row generated key", () => {
    const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
    const migrationPath = path.resolve(
      __dirname,
      "../prisma/migrations/20260906120000_platform_partner_validity_ranges/migration.sql"
    );
    const migration = fs.existsSync(migrationPath)
      ? fs.readFileSync(migrationPath, "utf8")
      : "";

    expect(schema).toContain("endsAt");
    expect(schema).not.toContain("activePartnerKey");
    expect(migration).toContain("ADD COLUMN `ends_at`");
    expect(migration).toContain("DROP INDEX `platform_partner_profiles_active_partner_key`");
    expect(migration).toContain("DROP COLUMN `active_partner_key`");
  });
});
