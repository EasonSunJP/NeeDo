import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate service completion reward acceptance script", () => {
  it("is registered, local-only, marker-owned, and verifies settlement invariants", () => {
    const backendRoot = join(__dirname, "..");
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scriptPath = join(
      backendRoot,
      "scripts/check-affiliate-service-completion-reward-flow.ts"
    );

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:affiliate-service-completion-reward-flow"]).toBe(
      "tsx scripts/check-affiliate-service-completion-reward-flow.ts"
    );

    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("assertSafeLocalDatabase");
    expect(source).toContain("affiliate-service-completion-${Date.now()}");
    expect(source).toContain("reward was created before service completion");
    expect(source).toContain("affiliate_reward_settlement");
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("claim_completed_order_limit_reached");
    expect(source).toContain("customer_completed_order_limit_reached");
    expect(source).toContain("error.wallet.insufficient_frozen");
    expect(source).toContain("completion rollback did not preserve order state");
    expect(source).toContain("marker cleanup left reward settlement rows behind");
  });
});
