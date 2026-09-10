import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json";

const read = (path: string): string => readFileSync(resolve(__dirname, "..", path), "utf8");

describe("Exchange selective claim lifecycle fixture checker safety", () => {
  it("requires an explicit guarded local environment and rejects production-looking targets", () => {
    const source = read("scripts/check-exchange-selective-claim-flow.ts");
    const safety = read("scripts/support/exchange-claim-flow-safety.ts");

    expect(packageJson.scripts["check:exchange-selective-claim-flow"]).toBe(
      "tsx scripts/check-exchange-selective-claim-flow.ts"
    );
    expect(source).toContain("requireSafeExchangeClaimFlowEnvironment(process.env.ENV_FILE");
    expect(safety).toContain("requires an explicit ENV_FILE");
    expect(safety).toMatch(/production|prod/u);
    expect(safety).toMatch(/localhost|127\.0\.0\.1/u);
  });

  it("uses a unique namespace, labels direct fixture setup, and deletes only captured ids", () => {
    const source = read("scripts/check-exchange-selective-claim-flow.ts");

    expect(source).toContain("randomUUID");
    expect(source).toContain("exchange-claim-flow-");
    expect(source).toContain('fixtureSetup: "direct-prisma-exact"');
    expect(source).toContain("captured");
    expect(source).toContain("where: { id: { in: captured.");
    expect(source).toContain("allowedAuditActions");
    expect(source).toContain("createdAt: { gte: fixtureStartedAt }");
    expect(source).toContain("withdrawal idempotent replay duplicated its audit");
    expect(source).not.toMatch(/console\.log\([^\n]*(?:password|token|DATABASE_URL)/iu);
    expect(source).not.toMatch(/deleteMany\(\s*\{\s*\}\s*\)/u);
  });
});
