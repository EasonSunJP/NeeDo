import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  maskEmail,
  parseAwsStagingArgs,
  parseAwsStagingBoundArgs,
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

function containsRawAwsOperatorCommand(contents) {
  const absoluteOrBare = String.raw`(?:aws|session-manager-plugin|(?:\/[^\/\s]+)*\/(?:aws|session-manager-plugin))`;
  const prompt = String.raw`(?:\$\s+)?`;
  const privilegePrefix = String.raw`(?:(?:sudo|exec)\s+)?`;
  const envExecutable = String.raw`(?:env|(?:\/[^\/\s]+)*\/env)`;
  const environmentPrefix = String.raw`(?:${envExecutable}\s+(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]+\s+)*)?`;
  const lookup = String.raw`(?:(?:command\s+-v|which)\s+${absoluteOrBare})`;
  return new RegExp(
    String.raw`^\s*${prompt}${privilegePrefix}${environmentPrefix}(?:${absoluteOrBare}|${lookup})(?:\s|$)`,
    "m"
  ).test(contents);
}

describe("AWS Staging configuration", () => {
  it("does not expose guarded live commands through mutable npm lifecycle hooks", async () => {
    const packageJson = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url)));
    for (const name of [
      "aws:staging:preflight",
      "aws:staging:deploy",
      "aws:staging:bootstrap-host",
      "aws:staging:verify"
    ]) {
      expect(packageJson.scripts[name]).toBeUndefined();
      expect(packageJson.scripts[`pre${name}`]).toBeUndefined();
      expect(packageJson.scripts[`post${name}`]).toBeUndefined();
    }
  });

  it("disables Git lazy-fetch helpers at every runtime provenance boundary", async () => {
    const sources = await Promise.all([
      "docs/aws-staging-environment-runbook.md",
      "scripts/aws-staging-launcher.mjs",
      "scripts/aws-staging-runtime-artifact.mjs",
      "scripts/aws-staging-template-artifact.mjs"
    ].map((relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8")));
    for (const source of sources) {
      expect(source).toContain("GIT_NO_LAZY_FETCH");
    }
  });

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

  it("documents approved runtime-closure provenance for every guarded command", async () => {
    const authoritativePaths = [
      "docs/aws-staging-environment-runbook.md",
      "docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md",
      "docs/superpowers/plans/2026-09-04-aws-staging-dual-region.md",
      "docs/superpowers/specs/2026-09-03-aws-staging-single-ec2-deployment-design.md",
      "docs/superpowers/specs/2026-09-04-aws-staging-dual-region-design.md"
    ];
    const documents = await Promise.all(authoritativePaths.map(async (documentPath) => ({
      documentPath,
      contents: await fs.readFile(new URL(`../${documentPath}`, import.meta.url), "utf8")
    })));

    for (const { documentPath, contents } of documents) {
      expect(contents, documentPath).toMatch(/runtime closure/i);
      expect(contents, documentPath).toMatch(/runtimeManifestSha256/);
      expect(contents, documentPath).toMatch(
        /does not (?:assert|claim)[\s\S]{0,80}(?:the )?entire(?:\s|>)+(?:repository|worktree)/i
      );
      expect(contents, documentPath).not.toMatch(/npm run aws:staging:/);
      expect(contents, documentPath).toMatch(/exact approved Git object.*private.*snapshot/is);
      expect(contents, documentPath).toMatch(/NODE_OPTIONS.*(?:unset|scrub|empty|removed)/i);
      expect(contents, `${documentPath} guarded command`).toMatch(
        /--source-revision\s+<approved-full-source-revision>/
      );
    }
    const runbook = documents.find(({ documentPath }) => (
      documentPath === "docs/aws-staging-environment-runbook.md"
    )).contents;
    expect(runbook).toMatch(/cat-file -t "\$revision"/);
    expect(runbook).toMatch(/rev-parse --verify[\s\\]*"\$\{revision\}\^\{object\}"/);
    expect(runbook).toMatch(/ls-tree --full-tree "\$revision"[\s\S]*scripts\/aws-staging-launcher\.mjs/);
    expect(runbook).toMatch(/"\$launcher_mode" == 100644[\s\S]*"\$launcher_type" == blob/);
    expect(runbook).toMatch(/cat-file blob "\$launcher_oid" > "\$launcher_path"/);
    expect(runbook).toMatch(/hash-object --no-filters/);
    expect(runbook).toMatch(/NEEDO_AWS_STAGING_TRUSTED_SOURCE_REVISION="\$revision"/);
  });

  it.each([
    ["partial launcher blob", "commit", "100644", 17, false, undefined],
    ["tag-object source revision", "tag", "100644", 0, false, undefined],
    ["executable launcher tree mode", "commit", "100755", 0, false, undefined],
    ["SHA-256 commit prefix", "commit", "100644", 0, false, `${"a".repeat(40)}${"c".repeat(24)}`],
    ["complete approved launcher blob", "commit", "100644", 0, true, undefined]
  ])("gates Node on a %s", async (
    _label,
    objectType,
    launcherMode,
    blobStatus,
    expectedToStart,
    resolvedRevisionOverride
  ) => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-launch-shell-"));
    const sentinel = path.join(temporaryRoot, "node-started");
    const fakeGitLog = path.join(temporaryRoot, "git-calls");
    const fakeGit = path.join(temporaryRoot, "git");
    const revision = "a".repeat(40);
    const resolvedRevision = resolvedRevisionOverride ?? revision;
    const launcherObject = "b".repeat(40);
    const sideEffectSource = `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(sentinel)},"started");`;
    const fakeGitSource = `#!/bin/zsh
/usr/bin/printf '%s\\n' "$*" >> ${JSON.stringify(fakeGitLog)}
case " $* " in
  *" rev-parse --verify "*) /usr/bin/printf '%s\\n' ${JSON.stringify(resolvedRevision)} ;;
  *" cat-file -t "*) /usr/bin/printf '%s\\n' ${JSON.stringify(objectType)} ;;
  *" ls-tree "*) /usr/bin/printf '%b\\n' ${JSON.stringify(
    `${launcherMode} blob ${launcherObject}\tscripts/aws-staging-launcher.mjs`
  )} ;;
  *" cat-file blob "*)
    /usr/bin/printf '%b' ${JSON.stringify(sideEffectSource)}
    exit ${blobStatus}
    ;;
  *" hash-object "*) /usr/bin/printf '%s\\n' ${JSON.stringify(launcherObject)} ;;
  *) exit 70 ;;
esac
`;
    try {
      await fs.writeFile(fakeGit, fakeGitSource, { mode: 0o700 });
      const runbook = await fs.readFile(
        new URL("../docs/aws-staging-environment-runbook.md", import.meta.url),
        "utf8"
      );
      const procedure = /needo_aws_staging\(\) \{[\s\S]*?^\}/m.exec(runbook)?.[0];
      expect(procedure).toBeTruthy();
      const injectedProcedure = procedure.split("/usr/bin/git").join(fakeGit);
      const result = spawnSync("/bin/zsh", ["-df", "-c", `${injectedProcedure}\nneedo_aws_staging preflight ${revision} ${process.execPath} --source-revision ${revision}`], {
        cwd: process.cwd(),
        encoding: "utf8"
      });
      if (expectedToStart) {
        const gitCalls = await fs.readFile(fakeGitLog, "utf8");
        expect(result.status, `${result.stderr}\n${gitCalls}`).toBe(0);
        await expect(fs.access(sentinel)).resolves.toBeUndefined();
      } else {
        await expect(fs.access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["relative import", () => 'import "./mutable-dependency.mjs";\n', false],
    ["multiline named re-export", (dependencyPath) => (
      `export {\n value\n}\nfrom ${JSON.stringify(pathToFileURL(dependencyPath).href)};\n`
    ), false],
    ["multiline star re-export", (dependencyPath) => (
      `export *\nfrom ${JSON.stringify(pathToFileURL(dependencyPath).href)};\n`
    ), false],
    ["same-line appended re-export", (dependencyPath) => (
      `export const safe = 1; export * from ${JSON.stringify(pathToFileURL(dependencyPath).href)};\n`
    ), false],
    ["NUL-obscured absolute import", (dependencyPath) => (
      `/*__NUL__*/ import ${JSON.stringify(pathToFileURL(dependencyPath).href)};\n`
    ), true]
  ])("rejects a pre-body %s from the materialized stdin launcher", async (
    _label,
    dependencySource,
    includesNul
  ) => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-launch-module-"));
    const sentinel = path.join(temporaryRoot, "mutable-dependency-ran");
    const mutableDependency = path.join(temporaryRoot, "mutable-dependency.mjs");
    const fakeGit = path.join(temporaryRoot, "git");
    const revision = "a".repeat(40);
    const launcherObject = "b".repeat(40);
    const launcherSource = `import fs from "node:fs";\n${dependencySource(mutableDependency)}`;
    const blobEmitter = includesNul
      ? launcherSource.split("__NUL__").map((part, index) => (
          `${index === 0 ? "" : "/usr/bin/printf '\\0'\n    "}/usr/bin/printf '%b' ${JSON.stringify(part)}`
        )).join("\n    ")
      : `/usr/bin/printf '%b' ${JSON.stringify(launcherSource)}`;
    const mutableSource = `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(sentinel)},"unsafe");export const value=1;`;
    const fakeGitSource = `#!/bin/zsh
case " $* " in
  *" rev-parse --verify "*) /usr/bin/printf '%s\\n' ${JSON.stringify(revision)} ;;
  *" cat-file -t "*) /usr/bin/printf '%s\\n' commit ;;
  *" ls-tree "*) /usr/bin/printf '%b\\n' ${JSON.stringify(
    `100644 blob ${launcherObject}\tscripts/aws-staging-launcher.mjs`
  )} ;;
  *" cat-file blob "*) ${blobEmitter} ;;
  *" hash-object "*) /usr/bin/printf '%s\\n' ${JSON.stringify(launcherObject)} ;;
  *) exit 70 ;;
esac
`;
    try {
      await fs.writeFile(fakeGit, fakeGitSource, { mode: 0o700 });
      await fs.writeFile(mutableDependency, mutableSource, { mode: 0o600 });
      const runbook = await fs.readFile(
        new URL("../docs/aws-staging-environment-runbook.md", import.meta.url),
        "utf8"
      );
      const procedure = /needo_aws_staging\(\) \{[\s\S]*?^\}/m.exec(runbook)?.[0];
      expect(procedure).toBeTruthy();
      const injectedProcedure = procedure.split("/usr/bin/git").join(fakeGit);
      const result = spawnSync("/bin/zsh", ["-df", "-c", `${injectedProcedure}\nneedo_aws_staging preflight ${revision} ${process.execPath} --source-revision ${revision}`], {
        cwd: temporaryRoot,
        encoding: "utf8"
      });
      expect(result.status).not.toBe(0);
      await expect(fs.access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("documents immutable template wiring for bootstrap and verification", async () => {
    const authoritativePaths = [
      "docs/aws-staging-environment-runbook.md",
      "docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md",
      "docs/superpowers/plans/2026-09-04-aws-staging-dual-region.md",
      "docs/superpowers/specs/2026-09-03-aws-staging-single-ec2-deployment-design.md",
      "docs/superpowers/specs/2026-09-04-aws-staging-dual-region-design.md"
    ];
    const requiredStatement = "Bootstrap and verify each capture the tracked template artifact "
      + "at the approved revision before credential resolution and pass that same object into "
      + "the real in-process preflight.";
    for (const documentPath of authoritativePaths) {
      const contents = await fs.readFile(new URL(`../${documentPath}`, import.meta.url), "utf8");
      expect(contents, documentPath).toContain(requiredStatement);
    }
  });

  it("documents exact canonical SSM evidence hash reconstruction", async () => {
    const authoritativePaths = [
      "docs/aws-staging-environment-runbook.md",
      "docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md",
      "docs/superpowers/plans/2026-09-04-aws-staging-dual-region.md",
      "docs/superpowers/specs/2026-09-03-aws-staging-single-ec2-deployment-design.md",
      "docs/superpowers/specs/2026-09-04-aws-staging-dual-region-design.md"
    ];
    const requiredStatement = "Acceptance reconstruction requires documentSha256 and "
      + "agentParameterSha256 to equal the canonical SHA-256 of the approved repository "
      + "constants; format-only values are rejected.";
    for (const documentPath of authoritativePaths) {
      const contents = await fs.readFile(new URL(`../${documentPath}`, import.meta.url), "utf8");
      expect(contents, documentPath).toContain(requiredStatement);
    }
  });

  it("documents the private copied-Node execution continuity boundary", async () => {
    const authoritativePaths = [
      "docs/aws-staging-environment-runbook.md",
      "docs/superpowers/plans/2026-09-03-aws-staging-environment-only.md",
      "docs/superpowers/plans/2026-09-04-aws-staging-dual-region.md",
      "docs/superpowers/specs/2026-09-03-aws-staging-single-ec2-deployment-design.md",
      "docs/superpowers/specs/2026-09-04-aws-staging-dual-region-design.md"
    ];
    const requiredStatement = "The guarded child executes only the read-only private Node.js "
      + "copy made from the already-open, stable, SHA-256-bound source handle; before the "
      + "sealed loader is registered, the runtime guard requires actual Node.js major 22 and "
      + "an exact executable identity and digest match.";
    for (const documentPath of authoritativePaths) {
      const contents = await fs.readFile(new URL(`../${documentPath}`, import.meta.url), "utf8");
      expect(contents, documentPath).toContain(requiredStatement);
    }
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

    expect(containsRawAwsOperatorCommand(combined)).toBe(false);
    expect(combined).toMatch(/dedicated hardened Session Manager microstep/i);
  });

  it.each([
    "/usr/local/bin/aws --version",
    "/opt/homebrew/bin/session-manager-plugin --version",
    "$ aws ssm start-session --target i-0123456789abcdef0",
    "env aws sts get-caller-identity",
    "sudo aws ssm start-session --target i-0123456789abcdef0",
    "/usr/bin/env AWS_PROFILE=p /usr/local/bin/aws --version",
    "command -v /usr/local/bin/aws",
    "which /opt/homebrew/bin/session-manager-plugin"
  ])("recognizes equivalent raw operator-command bypass: %s", (line) => {
    expect(containsRawAwsOperatorCommand(line)).toBe(true);
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

  it("requires an exact approved source revision for every guarded AWS command", () => {
    const parsed = parseAwsStagingBoundArgs([
      "--profile", "needo-staging-deployer",
      "--account-id", "123456789012",
      "--region", "ap-northeast-1",
      "--hostname", "staging.needo.life",
      "--alert-email", "ops@example.com",
      "--budget-amount", "20000",
      "--budget-unit", "JPY",
      "--source-revision", "b".repeat(40)
    ]);

    expect(parsed).toMatchObject({
      ...validInput,
      sourceRevision: "b".repeat(40)
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(() => parseAwsStagingBoundArgs([
      "--profile", "needo-staging-deployer",
      "--account-id", "123456789012",
      "--region", "ap-northeast-1",
      "--hostname", "staging.needo.life",
      "--alert-email", "ops@example.com",
      "--budget-amount", "20000",
      "--budget-unit", "JPY"
    ])).toThrow("--source-revision");
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
