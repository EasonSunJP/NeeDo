import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeMerchantAffiliateTaskWorkspaceEnvironment } from "../scripts/check-merchant-affiliate-task-workspace";

describe("merchant Affiliate task workspace formal-data checker", () => {
  const backendRoot = join(__dirname, "..");
  const scriptPath = join(backendRoot, "scripts/check-merchant-affiliate-task-workspace.ts");
  const safeEnvironment = {
    envFile: "/tmp/needo-local.env",
    envFileExists: true,
    nodeEnv: "development",
    deployEnv: "local",
    databaseUrl: "mysql://needo:secret@127.0.0.1:3307/needo_dev"
  };

  it.each([
    ["production runtime", { ...safeEnvironment, nodeEnv: "production" }, "rejects production and staging"],
    ["staging deployment", { ...safeEnvironment, deployEnv: "staging" }, "rejects production and staging"],
    ["remote database", { ...safeEnvironment, databaseUrl: "mysql://needo:secret@db.example.com/needo_dev" }, "only accepts a local MySQL host"],
    ["production-looking database", { ...safeEnvironment, databaseUrl: "mysql://needo:secret@127.0.0.1/needo-production" }, "rejects production-looking database names"],
    ["unapproved database", { ...safeEnvironment, databaseUrl: "mysql://needo:secret@127.0.0.1/needo_feature" }, "requires database needo_dev or needo_test"]
  ])("rejects %s", (_label, input, message) => {
    expect(() => assertSafeMerchantAffiliateTaskWorkspaceEnvironment(input)).toThrow(message);
  });

  it("returns a credential-free local target", () => {
    expect(assertSafeMerchantAffiliateTaskWorkspaceEnvironment(safeEnvironment)).toEqual({
      databaseName: "needo_dev",
      maskedDatabaseTarget: "mysql://127.0.0.1:3307/needo_dev"
    });
  });

  it("registers the guarded checker and its required acceptance evidence", () => {
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const source = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : "";

    expect(packageJson.scripts["check:merchant-affiliate-task-workspace"]).toBe(
      "tsx scripts/check-merchant-affiliate-task-workspace.ts"
    );
    for (const evidence of [
      "publisher list pagination",
      "shop public identifier",
      "merchant task display projection",
      "fee preview has zero finance mutation",
      "single-shop exact freeze",
      "multi-shop exact freeze",
      "rate mismatch has zero finance mutation",
      "insufficient balance has zero finance mutation",
      "duplicate submit freezes once",
      "cleanup residue verification"
    ]) {
      expect(source).toContain(evidence);
    }
    expect(source).toContain("try {");
    expect(source).toContain("finally {");
    expect(source).toContain("deleteFormalTestUserFoundations");
    expect(source).not.toMatch(/deleteMany\(\{\s*\}\)/u);
  });
});
