import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeAffiliateAllianceFoundationEnvironment } from "../scripts/support/affiliate-alliance-foundation-safety";

describe("affiliate alliance foundation acceptance script", () => {
  const backendRoot = join(__dirname, "..");
  const packageJson = JSON.parse(
    readFileSync(join(backendRoot, "package.json"), "utf8")
  ) as { scripts: Record<string, string> };
  const source = readFileSync(
    join(backendRoot, "scripts/check-affiliate-alliance-foundation-flow.ts"),
    "utf8"
  );

  it("is explicitly configured and delegates to the tested environment guard", () => {
    expect(packageJson.scripts["check:affiliate-alliance-foundation-flow"]).toBe(
      "tsx scripts/check-affiliate-alliance-foundation-flow.ts"
    );
    expect(source).toContain("assertSafeAffiliateAllianceFoundationEnvironment");
  });

  it.each([
    ["missing ENV_FILE", { envFile: "", envFileExists: false, databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "requires ENV_FILE"],
    ["missing file", { envFile: "/tmp/not-there", envFileExists: false, databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "environment file was not found"],
    ["production NODE_ENV", { envFile: "/tmp/local.env", envFileExists: true, nodeEnv: " Production ", databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "rejects production and staging environments"],
    ["staging DEPLOY_ENV", { envFile: "/tmp/local.env", envFileExists: true, deployEnv: " STAGING ", databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "rejects production and staging environments"],
    ["non-MySQL URL", { envFile: "/tmp/local.env", envFileExists: true, databaseUrl: "postgresql://root@127.0.0.1/needo_dev" }, "only accepts MySQL"],
    ["remote host", { envFile: "/tmp/local.env", envFileExists: true, databaseUrl: "mysql://root@db.example.com/needo_dev" }, "only accepts a local MySQL host"],
    ["production database", { envFile: "/tmp/local.env", envFileExists: true, databaseUrl: "mysql://root@127.0.0.1/needo-production" }, "rejects production-looking database names"]
  ])("rejects %s", (_label, input, expectedMessage) => {
    expect(() => assertSafeAffiliateAllianceFoundationEnvironment(input)).toThrow(expectedMessage);
  });

  it("accepts an explicit local development MySQL database", () => {
    expect(
      assertSafeAffiliateAllianceFoundationEnvironment({
        envFile: " /tmp/local.env ",
        envFileExists: true,
        nodeEnv: "development",
        deployEnv: "local",
        databaseUrl: "mysql://root@localhost:3307/needo_dev"
      })
    ).toEqual({ databaseName: "needo_dev", envFile: "/tmp/local.env" });
  });

  it("proves the concurrent create contract and exact marker cleanup", () => {
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("non-activated account did not receive the stable 403");
    expect(source).toContain("exactly one concurrent alliance creation must succeed");
    expect(source).toContain("affiliate_alliance.created");
    expect(source).toContain("ALLIANCE");
    expect(source).toContain("eKYC or bank data was created");
    expect(source).toContain("marker cleanup left affiliate alliance foundation rows behind");
    expect(source).not.toContain("findUnique({ where: { email: markerEmail }");
  });
});
