import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createAwsStagingPreflightSummary,
  runAwsStagingPreflight as runAwsStagingPreflightImpl
} from "./aws-staging-preflight-lib.mjs";
import { main as runAwsStagingPreflightCliMain } from "./aws-staging-preflight.mjs";

const config = Object.freeze({
  accountId: "123456789012",
  profile: "needo-staging-deployer",
  region: "ap-northeast-1",
  hostname: "staging.needo.life",
  stackName: "needo-staging-infrastructure",
  templatePath: "/repo/deploy/aws-staging/cloudformation.yml"
});

const callerArn = "arn:aws:sts::123456789012:assumed-role/NeedoDeployer/session";
const absentStackError = new Error(
  "AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"
);
const templateBody = "AWSTemplateFormatVersion: \"2010-09-09\"\n";
const templateSha256 = "c537cafbffa675a74a1711055c037be2e02db34a6d82654008013fa5c28f6604";
const templateRevision = "0123456789abcdef0123456789abcdef01234567";
const runtimeManifestSha256 = "d".repeat(64);
const templateArtifact = Object.freeze({
  body: templateBody,
  templateSha256,
  sourceRevision: templateRevision,
  assertCurrentState: vi.fn(async () => undefined)
});
const defaultRuntimeArtifact = Object.freeze({
  runtimeSourceRevision: templateRevision,
  runtimeManifestSha256,
  runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
  assertCurrentState: vi.fn(async () => undefined)
});

function runAwsStagingPreflight(input) {
  return runAwsStagingPreflightImpl({
    runtimeArtifact: defaultRuntimeArtifact,
    templateArtifact,
    ...input
  });
}

function configureList({
  accessType = "login",
  secretType = accessType,
  profile = config.profile
} = {}) {
  return [
    "      Name                    Value             Type    Location",
    "      ----                    -----             ----    --------",
    `   profile                ${profile}           manual    --profile`,
    `access_key     ****************ABCD              ${accessType}`,
    `secret_key     ****************EFGH              ${secretType}`,
    "    region           ap-northeast-1      config-file    ~/.aws/config"
  ].join("\n");
}

function successfulAws({
  configureOutput = configureList(),
  identity = { Account: config.accountId, Arn: callerArn },
  parameterResult = { Parameter: { Value: "ami-0123" } },
  imageResult = {
    Images: [{
      ImageId: "ami-0123",
      Architecture: "arm64",
      State: "available",
      OwnerId: "137112412989"
    }]
  },
  validationResult = { Parameters: [] },
  stack = absentStackError,
  trace = []
} = {}) {
  const jsonResults = [identity, parameterResult, imageResult, validationResult, stack];
  return {
    text: vi.fn(async (args) => {
      trace.push(`aws.text:${args.join(" ")}`);
      return configureOutput;
    }),
    json: vi.fn(async (args) => {
      trace.push(`aws.json:${args[0]} ${args[1]}`);
      const result = jsonResults.shift();
      if (result instanceof Error) throw result;
      return result;
    })
  };
}

describe("AWS Staging preflight", () => {
  it("re-attests runtime bytes before the first AWS preflight operation", async () => {
    const aws = successfulAws();
    const driftedRuntime = Object.freeze({
      ...defaultRuntimeArtifact,
      assertCurrentState: vi.fn(async () => {
        throw new Error("AWS Staging runtime bytes changed after approval");
      })
    });

    await expect(runAwsStagingPreflight({
      aws,
      config,
      runtimeArtifact: driftedRuntime
    })).rejects.toThrow(/runtime bytes changed/i);
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
  });

  async function createRuntimeFixture({
    headRevision = "a".repeat(40),
    approvedRevision = headRevision,
    status = "",
    indexedOverrides = new Map()
  } = {}) {
    const {
      AWS_STAGING_RUNTIME_FILES,
      captureAwsStagingRuntimeArtifact
    } = await import("./aws-staging-runtime-artifact.mjs");
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-runtime-artifact-"));
    const committed = new Map(AWS_STAGING_RUNTIME_FILES.map((relativePath) => [
      relativePath,
      Buffer.from(`approved runtime bytes for ${relativePath}\n`, "utf8")
    ]));
    committed.set("package.json", Buffer.from(JSON.stringify({
      scripts: {
        "aws:staging:bootstrap-host": "node scripts/aws-staging-bootstrap-host.mjs",
        "aws:staging:deploy": "node scripts/aws-staging-deploy.mjs",
        "aws:staging:preflight": "node scripts/aws-staging-preflight.mjs",
        "aws:staging:verify": "node scripts/aws-staging-verify.mjs"
      }
    }), "utf8"));
    for (const [relativePath, bytes] of committed) {
      const absolutePath = path.join(temporaryRoot, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, bytes, { mode: 0o600 });
    }
    const runGit = vi.fn(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return `${temporaryRoot}\n`;
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD^{commit}") return `${headRevision}\n`;
      if (args[0] === "status") return status;
      if (args[0] === "ls-tree") {
        const relativePath = args.at(-1);
        return `100644 blob ${"1".repeat(40)}\t${relativePath}\n`;
      }
      if (args[0] === "ls-files") {
        const relativePath = args.at(-1);
        return `100644 ${"1".repeat(40)} 0\t${relativePath}\n`;
      }
      if (args[0] === "show") {
        const selector = args[1];
        const relativePath = selector.startsWith(":")
          ? selector.slice(1)
          : selector.slice(selector.indexOf(":") + 1);
        return selector.startsWith(":") && indexedOverrides.has(relativePath)
          ? indexedOverrides.get(relativePath)
          : committed.get(relativePath);
      }
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });
    const entrypointPath = path.join(temporaryRoot, "scripts/aws-staging-preflight.mjs");
    const capture = () => captureAwsStagingRuntimeArtifact({
      argv: ["--source-revision", approvedRevision],
      entrypointPath,
      repositoryRoot: temporaryRoot,
      runGit
    });
    return { capture, committed, entrypointPath, runGit, temporaryRoot };
  }

  it("captures the exact clean runtime closure and records one stable manifest digest", async () => {
    const fixture = await createRuntimeFixture();
    try {
      const artifact = await fixture.capture();
      expect(artifact).toMatchObject({
        runtimeSourceRevision: "a".repeat(40),
        runtimeManifestSha256: expect.stringMatching(/^[0-9a-f]{64}$/)
      });
      expect(Object.isFrozen(artifact)).toBe(true);
      await expect(artifact.assertCurrentState()).resolves.toBeUndefined();
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["unstaged runtime drift", " M scripts/aws-staging-cli.mjs\n", new Map(), /clean|dirty|drift/i],
    ["untracked runtime replacement", "?? scripts/aws-staging-preflight.mjs\n", new Map(), /clean|dirty|drift/i],
    [
      "staged runtime drift",
      "",
      new Map([["scripts/aws-staging-cli.mjs", Buffer.from("staged replacement\n")]]),
      /index|approved revision/i
    ]
  ])("rejects %s before a credential adapter can be created", async (_label, status, indexedOverrides, expected) => {
    const fixture = await createRuntimeFixture({ status, indexedOverrides });
    try {
      await expect(fixture.capture()).rejects.toThrow(expected);
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects an approved runtime revision mismatch before any AWS call", async () => {
    const fixture = await createRuntimeFixture({ approvedRevision: "b".repeat(40) });
    const createAws = vi.fn();
    try {
      await expect(runAwsStagingPreflightCliMain([
        "--source-revision", "b".repeat(40)
      ], {
        captureRuntimeArtifactImpl: fixture.capture,
        createAwsCliImpl: createAws
      })).rejects.toThrow(/revision/i);
      expect(createAws).not.toHaveBeenCalled();
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("detects same-byte runtime file identity replacement after capture", async () => {
    const fixture = await createRuntimeFixture();
    try {
      const artifact = await fixture.capture();
      const runtimePath = path.join(fixture.temporaryRoot, "scripts/aws-staging-cli.mjs");
      const displacedPath = `${runtimePath}.old`;
      await fs.rename(runtimePath, displacedPath);
      await fs.writeFile(runtimePath, fixture.committed.get("scripts/aws-staging-cli.mjs"), {
        mode: 0o600
      });
      await expect(artifact.assertCurrentState()).rejects.toThrow(/identity|changed/i);
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("keeps every production relative import inside the explicit runtime allowlist", async () => {
    const { AWS_STAGING_RUNTIME_FILES } = await import("./aws-staging-runtime-artifact.mjs");
    const allowlist = new Set(AWS_STAGING_RUNTIME_FILES);
    for (const relativePath of AWS_STAGING_RUNTIME_FILES.filter((item) => item.endsWith(".mjs"))) {
      const source = await fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
      for (const match of source.matchAll(/(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["'](\.\.?\/[^"']+)["']/g)) {
        const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(relativePath), match[1]));
        expect(allowlist.has(dependency), `${relativePath} imports unbound ${dependency}`).toBe(true);
      }
      expect(source).not.toMatch(/\bimport\s*\(/);
    }
  });

  it("captures the template artifact before credentials and reports its action-time identity", async () => {
    const trace = [];
    const aws = { dispose: vi.fn(async () => trace.push("dispose")) };
    const runtimeArtifact = Object.freeze({
      runtimeSourceRevision: templateRevision,
      runtimeManifestSha256,
      runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
      assertCurrentState: vi.fn(async () => trace.push("runtime:assert"))
    });
    const artifact = Object.freeze({
      body: templateBody,
      templateSha256,
      sourceRevision: templateRevision,
      runtimeSourceRevision: templateRevision,
      runtimeManifestSha256,
      runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
      assertCurrentState: vi.fn(async () => undefined)
    });
    const result = await runAwsStagingPreflightCliMain(["approved"], {
      captureRuntimeArtifactImpl: vi.fn(async () => {
        trace.push("runtime:capture");
        return runtimeArtifact;
      }),
      parseAwsStagingBoundArgsImpl: vi.fn(() => ({ sourceRevision: templateRevision })),
      resolveAwsStagingConfigImpl: vi.fn(() => config),
      captureTemplateArtifactImpl: vi.fn(async () => {
        trace.push("template:capture");
        return artifact;
      }),
      createAwsCliImpl: vi.fn(async (input) => {
        trace.push("credentials");
        expect(input.assertRuntimeCurrent).toBe(runtimeArtifact.assertCurrentState);
        return aws;
      }),
      runAwsStagingPreflightImpl: vi.fn(async (input) => {
        trace.push("preflight");
        expect(input).toEqual({
          aws,
          config,
          runtimeArtifact,
          templateArtifact: artifact
        });
        return {
          accountId: config.accountId,
          callerKind: "assumed-role",
          region: config.region,
          hostname: config.hostname,
          amiArchitecture: "arm64",
          templateSha256,
          sourceRevision: templateRevision,
          runtimeSourceRevision: templateRevision,
          runtimeManifestSha256,
          runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
          stackState: "ABSENT",
          dnsA: []
        };
      })
    });

    expect(trace).toEqual([
      "runtime:capture",
      "template:capture",
      "runtime:assert",
      "credentials",
      "preflight",
      "dispose"
    ]);
    expect(result).toMatchObject({
      templateSha256,
      sourceRevision: templateRevision,
      runtimeSourceRevision: templateRevision,
      runtimeManifestSha256
    });
  });

  it("captures only the explicitly approved clean tracked template artifact", async () => {
    const { captureAwsStagingTemplateArtifact } = await import(
      "./aws-staging-template-artifact.mjs"
    );
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-template-artifact-"));
    const templatePath = path.join(temporaryRoot, "deploy/aws-staging/cloudformation.yml");
    const revision = "a".repeat(40);
    const body = "AWSTemplateFormatVersion: \"2010-09-09\"\n";
    const digest = "c537cafbffa675a74a1711055c037be2e02db34a6d82654008013fa5c28f6604";
    const runGit = vi.fn(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return `${temporaryRoot}\n`;
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD^{commit}") return `${revision}\n`;
      if (args[0] === "status") return "";
      if (args[0] === "show") return Buffer.from(body, "utf8");
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });

    try {
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.writeFile(templatePath, body, { encoding: "utf8", mode: 0o600 });
      const artifact = await captureAwsStagingTemplateArtifact({
        templatePath,
        repositoryRoot: temporaryRoot,
        approvedRevision: revision,
        approvedSha256: digest,
        runGit
      });

      expect(artifact).toMatchObject({
        body,
        sourceRevision: revision,
        templateSha256: digest
      });
      expect(Object.isFrozen(artifact)).toBe(true);
      await expect(artifact.assertCurrentState()).resolves.toBeUndefined();
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a dirty tracked template before any AWS credential resolver is needed", async () => {
    const { captureAwsStagingTemplateArtifact } = await import(
      "./aws-staging-template-artifact.mjs"
    );
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-template-dirty-"));
    const templatePath = path.join(temporaryRoot, "deploy/aws-staging/cloudformation.yml");
    const revision = "a".repeat(40);
    const body = "AWSTemplateFormatVersion: \"2010-09-09\"\n";
    const runGit = vi.fn(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return `${temporaryRoot}\n`;
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD^{commit}") return `${revision}\n`;
      if (args[0] === "status") return " M deploy/aws-staging/cloudformation.yml\n";
      if (args[0] === "show") return Buffer.from(body, "utf8");
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });

    try {
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.writeFile(templatePath, body, { encoding: "utf8", mode: 0o600 });
      await expect(captureAwsStagingTemplateArtifact({
        templatePath,
        repositoryRoot: temporaryRoot,
        approvedRevision: revision,
        approvedSha256: templateSha256,
        runGit
      })).rejects.toThrow(/clean|dirty/i);
      expect(runGit.mock.calls.some(([args]) => args[0] === "show")).toBe(false);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("detects a same-byte template path replacement after artifact capture", async () => {
    const { captureAwsStagingTemplateArtifact } = await import(
      "./aws-staging-template-artifact.mjs"
    );
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-template-swap-"));
    const templatePath = path.join(temporaryRoot, "deploy/aws-staging/cloudformation.yml");
    const displacedPath = `${templatePath}.old`;
    const revision = "a".repeat(40);
    const body = "AWSTemplateFormatVersion: \"2010-09-09\"\n";
    const runGit = vi.fn(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return `${temporaryRoot}\n`;
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD^{commit}") return `${revision}\n`;
      if (args[0] === "status") return "";
      if (args[0] === "show") return Buffer.from(body, "utf8");
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });

    try {
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.writeFile(templatePath, body, { encoding: "utf8", mode: 0o600 });
      const artifact = await captureAwsStagingTemplateArtifact({
        templatePath,
        repositoryRoot: temporaryRoot,
        approvedRevision: revision,
        approvedSha256: templateSha256,
        runGit
      });
      await fs.rename(templatePath, displacedPath);
      await fs.writeFile(templatePath, body, { encoding: "utf8", mode: 0o600 });

      await expect(artifact.assertCurrentState()).rejects.toThrow(/identity changed/i);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["UTF-8 BOM", Buffer.from([0xef, 0xbb, 0xbf, 0x41]), 0o600, /UTF-8 byte|BOM/i],
    ["NUL byte", Buffer.from([0x41, 0x00, 0x42]), 0o600, /NUL/i],
    ["group-writable mode", Buffer.from("A", "utf8"), 0o660, /writable|mode/i]
  ])("rejects unsafe template source bytes or mode: %s", async (_label, bytes, mode, expected) => {
    const { captureAwsStagingTemplateArtifact } = await import(
      "./aws-staging-template-artifact.mjs"
    );
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "needo-template-unsafe-"));
    const templatePath = path.join(temporaryRoot, "deploy/aws-staging/cloudformation.yml");
    const revision = "a".repeat(40);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const runGit = vi.fn(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return `${temporaryRoot}\n`;
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD^{commit}") return `${revision}\n`;
      if (args[0] === "status") return "";
      if (args[0] === "show") return bytes;
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    });

    try {
      await fs.mkdir(path.dirname(templatePath), { recursive: true });
      await fs.writeFile(templatePath, bytes, { mode: 0o600 });
      await fs.chmod(templatePath, mode);
      await expect(captureAwsStagingTemplateArtifact({
        templatePath,
        repositoryRoot: temporaryRoot,
        approvedRevision: revision,
        approvedSha256: digest,
        runGit
      })).rejects.toThrow(expected);
    } finally {
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("keeps the preflight CLI import-safe and redacts injectable and direct failures", () => {
    const cliUrl = new URL("./aws-staging-preflight.mjs", import.meta.url);
    const cliPath = fileURLToPath(cliUrl);
    const sensitive = "AKIAIOSFODNN7EXAMPLE provider-stdout provider-stderr --unsafe-secret";
    const evaluateRunner = [
      `const { runCli } = await import(${JSON.stringify(cliUrl.href)});`,
      "const stdout = []; const stderr = []; const exitCodes = [];",
      `const sensitive = ${JSON.stringify(sensitive)};`,
      "const result = await runCli({",
      "  argv: [sensitive],",
      "  execute: async () => { throw Object.assign(new Error(sensitive), { stdout: sensitive, stderr: sensitive }); },",
      "  writeStdout: (line) => stdout.push(line),",
      "  writeStderr: (line) => stderr.push(line),",
      "  setExitCode: (code) => exitCodes.push(code)",
      "});",
      "process.stdout.write(JSON.stringify({ result, stdout, stderr, exitCodes }));"
    ].join("\n");
    const environment = { PATH: "/path-with-no-aws", LANG: "C", LC_ALL: "C" };

    const imported = spawnSync(process.execPath, [
      "--input-type=module", "--eval", evaluateRunner
    ], { encoding: "utf8", shell: false, env: environment });
    expect(imported.status).toBe(0);
    expect(imported.stderr).toBe("");
    const result = JSON.parse(imported.stdout);
    expect(result).toEqual({
      result: {
        ok: false,
        failure: { gate: "aws-staging-preflight", status: "failed" }
      },
      stdout: [],
      stderr: ["{\"gate\":\"aws-staging-preflight\",\"status\":\"failed\"}"],
      exitCodes: [1]
    });
    expect(imported.stdout).not.toContain(sensitive);

    const direct = spawnSync(process.execPath, [cliPath, "--unsafe", sensitive], {
      encoding: "utf8",
      shell: false,
      env: environment
    });
    expect(direct.status).toBe(1);
    expect(direct.stdout).toBe("");
    expect(direct.stderr).toBe("{\"gate\":\"aws-staging-preflight\",\"status\":\"failed\"}\n");
    expect(`${direct.stdout}${direct.stderr}`).not.toContain(sensitive);
  });

  it("creates only the compact redacted CLI summary", () => {
    const summary = createAwsStagingPreflightSummary({
      accountId: config.accountId,
      alertEmail: "ops@example.com",
      callerArn,
      callerKind: "assumed-role",
      region: config.region,
      hostname: config.hostname,
      amiArchitecture: "arm64",
      amiId: "ami-0123",
      templateSha256,
      sourceRevision: templateRevision,
      runtimeSourceRevision: templateRevision,
      runtimeManifestSha256,
      runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
      templateValidation: "VALID",
      stackState: "ABSENT",
      dnsA: []
    });

    expect(summary).toEqual({
      gate: "aws-staging-preflight",
      accountId: config.accountId,
      callerKind: "assumed-role",
      region: config.region,
      hostname: config.hostname,
      amiArchitecture: "arm64",
      templateSha256,
      sourceRevision: templateRevision,
      runtimeSourceRevision: templateRevision,
      runtimeManifestSha256,
      runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
      stackState: "ABSENT",
      dnsA: []
    });
    expect(summary).not.toHaveProperty("callerArn");
    expect(summary).not.toHaveProperty("alertEmail");
    expect(Object.isFrozen(summary)).toBe(true);
  });

  it.each(["login"])(
    "accepts real configure-list credential rows with TYPE %s",
    async (credentialType) => {
      const aws = successfulAws({
        configureOutput: configureList({ accessType: credentialType })
      });

      await expect(runAwsStagingPreflight({
        aws,
        config,
        resolveDns: async () => []
      })).resolves.toMatchObject({ callerKind: "assumed-role" });

      expect(aws.text).toHaveBeenCalledWith(["configure", "list"]);
    }
  );

  it("accepts the AWS CLI v2 colon-delimited configure-list login rows", async () => {
    const aws = successfulAws({
      configureOutput: [
        "      Name                    Value             Type    Location",
        "      ----                    -----             ----    --------",
        "access_key : ****************ABCD     : login            :",
        "secret_key : ****************WXYZ     : login            :"
      ].join("\n")
    });

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: async () => []
    })).resolves.toMatchObject({ callerKind: "assumed-role" });
  });

  it.each(["sso", "assume-role", "custom-process"])(
    "rejects deferred company-profile provider TYPE %s before identity or mutation",
    async (credentialType) => {
      const aws = successfulAws({
        configureOutput: configureList({ accessType: credentialType })
      });

      await expect(runAwsStagingPreflight({
        aws,
        config,
        resolveDns: async () => []
      })).rejects.toThrow(/login/i);

      expect(aws.text).toHaveBeenCalledWith(["configure", "list"]);
      expect(aws.json).not.toHaveBeenCalled();
    }
  );

  it("accepts a matching assumed role, Amazon ARM64 AL2023 AMI, absent stack, and DNS baseline", async () => {
    const trace = [];
    const aws = successfulAws({ trace });
    const resolveDns = vi.fn(async (hostname) => {
      trace.push(`dns:${hostname}`);
      return ["203.0.113.8", "203.0.113.2"];
    });

    const result = await runAwsStagingPreflight({ aws, config, resolveDns });

    expect(result).toEqual({
      accountId: config.accountId,
      callerArn,
      callerKind: "assumed-role",
      region: config.region,
      hostname: config.hostname,
      amiId: "ami-0123",
      amiArchitecture: "arm64",
      templateSha256,
      sourceRevision: templateRevision,
      runtimeSourceRevision: templateRevision,
      runtimeManifestSha256,
      runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
      templateValidation: "VALID",
      stackState: "ABSENT",
      dnsA: ["203.0.113.2", "203.0.113.8"]
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.dnsA)).toBe(true);
    expect(aws.json.mock.calls).toEqual([
      [["sts", "get-caller-identity"]],
      [[
        "ssm", "get-parameter",
        "--name", "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
      ]],
      [["ec2", "describe-images", "--image-ids", "ami-0123"]],
      [[
        "cloudformation", "validate-template",
        "--template-body", templateBody
      ]],
      [["cloudformation", "describe-stacks", "--stack-name", config.stackName]]
    ]);
    expect(resolveDns).toHaveBeenCalledWith("staging.needo.life");
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter",
      "aws.json:ec2 describe-images",
      "aws.json:cloudformation validate-template",
      "aws.json:cloudformation describe-stacks",
      "dns:staging.needo.life"
    ]);
  });

  it.each([
    "Staging.needo.life",
    "staging.needo.life.",
    "*.needo.life",
    "staging.127.0.0.1",
    "localhost",
    "staging.localhost"
  ])("rejects unsafe hostname %s before AWS or DNS calls", async (hostname) => {
    const aws = successfulAws();
    const resolveDns = vi.fn();

    await expect(runAwsStagingPreflight({
      aws,
      config: { ...config, hostname },
      resolveDns
    })).rejects.toThrow("hostname");
    expect(aws.text).not.toHaveBeenCalled();
    expect(aws.json).not.toHaveBeenCalled();
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it("stops on the first mismatch before template, stack, or DNS work", async () => {
    const trace = [];
    const aws = successfulAws({
      trace,
      imageResult: {
        Images: [{
          ImageId: "ami-0123",
          Architecture: "x86_64",
          State: "available",
          OwnerId: "137112412989"
        }]
      }
    });
    const resolveDns = vi.fn(async (hostname) => {
      trace.push(`dns:${hostname}`);
      return [];
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns }))
      .rejects.toThrow("arm64");
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter",
      "aws.json:ec2 describe-images"
    ]);
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it.each([
    configureList({ accessType: "shared-credentials-file" }),
    configureList({ accessType: "env" }),
    configureList({ accessType: "sso-profile" }),
    configureList({ accessType: "manual", profile: "my-sso-assume-role-custom-process" }),
    configureList({ accessType: "sso", secretType: "shared-credentials-file" })
  ])("rejects unsafe credential TYPE columns", async (configureOutput) => {
    const aws = successfulAws({ configureOutput });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("credential TYPE");
    expect(aws.json).not.toHaveBeenCalled();
  });

  it.each([
    ["arn:aws:iam::123456789012:root", config.accountId, "root"],
    ["arn:aws:sts::999999999999:assumed-role/Other/session", "999999999999", "account"],
    ["arn:aws:iam::123456789012:user/long-lived", config.accountId, "temporary"],
    ["arn:aws:sts::123456789012:federated-user/not-a-role", config.accountId, "assumed-role"]
  ])("rejects unsafe caller %s", async (arn, accountId, expected) => {
    const aws = successfulAws({ identity: { Account: accountId, Arn: arn } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(expected);
    expect(aws.json).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty SSM AMI parameter before calling EC2", async () => {
    const trace = [];
    const aws = successfulAws({
      trace,
      parameterResult: { Parameter: { Value: "   " } }
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("no AMI ID");
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter"
    ]);
  });

  it.each([
    ["zero", []],
    ["multiple", [
      { ImageId: "ami-0123", Architecture: "arm64", State: "available", OwnerId: "137112412989" },
      { ImageId: "ami-0456", Architecture: "arm64", State: "available", OwnerId: "137112412989" }
    ]]
  ])("rejects %s EC2 image results", async (_label, images) => {
    const aws = successfulAws({ imageResult: { Images: images } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("exactly one image");
  });

  it.each([
    ["missing", { Architecture: "arm64", State: "available", OwnerId: "137112412989" }],
    ["mismatched", { ImageId: "ami-wrong", Architecture: "arm64", State: "available", OwnerId: "137112412989" }]
  ])("rejects a %s EC2 ImageId", async (_label, image) => {
    const aws = successfulAws({ imageResult: { Images: [image] } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow("ImageId must match");
  });

  it.each([
    [{ Architecture: "x86_64", State: "available", OwnerId: "137112412989" }, "arm64"],
    [{ Architecture: "arm64", State: "pending", OwnerId: "137112412989" }, "available"],
    [{ Architecture: "arm64", State: "available", OwnerId: "123456789012" }, "Amazon owner"]
  ])("rejects an unsafe AMI %#", async (imageOverrides, expected) => {
    const aws = successfulAws({
      imageResult: { Images: [{ ImageId: "ami-0123", ...imageOverrides }] }
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(expected);
    expect(aws.json).toHaveBeenCalledTimes(3);
  });

  it("rejects a relative template path before template validation", async () => {
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config: { ...config, templatePath: "deploy/aws-staging/cloudformation.yml" },
      resolveDns: async () => []
    })).rejects.toThrow("absolute");
    expect(aws.json).toHaveBeenCalledTimes(3);
  });

  it("propagates validate-template failure before describing the stack or resolving DNS", async () => {
    const trace = [];
    const validationError = new Error("AWS CLI failed (254): Template format error");
    const aws = successfulAws({ trace, validationResult: validationError });
    const resolveDns = vi.fn();

    await expect(runAwsStagingPreflight({ aws, config, resolveDns }))
      .rejects.toBe(validationError);
    expect(trace).toEqual([
      "aws.text:configure list",
      "aws.json:sts get-caller-identity",
      "aws.json:ssm get-parameter",
      "aws.json:ec2 describe-images",
      "aws.json:cloudformation validate-template"
    ]);
    expect(resolveDns).not.toHaveBeenCalled();
  });

  it.each(["CREATE_COMPLETE", "UPDATE_COMPLETE"])(
    "accepts stable existing stack state %s",
    async (stackState) => {
      const aws = successfulAws({ stack: { Stacks: [{ StackStatus: stackState }] } });

      await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
        .resolves.toMatchObject({ stackState });
    }
  );

  it.each([
    null,
    {},
    { Stacks: [] },
    { Stacks: [{ StackStatus: "CREATE_COMPLETE" }, { StackStatus: "UPDATE_COMPLETE" }] },
    { Stacks: [{}] }
  ])("rejects malformed describe-stacks response %#", async (stack) => {
    const aws = successfulAws({ stack });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(/exactly one|UNKNOWN/);
  });

  it.each([
    "CREATE_IN_PROGRESS",
    "UPDATE_FAILED",
    "UPDATE_ROLLBACK_COMPLETE",
    "DELETE_COMPLETE"
  ])("rejects unsafe stack state %s", async (stackState) => {
    const aws = successfulAws({ stack: { Stacks: [{ StackStatus: stackState }] } });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toThrow(stackState);
  });

  it.each([
    new Error("AWS CLI failed (254): ValidationError"),
    new Error("AWS CLI failed (254): Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): AccessDenied"),
    new Error("AWS CLI failed (255): connection timed out"),
    new Error("AWS CLI failed (254): AccessDenied: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist; AccessDenied"),
    new Error("Wrapper: AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id another-stack does not exist")
  ])("propagates a describe-stacks error that is not the exact absence signal", async (stackError) => {
    const aws = successfulAws({ stack: stackError });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .rejects.toBe(stackError);
  });

  it("matches an exact absent-stack error when the configured name contains regexp syntax", async () => {
    const escapedNameConfig = { ...config, stackName: "needo-staging-[draft]" };
    const aws = successfulAws({
      stack: new Error(
        "AWS CLI failed (254): An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-[draft] does not exist"
      )
    });

    await expect(runAwsStagingPreflight({
      aws,
      config: escapedNameConfig,
      resolveDns: async () => []
    })).resolves.toMatchObject({ stackState: "ABSENT" });
  });

  it.each(["ENODATA", "ENOTFOUND"])("maps DNS %s to an empty baseline", async (code) => {
    const dnsError = Object.assign(new Error(code), { code });
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: vi.fn().mockRejectedValue(dnsError)
    })).resolves.toMatchObject({ dnsA: [] });
  });

  it.each([
    null,
    {},
    "203.0.113.10",
    ["203.0.113.10", 203]
  ])("rejects invalid DNS A-record result shape %#", async (dnsResult) => {
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: vi.fn().mockResolvedValue(dnsResult)
    })).rejects.toThrow("invalid result");
  });

  it("propagates every other DNS failure", async () => {
    const dnsError = Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" });
    const aws = successfulAws();

    await expect(runAwsStagingPreflight({
      aws,
      config,
      resolveDns: vi.fn().mockRejectedValue(dnsError)
    })).rejects.toBe(dnsError);
  });
});
