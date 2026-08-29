import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json";

const read = (path: string): string => readFileSync(resolve(__dirname, "..", path), "utf8");

describe("formal Exchange simulation seed safety", () => {
  it("exposes explicit seed and independent checker commands", () => {
    expect(packageJson.scripts["seed:formal-exchange-test"]).toBe(
      "tsx scripts/seed-formal-exchange-test.ts"
    );
    expect(packageJson.scripts["check:formal-exchange-test"]).toBe(
      "tsx scripts/check-formal-exchange-test.ts"
    );
  });

  it("discovers existing actors and never provisions users or identities", () => {
    const source = read("src/simulation/exchange-simulation-seed.ts");
    expect(source).toContain("discoverExchangeSimulationActors");
    expect(source).toContain("userIdentity.findMany");
    expect(source).not.toMatch(/user\.(?:create|upsert)\s*\(/);
    expect(source).not.toMatch(/userIdentity\.(?:create|upsert)\s*\(/);
  });

  it("keeps the checker independent from the plan generator and rejects legacy namespaces", () => {
    const checker = read("src/simulation/exchange-simulation-checker.ts");
    expect(checker).not.toContain("exchange-simulation-plan");
    expect(checker).toContain("LEGACY_EXCHANGE_SIMULATION_NAMESPACES");
    expect(checker).toContain("publicIdentifier");
    expect(checker).toContain("comments");
    expect(checker).toContain("likes");
    expect(checker).toContain("shares");
  });
});
