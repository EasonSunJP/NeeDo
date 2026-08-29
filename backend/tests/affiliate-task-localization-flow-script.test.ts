import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeAffiliateTaskLocalizationEnvironment } from "../scripts/check-affiliate-task-localization-flow";

describe("affiliate task localization real-database checker", () => {
  const backendRoot = join(__dirname, "..");
  const scriptPath = join(backendRoot, "scripts/check-affiliate-task-localization-flow.ts");
  const safeEnvironment = {
    envFile: "/tmp/needo-local.env",
    envFileExists: true,
    nodeEnv: "development",
    deployEnv: "local",
    databaseUrl: "mysql://needo:secret@127.0.0.1:3307/needo_dev"
  };

  it.each([
    ["production runtime", { ...safeEnvironment, nodeEnv: "production" }, "rejects production"],
    ["staging deployment", { ...safeEnvironment, deployEnv: "staging" }, "rejects production"],
    [
      "remote database",
      { ...safeEnvironment, databaseUrl: "mysql://needo:secret@db.example.com/needo_dev" },
      "only accepts a local MySQL host"
    ],
    [
      "production-looking database",
      { ...safeEnvironment, databaseUrl: "mysql://needo:secret@127.0.0.1/needo-prod" },
      "rejects production-looking database names"
    ],
    [
      "unapproved local database",
      { ...safeEnvironment, databaseUrl: "mysql://needo:secret@127.0.0.1/needo_feature" },
      "requires database needo_dev or needo_test"
    ]
  ])("rejects %s", (_label, input, message) => {
    expect(() => assertSafeAffiliateTaskLocalizationEnvironment(input)).toThrow(message);
  });

  it("returns a credential-free local target summary", () => {
    expect(assertSafeAffiliateTaskLocalizationEnvironment(safeEnvironment)).toEqual({
      databaseName: "needo_dev",
      maskedDatabaseTarget: "mysql://127.0.0.1:3307/needo_dev"
    });
  });

  it("registers one guarded local-only checker command", () => {
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:affiliate-task-localization-flow"]).toBe(
      "tsx scripts/check-affiliate-task-localization-flow.ts"
    );
  });

  it("covers five-copy, independent edit, one-language submission and exact cleanup", () => {
    const source = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : "";

    for (const evidence of [
      "assertSafeAffiliateTaskLocalizationEnvironment",
      "CONTENT_LOCALES",
      'sourceLocale: "ja"',
      "syncToAll: false",
      "syncToAll: true",
      "error.affiliate.task_content_required",
      "oneLanguageContentAccepted: true",
      "freezeAffiliateTaskBudget",
      "affiliate.task.translation_updated",
      "affiliateTaskTranslation.deleteMany",
      "cleanup residue verification"
    ]) {
      expect(source).toContain(evidence);
    }
    expect(source).toContain("try {");
    expect(source).toContain("finally {");
    expect(source).not.toMatch(/deleteMany\(\{\s*\}\)/u);
  });
});
