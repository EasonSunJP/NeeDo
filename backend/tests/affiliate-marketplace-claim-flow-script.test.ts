import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate marketplace claim acceptance script", () => {
  it("is registered and guards local data while checking the formal claim contract", () => {
    const backendRoot = join(__dirname, "..");
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scriptSource = readFileSync(
      join(backendRoot, "scripts/check-affiliate-marketplace-claim-flow.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:affiliate-marketplace-claim-flow"]).toBe(
      "tsx scripts/check-affiliate-marketplace-claim-flow.ts"
    );
    expect(scriptSource).toContain("assertSafeLocalDatabase");
    expect(scriptSource).toContain("affiliate.claim.created");
    expect(scriptSource).toContain("Promise.all");
    expect(scriptSource).toContain("wallet changed while claiming");
    expect(scriptSource).toContain("marker cleanup left rows behind");
  });
});
