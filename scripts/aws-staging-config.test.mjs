import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  maskEmail,
  parseAwsStagingArgs,
  parseAwsStagingDeployArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";

const validInput = {
  profile: "needo-staging-deployer",
  accountId: "123456789012",
  region: "ap-northeast-1",
  owner: "needo",
  hostname: "staging.needo.life",
  alertEmail: "ops@example.com",
  budgetAmount: "20000",
  budgetUnit: "JPY"
};

describe("AWS Staging configuration", () => {
  it("documents digest-bound immutable template approval without mutable file validation", async () => {
    const authoritativePaths = [
      "docs/aws-staging-environment-runbook.md",
      "docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md",
      "docs/superpowers/plans/2026-09-04-aws-staging-dual-region.md",
      "docs/superpowers/specs/2026-09-03-aws-staging-single-ec2-deployment-design.md",
      "docs/superpowers/specs/2026-09-04-aws-staging-dual-region-design.md"
    ];
    const documents = await Promise.all(authoritativePaths.map((documentPath) => (
      fs.readFile(new URL(`../${documentPath}`, import.meta.url), "utf8")
    )));
    const combined = documents.join("\n");

    expect(combined).not.toMatch(/validate-template[^\n]*file:\/\//i);
    expect(combined).toContain("--template-sha256 <approved-template-sha256>");
    expect(combined).toContain("--source-revision <approved-full-source-revision>");
    expect(combined).toMatch(/same immutable.*bytes.*validate-template.*create-stack/is);
  });

  it("forbids raw AWS and Session Manager commands in authoritative operator documents", async () => {
    const authoritativePaths = [
      "docs/aws-staging-environment-runbook.md",
      "docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md",
      "docs/superpowers/plans/2026-09-04-aws-staging-dual-region.md",
      "docs/superpowers/specs/2026-09-03-aws-staging-single-ec2-deployment-design.md",
      "docs/superpowers/specs/2026-09-04-aws-staging-dual-region-design.md"
    ];
    const documents = await Promise.all(authoritativePaths.map((documentPath) => (
      fs.readFile(new URL(`../${documentPath}`, import.meta.url), "utf8")
    )));
    const combined = documents.join("\n");

    expect(combined).not.toMatch(/^\s*(?:aws|session-manager-plugin)(?:\s|$)/m);
    expect(combined).not.toMatch(/^\s*(?:command -v|which)\s+(?:aws|session-manager-plugin)(?:\s|$)/m);
    expect(combined).toMatch(/dedicated hardened Session Manager microstep/i);
  });

  it("normalizes the approved environment without converting money", () => {
    expect(resolveAwsStagingConfig(validInput)).toEqual({
      alertEmail: "ops@example.com",
      budgetAmount: "20000",
      budgetUnit: "JPY",
      accountId: "123456789012",
      environment: "staging",
      hostname: "staging.needo.life",
      owner: "needo",
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      stackName: "needo-staging-infrastructure",
      templatePath: expect.stringMatching(
        /deploy\/aws-staging\/cloudformation\.yml$/
      )
    });
  });

  it.each([
    [{ ...validInput, accountId: "" }, "account ID"],
    [{ ...validInput, accountId: "123" }, "account ID"],
    [{ ...validInput, region: "us-east-1" }, "AWS Staging region"],
    [{ ...validInput, profile: "default" }, "profile"],
    [{ ...validInput, alertEmail: "not-an-email" }, "email"],
    [{ ...validInput, budgetAmount: "0" }, "budget amount"],
    [{ ...validInput, budgetAmount: "20,000" }, "budget amount"],
    [{ ...validInput, budgetUnit: "yen" }, "currency"],
    [{ ...validInput, hostname: "Staging.needo.life" }, "hostname"],
    [{ ...validInput, hostname: "staging.needo.life." }, "hostname"],
    [{ ...validInput, hostname: "*.needo.life" }, "hostname"],
    [{ ...validInput, hostname: "staging.127.0.0.1" }, "hostname"],
    [{ ...validInput, hostname: "localhost" }, "hostname"],
    [{ ...validInput, hostname: "staging.localhost" }, "hostname"],
    [{ ...validInput, hostname: "staging.needo" }, "hostname"],
    [{ ...validInput, hostname: "staging.-needo.life" }, "hostname"]
  ])("rejects unsafe input %#", (input, expected) => {
    expect(() => resolveAwsStagingConfig(input)).toThrow(expected);
  });

  it("requires each mutating argument explicitly", () => {
    expect(
      parseAwsStagingArgs([
        "--profile", "needo-staging-deployer",
        "--account-id", "123456789012",
        "--region", "ap-northeast-1",
        "--hostname", "staging.needo.life",
        "--alert-email", "ops@example.com",
        "--budget-amount", "20000",
        "--budget-unit", "JPY"
      ])
    ).toMatchObject(validInput);
    expect(() => parseAwsStagingArgs([])).toThrow("--account-id");
    expect(() => parseAwsStagingArgs([
      "--profile", "needo-staging-deployer",
      "--account-id", "123456789012",
      "--region", "ap-northeast-1",
      "--alert-email", "ops@example.com",
      "--budget-amount", "20000",
      "--budget-unit", "JPY"
    ])).toThrow("--hostname");
  });

  it("requires an exact approved template digest and source revision for deployment", () => {
    const parsed = parseAwsStagingDeployArgs([
      "--profile", "needo-staging-deployer",
      "--account-id", "123456789012",
      "--region", "ap-northeast-1",
      "--hostname", "staging.needo.life",
      "--alert-email", "ops@example.com",
      "--budget-amount", "20000",
      "--budget-unit", "JPY",
      "--template-sha256", "a".repeat(64),
      "--source-revision", "b".repeat(40)
    ]);

    expect(parsed).toMatchObject({
      ...validInput,
      templateSha256: "a".repeat(64),
      sourceRevision: "b".repeat(40)
    });
    expect(() => parseAwsStagingDeployArgs([
      "--template-sha256", "a".repeat(64)
    ])).toThrow(/source-revision|account-id/i);
  });

  it.each([
    ["--template-sha256", "A".repeat(64), /SHA-256/i],
    ["--template-sha256", "a".repeat(63), /SHA-256/i],
    ["--source-revision", "B".repeat(40), /revision/i],
    ["--source-revision", "b".repeat(39), /revision/i]
  ])("rejects malformed deployment approval %s", (flag, value, expected) => {
    const argv = [
      "--profile", "needo-staging-deployer",
      "--account-id", "123456789012",
      "--region", "ap-northeast-1",
      "--hostname", "staging.needo.life",
      "--alert-email", "ops@example.com",
      "--budget-amount", "20000",
      "--budget-unit", "JPY",
      "--template-sha256", "a".repeat(64),
      "--source-revision", "b".repeat(40)
    ];
    const index = argv.indexOf(flag);
    argv[index + 1] = value;

    expect(() => parseAwsStagingDeployArgs(argv)).toThrow(expected);
  });

  it("accepts the approved Sydney personal-test region", () => {
    expect(resolveAwsStagingConfig({
      ...validInput,
      region: "ap-southeast-2"
    }).region).toBe("ap-southeast-2");
  });

  it.each([
    "staging.example.com",
    "staging.needo.jp",
    "staging.api.needo.life"
  ])("rejects an otherwise valid but unapproved hostname %s", (hostname) => {
    expect(() => resolveAwsStagingConfig({ ...validInput, hostname }))
      .toThrow("staging.needo.life");
  });

  it("preserves the alert email local part and canonicalizes only its domain", () => {
    expect(resolveAwsStagingConfig({
      ...validInput,
      alertEmail: "Ops+Staging@EXAMPLE.COM"
    }).alertEmail).toBe("Ops+Staging@example.com");
  });

  it.each([" ops@example.com", "ops@example.com "])(
    "rejects surrounding whitespace in the exact alert email input %j",
    (alertEmail) => expect(() => resolveAwsStagingConfig({ ...validInput, alertEmail }))
      .toThrow("email")
  );

  it("requires the deployment region explicitly", () => {
    expect(() => parseAwsStagingArgs([
      "--profile", "needo-staging-deployer",
      "--account-id", "123456789012",
      "--hostname", "staging.needo.life",
      "--alert-email", "ops@example.com",
      "--budget-amount", "20000",
      "--budget-unit", "JPY"
    ])).toThrow("--region");
  });

  it.each(["us-east-1", "AP-SOUTHEAST-2", " ap-southeast-2", "ap-southeast-2 "])(
    "rejects an unapproved or non-canonical region %s",
    (region) => expect(() => resolveAwsStagingConfig({ ...validInput, region }))
      .toThrow("AWS Staging region")
  );

  it("rejects unknown flags", () => {
    expect(() => parseAwsStagingArgs(["--unknown", "value"])).toThrow(
      "Unknown AWS Staging flag"
    );
  });

  it("rejects duplicate flags", () => {
    expect(() => parseAwsStagingArgs([
      "--profile", "needo-staging-deployer",
      "--profile", "another-profile"
    ])).toThrow("Duplicate AWS Staging flag: --profile");
  });

  it("rejects duplicate hostname flags", () => {
    expect(() => parseAwsStagingArgs([
      "--hostname", "staging.needo.life",
      "--hostname", "staging.example.com"
    ])).toThrow("Duplicate AWS Staging flag: --hostname");
  });

  it("rejects a required flag without a value", () => {
    expect(() => parseAwsStagingArgs(["--account-id"])).toThrow(
      "--account-id requires a value"
    );
  });

  it("returns a frozen configuration", () => {
    expect(Object.isFrozen(resolveAwsStagingConfig(validInput))).toBe(true);
  });

  it("masks alert addresses in evidence", () => {
    expect(maskEmail("operations@example.com")).toBe("o***@example.com");
  });
});
