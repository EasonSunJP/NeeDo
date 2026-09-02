import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("membership and ranking acceptance command", () => {
  it("runs the guarded rollback fixtures and the required evidence regressions", () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/check-membership-ranking-flow.ts"),
      "utf8"
    );
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const membershipIntegration = readFileSync(
      join(process.cwd(), "tests/membership-analytics.repository.integration.test.ts"),
      "utf8"
    );
    const rankingIntegration = readFileSync(
      join(process.cwd(), "tests/analytics-ranking.repository.integration.test.ts"),
      "utf8"
    );

    expect(packageJson.scripts["check:membership-ranking"])
      .toBe("tsx scripts/check-membership-ranking-flow.ts");
    for (const evidence of ["gift", "trial", "renewal", "readBaseline"]) {
      expect(membershipIntegration).toContain(evidence);
    }
    for (const evidence of ["fullyReversed", "createdAt", "result.list.map((item) => item.rank)", "readBaseline"]) {
      expect(rankingIntegration).toContain(evidence);
    }
    expect(source).toContain("membership-analytics.repository.integration.test.ts");
    expect(source).toContain("analytics-ranking.repository.integration.test.ts");
    expect(source).toContain("RUN_MEMBERSHIP_ANALYTICS_MYSQL_INTEGRATION");
    expect(source).toContain("RUN_ANALYTICS_RANKING_MYSQL_INTEGRATION");
    expect(source).toContain('database !== "needo_test"');
    expect(source).toContain("spawnSync");
    expect(source).toContain("...acceptanceSuites");
    expect(source).not.toContain("requiredAcceptanceCoverage");
    expect(source).not.toContain("shell: true");
  });
});
