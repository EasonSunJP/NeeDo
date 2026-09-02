import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("booking expiry rollback checker contract", () => {
  const checkerPath = resolve(__dirname, "../scripts/check-booking-expiry-rollback.ts");

  it("provides a guarded independent-connection rollback checker", () => {
    expect(existsSync(checkerPath)).toBe(true);
    const source = readFileSync(checkerPath, "utf8");
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, "../package.json"), "utf8")
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["check:booking-expiry-rollback"]).toBe(
      "tsx scripts/check-booking-expiry-rollback.ts"
    );
    expect(source).toContain("loadAndValidateFormalEnvironment");
    expect(source).toContain("createPrismaClient");
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("SHOW FULL PROCESSLIST");
    expect(source).toContain("BookingRepository");
    expect(source).toContain("targetStartsAt.getTime() + 250");
    expect(source).toContain("affiliateAttribution");
    expect(source).toContain("PASS booking expiry replacement rolled back without residue");
  });
});
