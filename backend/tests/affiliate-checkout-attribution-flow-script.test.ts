import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate checkout attribution acceptance script", () => {
  it("is registered, guarded, marker-owned, and checks the formal transaction contract", () => {
    const backendRoot = join(__dirname, "..");
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scriptSource = readFileSync(
      join(backendRoot, "scripts/check-affiliate-checkout-attribution-flow.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:affiliate-checkout-attribution-flow"]).toBe(
      "tsx scripts/check-affiliate-checkout-attribution-flow.ts"
    );
    expect(scriptSource).toContain("assertSafeLocalDatabase");
    expect(scriptSource).toContain("affiliate-checkout-attribution-${Date.now()}");
    expect(scriptSource).toContain("FIXED_JPY");
    expect(scriptSource).toContain("PERCENT");
    expect(scriptSource).toContain("affiliatePublicToken");
    expect(scriptSource).toContain("affiliateCode");
    expect(scriptSource).toContain("Promise.allSettled");
    expect(scriptSource).toContain("invalidateCancelledBooking");
    expect(scriptSource).toContain("commissionFrozenNdp: input.totalBudgetNdp");
    expect(scriptSource).toContain("platformFeeFrozenNdp: 0");
    expect(scriptSource).toContain("wallet balances changed during checkout attribution");
    expect(scriptSource).toContain("reward was created before service completion");
    expect(scriptSource).toContain("audit evidence leaked a signed token");
    expect(scriptSource).toContain("marker cleanup left checkout rows behind");
  });
});
