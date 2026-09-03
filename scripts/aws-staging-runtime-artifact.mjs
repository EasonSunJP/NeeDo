import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(moduleDir, "..");
const FULL_GIT_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export const AWS_STAGING_RUNTIME_FILES = Object.freeze([
  "package.json",
  "scripts/aws-staging-attestation.mjs",
  "scripts/aws-staging-bootstrap-host-lib.mjs",
  "scripts/aws-staging-bootstrap-host.mjs",
  "scripts/aws-staging-cli.mjs",
  "scripts/aws-staging-config.mjs",
  "scripts/aws-staging-deploy-lib.mjs",
  "scripts/aws-staging-deploy.mjs",
  "scripts/aws-staging-preflight-lib.mjs",
  "scripts/aws-staging-preflight.mjs",
  "scripts/aws-staging-runtime-artifact.mjs",
  "scripts/aws-staging-stack-contract.mjs",
  "scripts/aws-staging-template-artifact.mjs",
  "scripts/aws-staging-verify-lib.mjs",
  "scripts/aws-staging-verify.mjs"
]);

const AWS_STAGING_ENTRYPOINTS = new Set([
  "scripts/aws-staging-bootstrap-host.mjs",
  "scripts/aws-staging-deploy.mjs",
  "scripts/aws-staging-preflight.mjs",
  "scripts/aws-staging-verify.mjs"
]);

async function runSystemGit(args, { cwd }) {
  const { stdout } = await execFileAsync("/usr/bin/git", [
    "-c", "core.fsmonitor=false",
    ...args
  ], {
    cwd,
    encoding: "buffer",
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_OPTIONAL_LOCKS: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: "/usr/bin:/bin"
    }
  });
  return stdout;
}

function asBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new Error(`AWS Staging ${label} returned invalid bytes`);
}

function decodeUtf8(value, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(asBuffer(value, label));
  } catch {
    throw new Error(`AWS Staging ${label} must be valid UTF-8`);
  }
}

function trimSingleLine(value, label) {
  const line = decodeUtf8(value, label).trim();
  if (!line || /[\r\n]/.test(line)) {
    throw new Error(`AWS Staging ${label} must be one non-empty line`);
  }
  return line;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRevisionFromArgv(argv) {
  if (!Array.isArray(argv)) {
    throw new Error("AWS Staging runtime approval arguments are invalid");
  }
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--source-revision") values.push(argv[index + 1]);
  }
  if (values.length !== 1 || typeof values[0] !== "string" || !FULL_GIT_REVISION.test(values[0])) {
    throw new Error("AWS Staging requires exactly one full lower-case --source-revision approval");
  }
  return values[0];
}

function requireSafeOwnedNode(stat, label, expectedKind) {
  const kindMatches = expectedKind === "file" ? stat?.isFile?.() : stat?.isDirectory?.();
  if (!kindMatches || stat.isSymbolicLink?.()) {
    throw new Error(`AWS Staging runtime ${label} must be a real ${expectedKind}`);
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`AWS Staging runtime ${label} must be owned by the current OS user`);
  }
  if ((stat.mode & 0o022) !== 0) {
    throw new Error(`AWS Staging runtime ${label} must not be group- or world-writable`);
  }
}

function fileIdentity(stat, realPath) {
  return Object.freeze({
    realPath,
    device: String(stat.dev),
    inode: String(stat.ino),
    owner: String(stat.uid),
    group: String(stat.gid),
    mode: stat.mode & 0o777,
    size: String(stat.size),
    modified: String(stat.mtimeMs),
    changed: String(stat.ctimeMs)
  });
}

function directoryIdentity(stat, realPath) {
  return Object.freeze({
    realPath,
    device: String(stat.dev),
    inode: String(stat.ino),
    owner: String(stat.uid),
    group: String(stat.gid),
    mode: stat.mode & 0o777
  });
}

function requireSameIdentity(expected, actual, label) {
  if (Object.keys(expected).some((key) => expected[key] !== actual[key])) {
    throw new Error(`AWS Staging runtime ${label} identity changed after approval`);
  }
}

async function captureDirectory(fileSystem, directoryPath, label) {
  const stat = await fileSystem.lstat(directoryPath);
  requireSafeOwnedNode(stat, label, "directory");
  const realPath = await fileSystem.realpath(directoryPath);
  if (realPath !== directoryPath) {
    throw new Error(`AWS Staging runtime ${label} must not resolve through a symlink`);
  }
  return directoryIdentity(stat, realPath);
}

async function readStableFile(fileSystem, absolutePath, label) {
  const pathStat = await fileSystem.lstat(absolutePath);
  requireSafeOwnedNode(pathStat, label, "file");
  const realPath = await fileSystem.realpath(absolutePath);
  if (realPath !== absolutePath) {
    throw new Error(`AWS Staging runtime ${label} must not be a symlink`);
  }
  const handle = await fileSystem.open(
    absolutePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = await handle.stat();
    requireSafeOwnedNode(before, label, "file");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    requireSafeOwnedNode(after, label, "file");
    const beforeIdentity = fileIdentity(before, realPath);
    const afterIdentity = fileIdentity(after, realPath);
    requireSameIdentity(beforeIdentity, afterIdentity, label);
    return Object.freeze({ bytes, identity: afterIdentity });
  } finally {
    await handle.close();
  }
}

function manifestDigest(sourceRevision, entries) {
  const lines = [
    "needo-aws-staging-runtime-manifest-v1",
    sourceRevision,
    ...entries.map(({ relativePath, gitMode, byteLength, digest }) => (
      `${relativePath}\0${gitMode}\0${byteLength}\0${digest}`
    ))
  ];
  return sha256(Buffer.from(lines.join("\n"), "utf8"));
}

function requireGitFileMode(value, relativePath, label) {
  const line = trimSingleLine(value, `${label} mode for ${relativePath}`);
  const match = /^(100644) (?:[a-z]+ )?[0-9a-f]{40,64}(?: 0)?\t(.+)$/.exec(line);
  if (!match || match[2] !== relativePath) {
    throw new Error(`AWS Staging runtime ${label} mode for ${relativePath} must be 100644`);
  }
  return match[1];
}

function requirePackageEntrypoints(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(decodeUtf8(bytes, "runtime package.json"));
  } catch {
    throw new Error("AWS Staging runtime package.json must be valid JSON");
  }
  const expected = {
    "aws:staging:bootstrap-host": "node scripts/aws-staging-bootstrap-host.mjs",
    "aws:staging:deploy": "node scripts/aws-staging-deploy.mjs",
    "aws:staging:preflight": "node scripts/aws-staging-preflight.mjs",
    "aws:staging:verify": "node scripts/aws-staging-verify.mjs"
  };
  for (const [name, command] of Object.entries(expected)) {
    if (parsed?.scripts?.[name] !== command
      || parsed?.scripts?.[`pre${name}`] !== undefined
      || parsed?.scripts?.[`post${name}`] !== undefined) {
      throw new Error(`AWS Staging runtime package script ${name} is not the approved direct entrypoint`);
    }
  }
}

function requireStaticModuleClosure(records) {
  const allowlist = new Set(AWS_STAGING_RUNTIME_FILES);
  for (const record of records.filter(({ relativePath }) => relativePath.endsWith(".mjs"))) {
    const source = decodeUtf8(record.committedBytes, `runtime module ${record.relativePath}`);
    if (/\bimport\s*\(|\bcreateRequire\b|\bmodule\s*\.\s*register\b|\bregisterHooks\b|\bnew\s+Worker\b|\brequire\s*\(/.test(source)) {
      throw new Error(`AWS Staging runtime module ${record.relativePath} uses an unapproved loader`);
    }
    for (const match of source.matchAll(
      /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g
    )) {
      const specifier = match[1];
      if (specifier.startsWith("node:")) continue;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw new Error(`AWS Staging runtime module ${record.relativePath} has a bare import`);
      }
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(record.relativePath), specifier)
      );
      if (!allowlist.has(dependency)) {
        throw new Error(`AWS Staging runtime module ${record.relativePath} imports an unbound file`);
      }
    }
  }
}

export function requireAwsStagingRuntimeArtifact(runtimeArtifact, expectedSourceRevision) {
  if (!runtimeArtifact
    || typeof runtimeArtifact !== "object"
    || !Object.isFrozen(runtimeArtifact)
    || typeof runtimeArtifact.runtimeSourceRevision !== "string"
    || !FULL_GIT_REVISION.test(runtimeArtifact.runtimeSourceRevision)
    || typeof runtimeArtifact.runtimeManifestSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(runtimeArtifact.runtimeManifestSha256)
    || typeof runtimeArtifact.runtimeEntrypoint !== "string"
    || !AWS_STAGING_ENTRYPOINTS.has(runtimeArtifact.runtimeEntrypoint)
    || typeof runtimeArtifact.assertCurrentState !== "function") {
    throw new Error("AWS Staging requires an immutable approved runtime artifact");
  }
  if (expectedSourceRevision !== undefined
    && runtimeArtifact.runtimeSourceRevision !== expectedSourceRevision) {
    throw new Error("AWS Staging runtime revision does not match the approved source revision");
  }
  return runtimeArtifact;
}

export async function captureAwsStagingRuntimeArtifact({
  argv,
  entrypointPath,
  repositoryRoot = defaultRepositoryRoot,
  runGit = runSystemGit,
  fileSystem = fs
}) {
  const approvedRevision = sourceRevisionFromArgv(argv);
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) {
    throw new Error("AWS Staging runtime repository root must be absolute");
  }
  if (typeof entrypointPath !== "string" || !path.isAbsolute(entrypointPath)) {
    throw new Error("AWS Staging runtime entrypoint path must be absolute");
  }
  if (typeof runGit !== "function") {
    throw new Error("AWS Staging runtime artifact requires an injected command runner");
  }

  const canonicalRepositoryRoot = await fileSystem.realpath(repositoryRoot);
  const reportedRoot = trimSingleLine(
    await runGit(["rev-parse", "--show-toplevel"], { cwd: canonicalRepositoryRoot }),
    "runtime Git repository root"
  );
  if (await fileSystem.realpath(reportedRoot) !== canonicalRepositoryRoot) {
    throw new Error("AWS Staging runtime repository root does not match the approved worktree");
  }

  const canonicalEntrypoint = await fileSystem.realpath(entrypointPath);
  const relativeEntrypoint = path.relative(canonicalRepositoryRoot, canonicalEntrypoint)
    .split(path.sep).join("/");
  if (!AWS_STAGING_ENTRYPOINTS.has(relativeEntrypoint)
    || canonicalEntrypoint !== path.join(canonicalRepositoryRoot, relativeEntrypoint)) {
    throw new Error("AWS Staging runtime entrypoint is not an approved guarded command");
  }

  const sourceRevision = trimSingleLine(
    await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: canonicalRepositoryRoot
    }),
    "runtime source revision"
  );
  if (!FULL_GIT_REVISION.test(sourceRevision) || sourceRevision !== approvedRevision) {
    throw new Error("AWS Staging runtime source revision does not match the action-time approval");
  }

  const statusArgs = [
    "status", "--porcelain=v1", "--untracked-files=all", "--",
    ...AWS_STAGING_RUNTIME_FILES
  ];
  if (decodeUtf8(
    await runGit(statusArgs, { cwd: canonicalRepositoryRoot }),
    "runtime status"
  ) !== "") {
    throw new Error("AWS Staging approved runtime closure must be clean without tracked or untracked drift");
  }

  const directoryRecords = [
    ["repository root", await captureDirectory(fileSystem, canonicalRepositoryRoot, "repository root")],
    ["scripts directory", await captureDirectory(
      fileSystem, path.join(canonicalRepositoryRoot, "scripts"), "scripts directory"
    )]
  ];
  const records = [];
  for (const relativePath of AWS_STAGING_RUNTIME_FILES) {
    const committedMode = requireGitFileMode(
      await runGit(["ls-tree", "--full-tree", sourceRevision, "--", relativePath], {
        cwd: canonicalRepositoryRoot
      }),
      relativePath,
      "committed"
    );
    const indexedMode = requireGitFileMode(
      await runGit(["ls-files", "--stage", "--", relativePath], {
        cwd: canonicalRepositoryRoot
      }),
      relativePath,
      "index"
    );
    if (indexedMode !== committedMode) {
      throw new Error(`AWS Staging runtime index mode for ${relativePath} differs from the approved revision`);
    }
    const committedBytes = asBuffer(
      await runGit(["show", `${sourceRevision}:${relativePath}`], {
        cwd: canonicalRepositoryRoot
      }),
      `committed runtime file ${relativePath}`
    );
    const indexedBytes = asBuffer(
      await runGit(["show", `:${relativePath}`], { cwd: canonicalRepositoryRoot }),
      `indexed runtime file ${relativePath}`
    );
    if (!indexedBytes.equals(committedBytes)) {
      throw new Error(`AWS Staging runtime index for ${relativePath} differs from the approved revision`);
    }
    const absolutePath = path.join(canonicalRepositoryRoot, relativePath);
    const current = await readStableFile(fileSystem, absolutePath, relativePath);
    if (!current.bytes.equals(committedBytes)) {
      throw new Error(`AWS Staging runtime bytes for ${relativePath} differ from the approved revision`);
    }
    records.push(Object.freeze({
      absolutePath,
      relativePath,
      committedBytes,
      identity: current.identity,
      digest: sha256(committedBytes),
      gitMode: committedMode,
      byteLength: committedBytes.length
    }));
  }
  requirePackageEntrypoints(
    records.find(({ relativePath }) => relativePath === "package.json").committedBytes
  );
  requireStaticModuleClosure(records);
  const runtimeManifestSha256 = manifestDigest(sourceRevision, records);

  async function assertCurrentState() {
    const currentRevision = trimSingleLine(
      await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
        cwd: canonicalRepositoryRoot
      }),
      "runtime source revision"
    );
    if (currentRevision !== sourceRevision) {
      throw new Error("AWS Staging runtime source revision changed after approval");
    }
    if (decodeUtf8(
      await runGit(statusArgs, { cwd: canonicalRepositoryRoot }),
      "runtime status"
    ) !== "") {
      throw new Error("AWS Staging approved runtime closure became dirty after approval");
    }
    for (const [label, expectedIdentity] of directoryRecords) {
      const currentIdentity = await captureDirectory(
        fileSystem, expectedIdentity.realPath, label
      );
      requireSameIdentity(expectedIdentity, currentIdentity, label);
    }
    for (const record of records) {
      const currentIndexedMode = requireGitFileMode(
        await runGit(["ls-files", "--stage", "--", record.relativePath], {
          cwd: canonicalRepositoryRoot
        }),
        record.relativePath,
        "index"
      );
      if (currentIndexedMode !== record.gitMode) {
        throw new Error(`AWS Staging runtime index mode for ${record.relativePath} changed after approval`);
      }
      const currentIndexedBytes = asBuffer(
        await runGit(["show", `:${record.relativePath}`], { cwd: canonicalRepositoryRoot }),
        `indexed runtime file ${record.relativePath}`
      );
      if (!currentIndexedBytes.equals(record.committedBytes)) {
        throw new Error(`AWS Staging runtime index for ${record.relativePath} changed after approval`);
      }
      const current = await readStableFile(fileSystem, record.absolutePath, record.relativePath);
      requireSameIdentity(record.identity, current.identity, record.relativePath);
      if (!current.bytes.equals(record.committedBytes)
        || sha256(current.bytes) !== record.digest) {
        throw new Error(`AWS Staging runtime bytes for ${record.relativePath} changed after approval`);
      }
    }
  }

  await assertCurrentState();

  return Object.freeze({
    runtimeSourceRevision: sourceRevision,
    runtimeManifestSha256,
    runtimeEntrypoint: relativeEntrypoint,
    assertCurrentState
  });
}
