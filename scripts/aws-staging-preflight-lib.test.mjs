import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

function runLocalGit(args, { cwd }) {
  const result = spawnSync("/usr/bin/git", args, {
    cwd,
    encoding: null,
    env: {
      GIT_AUTHOR_EMAIL: "aws-staging-test@example.invalid",
      GIT_AUTHOR_NAME: "AWS Staging Test",
      GIT_COMMITTER_EMAIL: "aws-staging-test@example.invalid",
      GIT_COMMITTER_NAME: "AWS Staging Test",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_OPTIONAL_LOCKS: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin"
    }
  });
  if (result.status !== 0) {
    throw new Error(`local Git fixture failed: ${String(result.stderr)}`);
  }
  return result.stdout;
}

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
    indexedOverrides = new Map(),
    committedOverrides = new Map(),
    externalSourceRoot = false,
    missingIndexPaths = new Set(),
    workingOverrides = new Map()
  } = {}) {
    const {
      AWS_STAGING_RUNTIME_FILES,
      captureAwsStagingRuntimeArtifact
    } = await import("./aws-staging-runtime-artifact.mjs");
    const { createAwsStagingRuntimeManifestSha256 } = await import(
      "./aws-staging-launcher.mjs"
    );
    const temporaryRoot = await fs.realpath(await fs.mkdtemp(
      path.join(os.tmpdir(), "needo-runtime-artifact-")
    ));
    const committed = new Map(AWS_STAGING_RUNTIME_FILES.map((relativePath) => [
      relativePath,
      Buffer.from(`approved runtime bytes for ${relativePath}\n`, "utf8")
    ]));
    committed.set("package.json", Buffer.from(JSON.stringify({ scripts: {} }), "utf8"));
    for (const [relativePath, bytes] of committedOverrides) {
      committed.set(relativePath, bytes);
    }
    for (const [relativePath, bytes] of committed) {
      const absolutePath = path.join(temporaryRoot, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, bytes, { mode: 0o600 });
    }
    for (const [relativePath, bytes] of workingOverrides) {
      await fs.writeFile(path.join(temporaryRoot, relativePath), bytes, { mode: 0o600 });
    }
    const runtimeManifestSha256 = createAwsStagingRuntimeManifestSha256(
      headRevision,
      AWS_STAGING_RUNTIME_FILES.map((relativePath) => {
        const bytes = committed.get(relativePath);
        return {
          byteLength: bytes.length,
          digest: createHash("sha256").update(bytes).digest("hex"),
          gitMode: "100644",
          relativePath
        };
      })
    );
    const launchContextPath = path.join(
      temporaryRoot,
      ".needo-aws-staging-launch-context.json"
    );
    const sourceRepositoryRoot = externalSourceRoot
      ? path.join(temporaryRoot, "evidence-source")
      : temporaryRoot;
    if (externalSourceRoot) await fs.mkdir(sourceRepositoryRoot, { mode: 0o700 });
    const sourceRootStat = await fs.lstat(sourceRepositoryRoot);
    await fs.writeFile(launchContextPath, `${JSON.stringify({
      evidenceOutputDirectory: path.join(sourceRepositoryRoot, "outputs/aws-staging"),
      nodeExecutable: {
        byteLength: 1,
        identity: {
          changedNanoseconds: "1",
          device: "1",
          group: "1",
          inode: "1",
          links: "1",
          mode: 0o500,
          modifiedNanoseconds: "1",
          owner: "1",
          size: "1"
        },
        relativePath: ".needo-node",
        sha256: "e".repeat(64)
      },
      runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
      runtimeManifestSha256,
      runtimeSourceRevision: headRevision,
      snapshotRoot: temporaryRoot,
      sourceRepositoryIdentity: {
        device: String(sourceRootStat.dev),
        group: String(sourceRootStat.gid),
        inode: String(sourceRootStat.ino),
        mode: sourceRootStat.mode & 0o777,
        owner: String(sourceRootStat.uid),
        realPath: sourceRepositoryRoot
      },
      sourceRepositoryRoot,
      version: 2
    })}\n`, { mode: 0o400 });
    const runGit = vi.fn(async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return `${temporaryRoot}\n`;
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD^{commit}") return `${headRevision}\n`;
      if (args[0] === "ls-tree") {
        const relativePath = args.at(-1);
        return `100644 blob ${"1".repeat(40)}\t${relativePath}\n`;
      }
      if (args[0] === "ls-files") {
        const relativePath = args.at(-1);
        if (missingIndexPaths.has(relativePath)) return "";
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
      launchContextPath,
      repositoryRoot: temporaryRoot,
      runGit
    });
    return {
      capture,
      committed,
      entrypointPath,
      runGit,
      sourceRepositoryRoot,
      temporaryRoot
    };
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
    ["unstaged runtime drift", {
      workingOverrides: new Map([[
        "scripts/aws-staging-cli.mjs", Buffer.from("unstaged replacement\n")
      ]])
    }, /bytes|approved revision/i],
    ["untracked runtime replacement", {
      missingIndexPaths: new Set(["scripts/aws-staging-preflight.mjs"]),
      workingOverrides: new Map([[
        "scripts/aws-staging-preflight.mjs", Buffer.from("untracked replacement\n")
      ]])
    }, /mode|index/i],
    ["staged runtime drift", {
      indexedOverrides: new Map([[
        "scripts/aws-staging-cli.mjs", Buffer.from("staged replacement\n")
      ]])
    }, /index|approved revision/i]
  ])("rejects %s before a credential adapter can be created", async (_label, fixtureOptions, expected) => {
    const fixture = await createRuntimeFixture(fixtureOptions);
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

  it("rejects replacement of the original evidence source root after launch", async () => {
    const fixture = await createRuntimeFixture({ externalSourceRoot: true });
    try {
      const artifact = await fixture.capture();
      await fs.rename(fixture.sourceRepositoryRoot, `${fixture.sourceRepositoryRoot}.approved`);
      await fs.mkdir(fixture.sourceRepositoryRoot, { mode: 0o700 });
      await expect(artifact.assertCurrentState()).rejects.toThrow(/source.*identity|identity.*source/i);
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

  it("keeps the pre-ESM launcher self-contained with only approved node built-ins", async () => {
    const { requireAwsStagingStaticModuleClosure } = await import("./aws-staging-launcher.mjs");
    expect(() => requireAwsStagingStaticModuleClosure([{
      relativePath: "scripts/aws-staging-launcher.mjs",
      committedBytes: Buffer.from(
        'import { createFrozenAwsCli } from "./aws-staging-cli.mjs";\n',
        "utf8"
      )
    }])).toThrow(/launcher.*self-contained/i);
  });

  it.each([
    ["comment-obscured dynamic dependency", 'import/*comment*/("./unbound.mjs");\n'],
    ["no-space named dependency", 'import{ value }from"./unbound.mjs";\n'],
    ["comment-obscured named dependency", 'import/*comment*/{ value }from"./unbound.mjs";\n'],
    ["side-effect dependency", 'import"./unbound.mjs";\n'],
    ["template-expression dynamic dependency", 'const value = `${import/*comment*/("./unbound.mjs")}`;\n'],
    ["no-space named re-export", 'export{ value }from"./unbound.mjs";\n'],
    ["comment-obscured named re-export", 'export/*comment*/{ value }from"./unbound.mjs";\n'],
    ["comment-obscured star re-export", 'export*/*comment*/from"./unbound.mjs";\n'],
    ["namespace re-export", 'export*as namespace from"./unbound.mjs";\n'],
    ["unapproved built-in loader", 'import { createRequire } from "node:module";\n'],
    [
      "astral text before a canonical declaration",
      '"😀😀";\nimport path from "node:path";\nimport/*comment*/("./unbound.mjs");\n'
    ],
    [
      "astral text before import.meta",
      '"😀😀";import.meta;import/*comment*/("./unbound.mjs");\n'
    ],
    [
      "comment-obscured eval loader",
      'eval/*comment*/("im" + "port(\\"data:text/javascript,0\\")");\n'
    ],
    [
      "comment-obscured Function loader",
      'Function/*comment*/("return im" + "port(\\"data:text/javascript,0\\")")();\n'
    ],
    [
      "comment-obscured CommonJS loader",
      'require/*comment*/("./unbound.cjs");\n'
    ],
    [
      "comment-obscured Worker loader",
      'new/*comment*/Worker("data:text/javascript,0");\n'
    ],
    [
      "template-literal fake declaration around a dynamic load",
      'const source = "data:text/javascript,0";\nconst text = `\nimport { value } from "./${import(source)}/../aws-staging-cli.mjs";\n`;\n'
    ],
    [
      "Unicode-escaped eval loader",
      '\\u0065val("im" + "port(\\"data:text/javascript,0\\")");\n'
    ],
    [
      "Unicode-escaped Function loader",
      'Funct\\u0069on("return im" + "port(\\"data:text/javascript,0\\")")();\n'
    ]
  ])("rejects %s outside the canonical static module grammar", async (_label, source) => {
    const fixture = await createRuntimeFixture({
      committedOverrides: new Map([[
        "scripts/aws-staging-preflight.mjs",
        Buffer.from(source, "utf8")
      ]])
    });
    try {
      await expect(fixture.capture()).rejects.toThrow(/module syntax|loader|unbound|dependency/i);
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("provides a separately trusted launcher before npm or guarded ESM can load", async () => {
    const { AWS_STAGING_LAUNCHER_RUNTIME_FILES } = await import(
      "./aws-staging-launcher.mjs"
    );
    const { AWS_STAGING_RUNTIME_FILES } = await import("./aws-staging-runtime-artifact.mjs");
    expect(AWS_STAGING_LAUNCHER_RUNTIME_FILES).toEqual(AWS_STAGING_RUNTIME_FILES);
    expect(AWS_STAGING_RUNTIME_FILES).toContain("scripts/aws-staging-launcher.mjs");
  });

  it("pins the trusted launcher to Node.js major 22", async () => {
    const { assertAwsStagingNodeRuntime } = await import("./aws-staging-launcher.mjs");
    expect(assertAwsStagingNodeRuntime).toBeTypeOf("function");
    expect(() => assertAwsStagingNodeRuntime("node", "22.99.0")).not.toThrow();
    expect(() => assertAwsStagingNodeRuntime("node", "23.0.0")).toThrow(/Node\.js 22/i);
  });

  async function createTrustedLauncherFixture() {
    const launcher = await import("./aws-staging-launcher.mjs");
    const temporaryRoot = await fs.realpath(await fs.mkdtemp(
      path.join(os.tmpdir(), "needo-trusted-launcher-")
    ));
    const sourceRoot = path.join(temporaryRoot, "source");
    await fs.mkdir(sourceRoot, { mode: 0o700 });
    const paths = [
      ...launcher.AWS_STAGING_LAUNCHER_RUNTIME_FILES,
      "deploy/aws-staging/cloudformation.yml"
    ];
    for (const relativePath of paths) {
      const destination = path.join(sourceRoot, relativePath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(new URL(`../${relativePath}`, import.meta.url), destination);
      await fs.chmod(destination, 0o600);
    }
    await runLocalGit(["init", "--quiet"], { cwd: sourceRoot });
    await runLocalGit(["add", "--", ...paths], { cwd: sourceRoot });
    await runLocalGit(["commit", "--quiet", "-m", "approved runtime fixture"], { cwd: sourceRoot });
    const revision = String(await runLocalGit(
      ["rev-parse", "--verify", "HEAD^{commit}"],
      { cwd: sourceRoot }
    )).trim();
    const argv = [
      "preflight",
      "--profile", "needo-staging-test",
      "--account-id", "123456789012",
      "--region", "ap-southeast-2",
      "--hostname", "staging.needo.life",
      "--alert-email", "ops@example.invalid",
      "--budget-amount", "10",
      "--budget-unit", "USD",
      "--source-revision", revision
    ];
    return { ...launcher, argv, paths, revision, sourceRoot, temporaryRoot };
  }

  async function createReplaceableNodeLauncherFixture() {
    const fixture = await createTrustedLauncherFixture();
    const trustRoot = path.join(fixture.temporaryRoot, "node-install");
    const executableDirectory = path.join(trustRoot, "bin");
    const executablePath = path.join(executableDirectory, "node");
    await fs.mkdir(executableDirectory, { mode: 0o700, recursive: true });
    await fs.copyFile(process.execPath, executablePath);
    await fs.chmod(executablePath, 0o500);
    const fileSystem = new Proxy(fs, {
      get(target, property) {
        if (property === "realpath") {
          return async (candidate) => (
            path.resolve(candidate) === path.resolve(process.execPath)
              ? executablePath
              : target.realpath(candidate)
          );
        }
        const value = target[property];
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    return {
      ...fixture,
      executablePath,
      fileSystem,
      nodeCandidates: [{ candidate: executablePath, trustRoot }]
    };
  }

  async function replaceNodePath(executablePath, sentinelPath) {
    await fs.rename(executablePath, `${executablePath}.approved`);
    await fs.writeFile(executablePath, [
      "#!/bin/sh",
      `/usr/bin/touch ${JSON.stringify(sentinelPath)}`,
      "exit 0",
      ""
    ].join("\n"), { mode: 0o500 });
    await fs.chmod(executablePath, 0o500);
  }

  async function sha256File(absolutePath) {
    const handle = await fs.open(absolutePath, "r");
    try {
      const digest = createHash("sha256");
      const buffer = Buffer.allocUnsafe(1024 * 1024);
      let position = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
        if (bytesRead === 0) break;
        digest.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
      return digest.digest("hex");
    } finally {
      await handle.close();
    }
  }

  async function installGuardedProbe(args) {
    const entrypointPath = args.find((value) => (
      value.endsWith("/scripts/aws-staging-preflight.mjs")
    ));
    expect(entrypointPath).toBeTypeOf("string");
    await fs.chmod(entrypointPath, 0o600);
    await fs.writeFile(entrypointPath, [
      "process.stdout.write(JSON.stringify({",
      "  executablePath: process.execPath,",
      "  nodeVersion: process.versions.node,",
      "  status: 'ok'",
      "}) + '\\n');"
    ].join("\n"));
    await fs.chmod(entrypointPath, 0o400);
  }

  async function expectPrivateNodeChild({
    environment,
    executablePath,
    snapshotRoot,
    sourceExecutablePath
  }) {
    expect(executablePath).toBe(path.join(snapshotRoot, ".needo-node"));
    expect(executablePath).not.toBe(sourceExecutablePath);
    const stat = await fs.lstat(executablePath);
    expect(stat.mode & 0o777).toBe(0o500);
    expect(stat.nlink).toBe(1);
    const context = JSON.parse(await fs.readFile(
      environment.NEEDO_AWS_STAGING_LAUNCH_CONTEXT,
      "utf8"
    ));
    expect(context.nodeExecutable).toMatchObject({
      byteLength: stat.size,
      relativePath: ".needo-node",
      sha256: await sha256File(executablePath)
    });
  }

  it("fails closed when the original Node path is replaced after parent version inspection", async () => {
    const fixture = await createReplaceableNodeLauncherFixture();
    const sentinel = path.join(fixture.temporaryRoot, "replacement-node-ran");
    let replacementInstalled = false;
    const readNodeRuntime = vi.fn(async () => {
      const runtime = {
        releaseName: process.release.name,
        version: process.versions.node
      };
      replacementInstalled = true;
      await replaceNodePath(fixture.executablePath, sentinel);
      return runtime;
    });
    const runChild = vi.fn();
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        fileSystem: fixture.fileSystem,
        launcherSourceRevision: fixture.revision,
        nodeCandidates: fixture.nodeCandidates,
        readNodeRuntime,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).rejects.toThrow(/trusted Node handle changed|copy verification/i);
      expect(replacementInstalled).toBe(true);
      expect(readNodeRuntime).toHaveBeenCalledOnce();
      expect(runChild).not.toHaveBeenCalled();
      await expect(fs.access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("never reopens the original Node path after final private-copy attestation", async () => {
    const fixture = await createReplaceableNodeLauncherFixture();
    const sentinel = path.join(fixture.temporaryRoot, "late-replacement-node-ran");
    let childResult;
    let privateExecutablePath;
    const runChild = vi.fn(async ({
      args,
      cwd,
      environment,
      executablePath,
      snapshotRoot
    }) => {
      await replaceNodePath(fixture.executablePath, sentinel);
      await expectPrivateNodeChild({
        environment,
        executablePath,
        snapshotRoot,
        sourceExecutablePath: fixture.executablePath
      });
      privateExecutablePath = executablePath;
      await installGuardedProbe(args);
      childResult = spawnSync(executablePath, args, {
        cwd,
        encoding: "utf8",
        env: environment
      });
      return childResult.status ?? 1;
    });
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        fileSystem: fixture.fileSystem,
        launcherSourceRevision: fixture.revision,
        nodeCandidates: fixture.nodeCandidates,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).resolves.toBe(0);
      expect(runChild).toHaveBeenCalledOnce();
      expect(JSON.parse(childResult.stdout)).toMatchObject({
        executablePath: privateExecutablePath,
        nodeVersion: expect.stringMatching(/^22\./),
        status: "ok"
      });
      await expect(fs.access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("makes the earliest guarded child reject a mismatched sealed Node digest", async () => {
    const fixture = await createTrustedLauncherFixture();
    const sentinel = path.join(fixture.temporaryRoot, "digest-mismatch-entrypoint-ran");
    let childResult;
    const runChild = vi.fn(async ({ args, cwd, environment, executablePath }) => {
      const entrypointPath = args.find((value) => (
        value.endsWith("/scripts/aws-staging-preflight.mjs")
      ));
      const contextPath = environment.NEEDO_AWS_STAGING_LAUNCH_CONTEXT;
      const context = JSON.parse(await fs.readFile(contextPath, "utf8"));
      context.nodeExecutable.sha256 = "0".repeat(64);
      await fs.chmod(contextPath, 0o600);
      await fs.writeFile(contextPath, `${JSON.stringify(context)}\n`);
      await fs.chmod(contextPath, 0o400);
      await fs.chmod(entrypointPath, 0o600);
      await fs.writeFile(
        entrypointPath,
        `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(sentinel)}, "unsafe");\n`
      );
      await fs.chmod(entrypointPath, 0o400);
      childResult = spawnSync(executablePath, args, {
        cwd,
        encoding: "utf8",
        env: environment
      });
      return childResult.status ?? 1;
    });
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).resolves.not.toBe(0);
      expect(childResult.stdout).toBe("");
      expect(childResult.stderr).not.toContain(fixture.temporaryRoot);
      await expect(fs.access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("makes the earliest guarded child reject an actual non-22 runtime version", async () => {
    const fixture = await createTrustedLauncherFixture();
    const sentinel = path.join(fixture.temporaryRoot, "wrong-node-major-entrypoint-ran");
    const versionPatchPath = path.join(fixture.temporaryRoot, "force-node-23.mjs");
    await fs.writeFile(versionPatchPath, [
      "Object.defineProperty(process.versions, 'node', {",
      "  configurable: true,",
      "  value: '23.0.0'",
      "});",
      ""
    ].join("\n"), { mode: 0o400 });
    let childResult;
    const runChild = vi.fn(async ({ args, cwd, environment, executablePath }) => {
      const entrypointPath = args.find((value) => (
        value.endsWith("/scripts/aws-staging-preflight.mjs")
      ));
      await fs.chmod(entrypointPath, 0o600);
      await fs.writeFile(
        entrypointPath,
        `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(sentinel)}, "unsafe");\n`
      );
      await fs.chmod(entrypointPath, 0o400);
      const testArgs = [...args];
      testArgs.splice(3, 0, `--import=${pathToFileURL(versionPatchPath).href}`);
      childResult = spawnSync(executablePath, testArgs, {
        cwd,
        encoding: "utf8",
        env: environment
      });
      return childResult.status ?? 1;
    });
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).resolves.not.toBe(0);
      expect(childResult.stdout).toBe("");
      expect(childResult.stderr).toBe(
        '{"gate":"aws-staging-runtime-guard","status":"failed"}\n'
      );
      await expect(fs.access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it("materializes approved bytes into a private snapshot before executing the guarded entrypoint", async () => {
    const fixture = await createTrustedLauncherFixture();
    const runChild = vi.fn(async ({ args, cwd, environment, executablePath, snapshotRoot }) => {
      expect(executablePath).toBe(path.join(snapshotRoot, ".needo-node"));
      expect(executablePath).not.toBe(await fs.realpath(process.execPath));
      expect(cwd).toBe(snapshotRoot);
      expect(args.slice(0, 4)).toEqual([
        "--no-addons",
        "--disallow-code-generation-from-strings",
        "--disable-warning=ExperimentalWarning",
        `--import=${pathToFileURL(path.join(
          snapshotRoot,
          "scripts/aws-staging-runtime-guard.mjs"
        )).href}`
      ]);
      expect(args[4]).toBe(path.join(snapshotRoot, "scripts/aws-staging-preflight.mjs"));
      expect(Object.keys(environment).sort()).toEqual([
        "LANG", "LC_ALL", "NEEDO_AWS_STAGING_LAUNCH_CONTEXT"
      ]);
      const sourceBytes = await fs.readFile(path.join(
        fixture.sourceRoot,
        "scripts/aws-staging-preflight.mjs"
      ));
      expect(await fs.readFile(args[4])).toEqual(sourceBytes);
      expect((await fs.stat(snapshotRoot)).mode & 0o777).toBe(0o500);
      expect((await fs.stat(args[4])).mode & 0o777).toBe(0o400);
      expect((await fs.stat(executablePath)).mode & 0o777).toBe(0o500);
      const sealedRuntime = await import(`${pathToFileURL(path.join(
        snapshotRoot,
        "scripts/aws-staging-runtime-artifact.mjs"
      )).href}?fixture=${fixture.revision}`);
      const artifact = await sealedRuntime.captureAwsStagingRuntimeArtifact({
        argv: args.slice(5),
        entrypointPath: args[4],
        launchContextPath: environment.NEEDO_AWS_STAGING_LAUNCH_CONTEXT,
        repositoryRoot: snapshotRoot
      });
      expect(artifact).toMatchObject({
        evidenceOutputDirectory: path.join(fixture.sourceRoot, "outputs/aws-staging"),
        evidenceTrustedRoot: fixture.sourceRoot,
        runtimeEntrypoint: "scripts/aws-staging-preflight.mjs",
        runtimeSourceRevision: fixture.revision
      });
      await expect(artifact.assertCurrentState()).resolves.toBeUndefined();
      return 0;
    });
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).resolves.toBe(0);
      expect(runChild).toHaveBeenCalledOnce();
      expect(await fs.readdir(fixture.temporaryRoot)).toEqual(["source"]);
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("does not chmod a symlink target while removing a tampered sealed snapshot", async () => {
    const fixture = await createTrustedLauncherFixture();
    const victim = path.join(fixture.temporaryRoot, "cleanup-victim");
    await fs.writeFile(victim, "must retain its mode\n", { mode: 0o644 });
    await fs.chmod(victim, 0o644);
    const runChild = vi.fn(async ({ args }) => {
      const entrypointPath = args.find((value) => (
        value.endsWith("/scripts/aws-staging-preflight.mjs")
      ));
      expect(entrypointPath).toBeTypeOf("string");
      await fs.chmod(path.dirname(entrypointPath), 0o700);
      await fs.rm(entrypointPath);
      await fs.symlink(victim, entrypointPath);
      return 0;
    });
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).resolves.toBe(0);
      expect(runChild).toHaveBeenCalledOnce();
      expect((await fs.stat(victim)).mode & 0o777).toBe(0o644);
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects every module resolution outside the sealed runtime allowlist", async () => {
    const { resolve } = await import("./aws-staging-module-loader.mjs");
    const allowedUrl = pathToFileURL(fileURLToPath(new URL(
      "./aws-staging-preflight.mjs",
      import.meta.url
    ))).href;
    await expect(resolve("node:path", {}, async (specifier) => ({
      url: specifier
    }))).resolves.toEqual({ url: "node:path" });
    await expect(resolve(allowedUrl, {}, async (specifier) => ({
      url: specifier
    }))).resolves.toEqual({ url: allowedUrl });
    await expect(resolve("data:text/javascript,0", {}, async (specifier) => ({
      url: specifier
    }))).rejects.toThrow(/module resolution/i);
    await expect(resolve("file:///private/tmp/unbound-runtime.mjs", {}, async (specifier) => ({
      url: specifier
    }))).rejects.toThrow(/module resolution/i);
    await expect(resolve("node:module", {}, async (specifier) => ({
      url: specifier
    }))).rejects.toThrow(/module resolution/i);
  });

  it("fails closed before entrypoint code when the sealed Node context is absent", () => {
    const guardUrl = pathToFileURL(fileURLToPath(new URL(
      "./aws-staging-runtime-guard.mjs",
      import.meta.url
    ))).href;
    const probe = [
      'if (process["get" + "Builtin" + "Module"] !== undefined) process.exit(71);',
      'if (process["bind" + "ing"] !== undefined) process.exit(72);',
      'if (process["dl" + "open"] !== undefined) process.exit(73);',
      'try { globalThis.constructor.constructor("return 1")(); process.exit(74); }',
      'catch (error) { if (error.name !== "EvalError") process.exit(75); }'
    ].join("");
    const result = spawnSync(process.execPath, [
      "--no-addons",
      "--disallow-code-generation-from-strings",
      `--import=${guardUrl}`,
      "-e",
      probe
    ], {
      encoding: "utf8",
      env: { LANG: "C", LC_ALL: "C" }
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe('{"gate":"aws-staging-runtime-guard","status":"failed"}\n');
  });

  it("enforces the combined guarded child argv without leaking its sealed path", async () => {
    const fixture = await createTrustedLauncherFixture();
    let childResult;
    const probeSource = [
      'const fail = (message) => { throw new Error(message); };',
      'for (const name of [["get", "Builtin", "Module"], ["bind", "ing"], ["dl", "open"]]) {',
      '  if (process[name.join("")] !== undefined) fail(`unguarded process ${name.join("")}`);',
      '}',
      'for (const name of [["ev", "al"], ["Func", "tion"]]) {',
      '  try { globalThis[name.join("")]("return 1"); fail(`code generation ${name.join("")}`); }',
      '  catch (error) { if (error.name !== "EvalError") throw error; }',
      '}',
      'for (const specifier of [',
      '  ["data:", "text/javascript,", "export default 1"].join(""),',
      '  ["file:", "///private/tmp/unbound-aws-staging-probe.mjs"].join("")',
      ']) {',
      '  try { await import(specifier); fail(`module resolution ${specifier}`); }',
      '  catch (error) { if (!/module resolution rejected/i.test(error.message)) throw error; }',
      '}',
      'process.stdout.write("{\\"status\\":\\"ok\\"}\\n");'
    ].join("\n");
    const runChild = vi.fn(async ({ args, cwd, environment, executablePath }) => {
      const entrypointPath = args.find((value) => (
        value.endsWith("/scripts/aws-staging-preflight.mjs")
      ));
      expect(entrypointPath).toBeTypeOf("string");
      await fs.chmod(entrypointPath, 0o600);
      await fs.writeFile(entrypointPath, probeSource);
      await fs.chmod(entrypointPath, 0o400);
      childResult = spawnSync(executablePath, args, {
        cwd,
        encoding: "utf8",
        env: environment
      });
      return childResult.status ?? 1;
    });
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).resolves.toBe(0);
      expect(runChild).toHaveBeenCalledOnce();
      expect(childResult.stdout).toBe('{"status":"ok"}\n');
      expect(childResult.stderr).not.toContain("ExperimentalWarning");
      expect(childResult.stderr).not.toContain(fixture.temporaryRoot);
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("never executes mutable repository clean filters while binding approved source bytes", async () => {
    const fixture = await createTrustedLauncherFixture();
    const sentinel = path.join(fixture.temporaryRoot, "untrusted-filter-ran");
    const target = path.join(fixture.sourceRoot, "scripts/aws-staging-cli.mjs");
    const bytes = await fs.readFile(target);
    await fs.writeFile(
      path.join(fixture.sourceRoot, ".gitattributes"),
      "scripts/aws-staging-cli.mjs filter=untrusted-probe\n"
    );
    await runLocalGit([
      "config",
      "filter.untrusted-probe.clean",
      `/usr/bin/touch ${sentinel}; /bin/cat`
    ], { cwd: fixture.sourceRoot });
    await runLocalGit([
      "config", "filter.untrusted-probe.required", "true"
    ], { cwd: fixture.sourceRoot });
    await fs.writeFile(target, bytes, { mode: 0o600 });

    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild: vi.fn(async () => 0),
        temporaryRoot: fixture.temporaryRoot
      })).resolves.toBe(0);
      await expect(fs.access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    ["dirty package prehook", async (fixture) => {
      const packagePath = path.join(fixture.sourceRoot, "package.json");
      const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
      packageJson.scripts["preaws:staging:preflight"] = "node ./untrusted-before-gate.mjs";
      await fs.writeFile(packagePath, `${JSON.stringify(packageJson)}\n`, { mode: 0o600 });
    }],
    ["staged runtime replacement", async (fixture) => {
      const target = path.join(fixture.sourceRoot, "scripts/aws-staging-cli.mjs");
      await fs.appendFile(target, "\n// staged drift\n");
      await runLocalGit(["add", "--", "scripts/aws-staging-cli.mjs"], {
        cwd: fixture.sourceRoot
      });
    }]
  ])("rejects %s before the guarded child can run", async (_label, mutate) => {
    const fixture = await createTrustedLauncherFixture();
    const runChild = vi.fn();
    try {
      await mutate(fixture);
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).rejects.toThrow(/clean|dirty|drift|approved|approval|differ|bytes|index/i);
      expect(runChild).not.toHaveBeenCalled();
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects an approved revision mismatch before the guarded child can run", async () => {
    const fixture = await createTrustedLauncherFixture();
    const runChild = vi.fn();
    try {
      const argv = fixture.argv.with(-1, "b".repeat(40));
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).rejects.toThrow(/revision/i);
      expect(runChild).not.toHaveBeenCalled();
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects a launcher Git-object revision that differs from the approved runtime revision", async () => {
    const fixture = await createTrustedLauncherFixture();
    const runChild = vi.fn();
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: "b".repeat(40),
        repositoryRoot: fixture.sourceRoot,
        runChild,
        temporaryRoot: fixture.temporaryRoot
      })).rejects.toThrow(/launcher.*revision|revision.*launcher/i);
      expect(runChild).not.toHaveBeenCalled();
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects same-byte source identity replacement during snapshot creation", async () => {
    const fixture = await createTrustedLauncherFixture();
    const runChild = vi.fn();
    let targetIndexChecks = 0;
    const runGit = async (args, options) => {
      if (args[0] === "ls-files" && args.at(-1) === "scripts/aws-staging-cli.mjs") {
        targetIndexChecks += 1;
        if (targetIndexChecks === 2) {
          const target = path.join(fixture.sourceRoot, "scripts/aws-staging-cli.mjs");
          const bytes = await fs.readFile(target);
          await fs.rename(target, `${target}.displaced`);
          await fs.writeFile(target, bytes, { mode: 0o600 });
        }
      }
      return runLocalGit(args, options);
    };
    try {
      await expect(fixture.runAwsStagingTrustedLauncher({
        argv: fixture.argv,
        launcherSourceRevision: fixture.revision,
        repositoryRoot: fixture.sourceRoot,
        runChild,
        runGit,
        temporaryRoot: fixture.temporaryRoot
      })).rejects.toThrow(/identity|changed/i);
      expect(runChild).not.toHaveBeenCalled();
    } finally {
      await fs.rm(fixture.temporaryRoot, { recursive: true, force: true });
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

  it("accepts the exact enhanced AWS CLI absent-stack error", async () => {
    const aws = successfulAws({
      stack: new Error(
        "AWS CLI failed (254): aws: [ERROR]: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"
      )
    });

    await expect(runAwsStagingPreflight({ aws, config, resolveDns: async () => [] }))
      .resolves.toMatchObject({ stackState: "ABSENT" });
  });

  it.each([
    new Error("AWS CLI failed (254): ValidationError"),
    new Error("AWS CLI failed (254): Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): AccessDenied"),
    new Error("AWS CLI failed (255): connection timed out"),
    new Error("AWS CLI failed (254): AccessDenied: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): aws: [ERROR]: AccessDenied: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"),
    new Error("AWS CLI failed (254): aws: [ERROR]: aws: [ERROR]: An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id needo-staging-infrastructure does not exist"),
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
