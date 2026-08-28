import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertCapturedAffiliateAllianceInvitationCleanupIds,
  assertSafeAffiliateAllianceInvitationEnvironment
} from "../scripts/support/affiliate-alliance-invitation-safety";

describe("affiliate alliance invitation real-database checker", () => {
  const backendRoot = join(__dirname, "..");
  const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const source = readFileSync(
    join(backendRoot, "scripts/check-affiliate-alliance-invitation-flow.ts"),
    "utf8"
  );

  it.each([
    ["missing ENV_FILE", { envFile: "", envFileExists: false, databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "requires ENV_FILE"],
    ["missing file", { envFile: "/tmp/missing.env", envFileExists: false, databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "environment file was not found"],
    ["production runtime", { envFile: "/tmp/local.env", envFileExists: true, nodeEnv: "PRODUCTION", databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "rejects production and staging"],
    ["staging deployment", { envFile: "/tmp/local.env", envFileExists: true, deployEnv: "staging", databaseUrl: "mysql://root@127.0.0.1:3307/needo_dev" }, "rejects production and staging"],
    ["remote MySQL", { envFile: "/tmp/local.env", envFileExists: true, databaseUrl: "mysql://root@db.example.com/needo_dev" }, "only accepts a local MySQL host"],
    ["production database", { envFile: "/tmp/local.env", envFileExists: true, databaseUrl: "mysql://root@127.0.0.1/needo_prod" }, "rejects production-looking database names"]
  ])("rejects %s", (_label, input, message) => {
    expect(() => assertSafeAffiliateAllianceInvitationEnvironment(input)).toThrow(message);
  });

  it("returns an explicit credential-free database target summary", () => {
    expect(
      assertSafeAffiliateAllianceInvitationEnvironment({
        envFile: " /tmp/local.env ",
        envFileExists: true,
        nodeEnv: "development",
        deployEnv: "local",
        databaseUrl: "mysql://root:secret@localhost:3307/needo_dev"
      })
    ).toEqual({
      databaseName: "needo_dev",
      envFile: "/tmp/local.env",
      maskedDatabaseTarget: "mysql://localhost:3307/needo_dev"
    });
  });

  it("allows exact cleanup to start after only the first marker-owned user is captured", () => {
    expect(() =>
      assertCapturedAffiliateAllianceInvitationCleanupIds({
        allianceIds: [],
        invitationIds: [],
        userIds: [2]
      })
    ).not.toThrow();
  });

  it("still refuses cleanup without a captured marker-owned user", () => {
    expect(() =>
      assertCapturedAffiliateAllianceInvitationCleanupIds({
        allianceIds: [],
        invitationIds: [],
        userIds: []
      })
    ).toThrow("cleanup requires captured user ids");
  });

  it("declares the guarded command and all nine durable assertions", () => {
    expect(packageJson.scripts["check:affiliate-alliance-invitation-flow"]).toBe(
      "tsx scripts/check-affiliate-alliance-invitation-flow.ts"
    );
    for (const evidence of [
      "ineligible candidates were excluded",
      "partner and subordinate invitations were persisted",
      "duplicate pending invitation was rejected",
      "rejection created no member",
      "72-hour boundary expired before acceptance",
      "least-privilege member and audit were persisted",
      "concurrent cross-alliance acceptance created one membership",
      "fresh repository reloaded durable invitation state",
      "marker cleanup left affiliate alliance invitation rows behind"
    ]) {
      expect(source).toContain(evidence);
    }
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain('message === "error.affiliate_alliance.already_joined"');
    expect(source).toContain("statusCode === 409");
    expect(source).toContain(
      "persistedExpiryTimes.expiresAt.getTime() - persistedExpiryTimes.createdAt.getTime() === 259_200_000"
    );
    expect(source).toContain("finally");
  });
});
