import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  AWS_STAGING_LAUNCHER_RUNTIME_FILES,
  createAwsStagingRuntimeManifestSha256,
  requireAwsStagingStaticModuleClosure
} from "./aws-staging-launcher.mjs";

const execFileAsync = promisify(execFile);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = path.resolve(moduleDir, "..");
const FULL_GIT_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const LAUNCH_CONTEXT_NAME = ".needo-aws-staging-launch-context.json";

export const AWS_STAGING_RUNTIME_FILES = AWS_STAGING_LAUNCHER_RUNTIME_FILES;

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
      GIT_NO_LAZY_FETCH: "1",
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
  if (typeof process.getuid === "function"
    && stat.uid !== process.getuid()
    && stat.uid !== 0) {
    throw new Error(`AWS Staging runtime ${label} has an untrusted owner`);
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
  for (const command of ["bootstrap-host", "deploy", "preflight", "verify"]) {
    const name = `aws:staging:${command}`;
    if (Object.hasOwn(parsed?.scripts ?? {}, name)
      || Object.hasOwn(parsed?.scripts ?? {}, `pre${name}`)
      || Object.hasOwn(parsed?.scripts ?? {}, `post${name}`)) {
      throw new Error("AWS Staging runtime must not expose live npm lifecycle entrypoints");
    }
  }
}

async function captureLaunchContext(fileSystem, launchContextPath, canonicalRepositoryRoot) {
  if (typeof launchContextPath !== "string" || !path.isAbsolute(launchContextPath)) {
    throw new Error("AWS Staging runtime requires a sealed trusted-launcher context");
  }
  if (launchContextPath !== path.join(canonicalRepositoryRoot, LAUNCH_CONTEXT_NAME)) {
    throw new Error("AWS Staging runtime launch context is outside the sealed snapshot");
  }
  const current = await readStableFile(fileSystem, launchContextPath, "launch context");
  if (current.identity.mode !== 0o400) {
    throw new Error("AWS Staging runtime launch context must be sealed read-only");
  }
  let parsed;
  try {
    parsed = JSON.parse(decodeUtf8(current.bytes, "launch context"));
  } catch {
    throw new Error("AWS Staging runtime launch context must be valid JSON");
  }
  const expectedKeys = [
    "evidenceOutputDirectory",
    "runtimeEntrypoint",
    "runtimeManifestSha256",
    "runtimeSourceRevision",
    "snapshotRoot",
    "sourceRepositoryIdentity",
    "sourceRepositoryRoot",
    "version"
  ];
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(expectedKeys)
    || parsed.version !== 1
    || parsed.snapshotRoot !== canonicalRepositoryRoot
    || typeof parsed.sourceRepositoryRoot !== "string"
    || !path.isAbsolute(parsed.sourceRepositoryRoot)
    || typeof parsed.evidenceOutputDirectory !== "string"
    || parsed.evidenceOutputDirectory !== path.join(
      parsed.sourceRepositoryRoot,
      "outputs/aws-staging"
    )
    || !FULL_GIT_REVISION.test(parsed.runtimeSourceRevision)
    || !/^[0-9a-f]{64}$/.test(parsed.runtimeManifestSha256)
    || !AWS_STAGING_ENTRYPOINTS.has(parsed.runtimeEntrypoint)) {
    throw new Error("AWS Staging runtime launch context is invalid");
  }
  const canonicalSourceRoot = await fileSystem.realpath(parsed.sourceRepositoryRoot);
  if (canonicalSourceRoot !== parsed.sourceRepositoryRoot) {
    throw new Error("AWS Staging runtime source root must be canonical");
  }
  const expectedIdentityKeys = [
    "device", "group", "inode", "mode", "owner", "realPath"
  ];
  const sourceRepositoryIdentity = parsed.sourceRepositoryIdentity;
  if (!sourceRepositoryIdentity
    || typeof sourceRepositoryIdentity !== "object"
    || JSON.stringify(Object.keys(sourceRepositoryIdentity).sort())
      !== JSON.stringify(expectedIdentityKeys)
    || sourceRepositoryIdentity.realPath !== canonicalSourceRoot
    || !["device", "group", "inode", "owner"].every((key) => (
      typeof sourceRepositoryIdentity[key] === "string"
      && /^\d+$/.test(sourceRepositoryIdentity[key])
    ))
    || !Number.isInteger(sourceRepositoryIdentity.mode)
    || sourceRepositoryIdentity.mode < 0
    || sourceRepositoryIdentity.mode > 0o777) {
    throw new Error("AWS Staging runtime source-root identity is invalid");
  }
  const frozenSourceIdentity = Object.freeze({ ...sourceRepositoryIdentity });
  requireSameIdentity(
    frozenSourceIdentity,
    await captureDirectory(fileSystem, canonicalSourceRoot, "evidence source root"),
    "evidence source root"
  );
  return Object.freeze({
    bytes: current.bytes,
    evidenceOutputDirectory: parsed.evidenceOutputDirectory,
    identity: current.identity,
    runtimeEntrypoint: parsed.runtimeEntrypoint,
    runtimeManifestSha256: parsed.runtimeManifestSha256,
    runtimeSourceRevision: parsed.runtimeSourceRevision,
    sourceRepositoryIdentity: frozenSourceIdentity,
    sourceRepositoryRoot: canonicalSourceRoot
  });
}

export function requireAwsStagingRuntimeArtifact(runtimeArtifact, expectedSourceRevision) {
  const evidenceBoundaryFields = [
    runtimeArtifact?.evidenceOutputDirectory,
    runtimeArtifact?.evidenceTrustedRoot,
    runtimeArtifact?.evidenceTrustedRootIdentity
  ];
  const hasEvidenceBoundary = evidenceBoundaryFields.some((value) => value !== undefined);
  const evidenceIdentity = runtimeArtifact?.evidenceTrustedRootIdentity;
  const expectedEvidenceIdentityKeys = [
    "device", "group", "inode", "mode", "owner", "realPath"
  ];
  if (!runtimeArtifact
    || typeof runtimeArtifact !== "object"
    || !Object.isFrozen(runtimeArtifact)
    || typeof runtimeArtifact.runtimeSourceRevision !== "string"
    || !FULL_GIT_REVISION.test(runtimeArtifact.runtimeSourceRevision)
    || typeof runtimeArtifact.runtimeManifestSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(runtimeArtifact.runtimeManifestSha256)
    || typeof runtimeArtifact.runtimeEntrypoint !== "string"
    || !AWS_STAGING_ENTRYPOINTS.has(runtimeArtifact.runtimeEntrypoint)
    || typeof runtimeArtifact.assertCurrentState !== "function"
    || (hasEvidenceBoundary && (
      typeof runtimeArtifact.evidenceOutputDirectory !== "string"
      || !path.isAbsolute(runtimeArtifact.evidenceOutputDirectory)
      || typeof runtimeArtifact.evidenceTrustedRoot !== "string"
      || !path.isAbsolute(runtimeArtifact.evidenceTrustedRoot)
      || !evidenceIdentity
      || typeof evidenceIdentity !== "object"
      || !Object.isFrozen(evidenceIdentity)
      || JSON.stringify(Object.keys(evidenceIdentity).sort())
        !== JSON.stringify(expectedEvidenceIdentityKeys)
      || evidenceIdentity.realPath !== runtimeArtifact.evidenceTrustedRoot
      || !["device", "group", "inode", "owner"].every((key) => (
        typeof evidenceIdentity[key] === "string" && /^\d+$/.test(evidenceIdentity[key])
      ))
      || !Number.isInteger(evidenceIdentity.mode)
      || evidenceIdentity.mode < 0
      || evidenceIdentity.mode > 0o777
      || (evidenceIdentity.mode & 0o022) !== 0
    ))) {
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
  fileSystem = fs,
  launchContextPath = process.env.NEEDO_AWS_STAGING_LAUNCH_CONTEXT
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
  const launchContext = await captureLaunchContext(
    fileSystem,
    launchContextPath,
    canonicalRepositoryRoot
  );
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
    || canonicalEntrypoint !== path.join(canonicalRepositoryRoot, relativeEntrypoint)
    || relativeEntrypoint !== launchContext.runtimeEntrypoint) {
    throw new Error("AWS Staging runtime entrypoint is not an approved guarded command");
  }

  const sourceRevision = trimSingleLine(
    await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: canonicalRepositoryRoot
    }),
    "runtime source revision"
  );
  if (!FULL_GIT_REVISION.test(sourceRevision)
    || sourceRevision !== approvedRevision
    || sourceRevision !== launchContext.runtimeSourceRevision) {
    throw new Error("AWS Staging runtime source revision does not match the action-time approval");
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
  requireAwsStagingStaticModuleClosure(records);
  const runtimeManifestSha256 = createAwsStagingRuntimeManifestSha256(
    sourceRevision,
    records
  );
  if (runtimeManifestSha256 !== launchContext.runtimeManifestSha256) {
    throw new Error("AWS Staging runtime manifest differs from the trusted launcher context");
  }

  async function assertCurrentState() {
    requireSameIdentity(
      launchContext.sourceRepositoryIdentity,
      await captureDirectory(
        fileSystem,
        launchContext.sourceRepositoryRoot,
        "evidence source root"
      ),
      "evidence source root"
    );
    const currentLaunchContext = await readStableFile(
      fileSystem,
      launchContextPath,
      "launch context"
    );
    requireSameIdentity(
      launchContext.identity,
      currentLaunchContext.identity,
      "launch context"
    );
    if (!currentLaunchContext.bytes.equals(launchContext.bytes)) {
      throw new Error("AWS Staging runtime launch context changed after approval");
    }
    const currentRevision = trimSingleLine(
      await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
        cwd: canonicalRepositoryRoot
      }),
      "runtime source revision"
    );
    if (currentRevision !== sourceRevision) {
      throw new Error("AWS Staging runtime source revision changed after approval");
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
    evidenceOutputDirectory: launchContext.evidenceOutputDirectory,
    evidenceTrustedRoot: launchContext.sourceRepositoryRoot,
    evidenceTrustedRootIdentity: launchContext.sourceRepositoryIdentity,
    runtimeSourceRevision: sourceRevision,
    runtimeManifestSha256,
    runtimeEntrypoint: relativeEntrypoint,
    assertCurrentState
  });
}
