import { execFile, spawn as spawnChild } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const FULL_GIT_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TEMPLATE_REPOSITORY_PATH = "deploy/aws-staging/cloudformation.yml";
const LAUNCH_CONTEXT_NAME = ".needo-aws-staging-launch-context.json";
const PRIVATE_NODE_EXECUTABLE_NAME = ".needo-node";
const MAX_NODE_EXECUTABLE_BYTES = 512 * 1024 * 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
const SEALED_DIRECTORY_MODE = 0o500;
const SEALED_FILE_MODE = 0o400;
const LOAD_KEYWORD = ["im", "port"].join("");
const PUBLISH_KEYWORD = ["ex", "port"].join("");

export const AWS_STAGING_LAUNCHER_RUNTIME_FILES = Object.freeze([
  "package.json",
  "scripts/aws-staging-attestation.mjs",
  "scripts/aws-staging-bootstrap-host-lib.mjs",
  "scripts/aws-staging-bootstrap-host.mjs",
  "scripts/aws-staging-cli.mjs",
  "scripts/aws-staging-config.mjs",
  "scripts/aws-staging-deploy-lib.mjs",
  "scripts/aws-staging-deploy.mjs",
  "scripts/aws-staging-launcher.mjs",
  "scripts/aws-staging-module-loader.mjs",
  "scripts/aws-staging-preflight-lib.mjs",
  "scripts/aws-staging-preflight.mjs",
  "scripts/aws-staging-runtime-artifact.mjs",
  "scripts/aws-staging-runtime-guard.mjs",
  "scripts/aws-staging-stack-contract.mjs",
  "scripts/aws-staging-template-artifact.mjs",
  "scripts/aws-staging-verify-lib.mjs",
  "scripts/aws-staging-verify.mjs"
]);

const AWS_STAGING_ENTRYPOINTS = Object.freeze({
  "bootstrap-host": "scripts/aws-staging-bootstrap-host.mjs",
  deploy: "scripts/aws-staging-deploy.mjs",
  preflight: "scripts/aws-staging-preflight.mjs",
  verify: "scripts/aws-staging-verify.mjs"
});

export const AWS_STAGING_APPROVED_BUILTIN_SPECIFIERS = Object.freeze([
  "node:child_process",
  "node:crypto",
  "node:dns/promises",
  "node:fs",
  "node:fs/promises",
  "node:net",
  "node:os",
  "node:path",
  "node:url",
  "node:util"
]);
const APPROVED_BUILTIN_SPECIFIERS = new Set(AWS_STAGING_APPROVED_BUILTIN_SPECIFIERS);

const APPROVED_NODE_CANDIDATES = Object.freeze([
  Object.freeze({ candidate: "/usr/local/bin/node", trustRoot: "/usr/local" }),
  Object.freeze({ candidate: "/usr/bin/node", trustRoot: "/usr" }),
  Object.freeze({ candidate: "/opt/homebrew/bin/node", trustRoot: "/opt/homebrew" })
]);

async function runSystemGit(args, { cwd }) {
  const { stdout } = await execFileAsync("/usr/bin/git", [
    "-c", "core.fsmonitor=false",
    "-c", "core.hooksPath=/dev/null",
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

function runtimeManifestSha256(sourceRevision, entries) {
  const lines = [
    "needo-aws-staging-runtime-manifest-v1",
    sourceRevision,
    ...entries.map(({ relativePath, gitMode, byteLength, digest }) => (
      `${relativePath}\0${gitMode}\0${byteLength}\0${digest}`
    ))
  ];
  return sha256(Buffer.from(lines.join("\n"), "utf8"));
}

export function createAwsStagingRuntimeManifestSha256(sourceRevision, entries) {
  if (!FULL_GIT_REVISION.test(sourceRevision)
    || !Array.isArray(entries)
    || entries.length !== AWS_STAGING_LAUNCHER_RUNTIME_FILES.length) {
    throw new Error("AWS Staging runtime manifest input is invalid");
  }
  return runtimeManifestSha256(sourceRevision, entries);
}

function requireGitFileMode(value, relativePath, label) {
  const line = trimSingleLine(value, `${label} mode for ${relativePath}`);
  const match = /^(100644) (?:[a-z]+ )?[0-9a-f]{40,64}(?: 0)?\t(.+)$/.exec(line);
  if (!match || match[2] !== relativePath) {
    throw new Error(`AWS Staging ${label} mode for ${relativePath} must be 100644`);
  }
  return match[1];
}

function markRange(mask, start, end) {
  mask.fill(" ", start, end);
}

function canonicalStaticDeclarations(source, relativePath) {
  const identifier = "[A-Za-z_$][A-Za-z0-9_$]*";
  const namedItem = `${identifier}(?:[\\t ]+as[\\t ]+${identifier})?`;
  const namedBindings = `\\{\\s*${namedItem}(?:\\s*,\\s*${namedItem})*\\s*,?\\s*\\}`;
  const declarationBinding = `(?:${identifier}|${namedBindings})`;
  const declarationPattern = new RegExp(
    `${LOAD_KEYWORD} (${declarationBinding}) from \"([^\"\\r\\n]+)\";`,
    "y"
  );
  const metaPattern = new RegExp(`\\b${LOAD_KEYWORD}\\.meta\\b`, "g");
  const publishedDeclarationPattern = new RegExp(
    `^${PUBLISH_KEYWORD} (?:async )?(?:function|const) ${identifier}`,
    "gm"
  );
  const remainingKeywordPattern = new RegExp(
    `\\b(?:${LOAD_KEYWORD}|${PUBLISH_KEYWORD})\\b`,
    "g"
  );
  const mask = source.split("");
  const dependencies = [];

  let declarationCursor = 0;
  while (source[declarationCursor] === "\n") declarationCursor += 1;
  for (;;) {
    declarationPattern.lastIndex = declarationCursor;
    const match = declarationPattern.exec(source);
    if (!match) break;
    const declarationEnd = declarationCursor + match[0].length;
    if (declarationEnd < source.length && source[declarationEnd] !== "\n") break;
    dependencies.push(match[2]);
    markRange(mask, declarationCursor, declarationEnd);
    declarationCursor = declarationEnd;
    while (source[declarationCursor] === "\n") declarationCursor += 1;
  }
  for (const match of source.matchAll(metaPattern)) {
    markRange(mask, match.index, match.index + match[0].length);
  }
  for (const match of source.matchAll(publishedDeclarationPattern)) {
    markRange(mask, match.index, match.index + PUBLISH_KEYWORD.length);
  }

  const remaining = mask.join("");
  if (remainingKeywordPattern.test(remaining)) {
    throw new Error(`AWS Staging runtime module ${relativePath} uses noncanonical module syntax`);
  }
  return dependencies;
}

export function requireAwsStagingStaticModuleClosure(records) {
  if (!Array.isArray(records)) {
    throw new Error("AWS Staging runtime module records are invalid");
  }
  const allowlist = new Set(AWS_STAGING_LAUNCHER_RUNTIME_FILES);
  const evaluator = ["ev", "al"].join("");
  const functionConstructor = ["Func", "tion"].join("");
  const commonJsLoader = ["requ", "ire"].join("");
  const createCommonJsLoader = ["create", "Require"].join("");
  const builtinLookup = ["getBuiltin", "Module"].join("");
  const workerConstructor = ["Wor", "ker"].join("");
  const moduleRegistration = ["reg", "ister"].join("");
  const processBindingLookup = ["bind", "ing"].join("");
  const nativeLibraryLookup = ["dl", "open"].join("");
  for (const record of records.filter(({ relativePath }) => relativePath.endsWith(".mjs"))) {
    const source = decodeUtf8(record.committedBytes, `runtime module ${record.relativePath}`);
    const isRuntimeGuard = record.relativePath === "scripts/aws-staging-runtime-guard.mjs";
    const forbiddenLoaderNamePattern = new RegExp(`\\b(?:${[
      evaluator,
      functionConstructor,
      commonJsLoader,
      createCommonJsLoader,
      builtinLookup,
      workerConstructor,
      ...(isRuntimeGuard ? [] : [moduleRegistration, `${moduleRegistration}Hooks`]),
      processBindingLookup,
      nativeLibraryLookup
    ].join("|")})\\b`);
    if (source.includes(String.fromCharCode(92) + "u")
      || forbiddenLoaderNamePattern.test(source)) {
      throw new Error(`AWS Staging runtime module ${record.relativePath} uses an unapproved loader`);
    }
    for (const specifier of canonicalStaticDeclarations(source, record.relativePath)) {
      if (specifier === "node:module" && isRuntimeGuard) continue;
      if (APPROVED_BUILTIN_SPECIFIERS.has(specifier)) continue;
      if (record.relativePath === "scripts/aws-staging-launcher.mjs") {
        throw new Error("AWS Staging pre-ESM launcher must remain self-contained");
      }
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        throw new Error(`AWS Staging runtime module ${record.relativePath} has an unapproved dependency`);
      }
      if (specifier.includes("?") || specifier.includes("#")) {
        throw new Error(`AWS Staging runtime module ${record.relativePath} has an unapproved dependency suffix`);
      }
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(record.relativePath), specifier)
      );
      if (!allowlist.has(dependency)) {
        throw new Error(`AWS Staging runtime module ${record.relativePath} references an unbound file`);
      }
    }
  }
}

function requirePackageHasNoLiveEntrypoints(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(decodeUtf8(bytes, "runtime package.json"));
  } catch {
    throw new Error("AWS Staging runtime package.json must be valid JSON");
  }
  for (const name of Object.keys(AWS_STAGING_ENTRYPOINTS).map((command) => (
    `aws:staging:${command}`
  ))) {
    if (Object.hasOwn(parsed?.scripts ?? {}, name)
      || Object.hasOwn(parsed?.scripts ?? {}, `pre${name}`)
      || Object.hasOwn(parsed?.scripts ?? {}, `post${name}`)) {
      throw new Error("AWS Staging live commands must not use mutable npm lifecycle scripts");
    }
  }
}

function requireOwnedSafeNode(stat, label, expectedKind) {
  const matches = expectedKind === "file" ? stat?.isFile?.() : stat?.isDirectory?.();
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (!matches || stat.isSymbolicLink?.()) {
    throw new Error(`AWS Staging launcher ${label} must be a real ${expectedKind}`);
  }
  if (uid !== undefined && stat.uid !== uid && stat.uid !== 0) {
    throw new Error(`AWS Staging launcher ${label} has an untrusted owner`);
  }
  if ((stat.mode & 0o022) !== 0) {
    throw new Error(`AWS Staging launcher ${label} must not be group- or world-writable`);
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
    throw new Error(`AWS Staging launcher ${label} identity changed after approval`);
  }
}

async function captureDirectory(fileSystem, directoryPath, label) {
  const stat = await fileSystem.lstat(directoryPath);
  requireOwnedSafeNode(stat, label, "directory");
  const realPath = await fileSystem.realpath(directoryPath);
  if (realPath !== directoryPath) {
    throw new Error(`AWS Staging launcher ${label} must not resolve through a symlink`);
  }
  return directoryIdentity(stat, realPath);
}

async function readStableFile(fileSystem, absolutePath, label) {
  const pathStat = await fileSystem.lstat(absolutePath);
  requireOwnedSafeNode(pathStat, label, "file");
  const realPath = await fileSystem.realpath(absolutePath);
  if (realPath !== absolutePath) {
    throw new Error(`AWS Staging launcher ${label} must not be a symlink`);
  }
  const handle = await fileSystem.open(
    absolutePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = await handle.stat();
    requireOwnedSafeNode(before, label, "file");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    requireOwnedSafeNode(after, label, "file");
    const beforeIdentity = fileIdentity(before, realPath);
    const afterIdentity = fileIdentity(after, realPath);
    requireSameIdentity(beforeIdentity, afterIdentity, label);
    return Object.freeze({ bytes, identity: afterIdentity });
  } finally {
    await handle.close();
  }
}

function sameBigIntStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function executableIdentity(stat) {
  return Object.freeze({
    changedNanoseconds: String(stat.ctimeNs),
    device: String(stat.dev),
    group: String(stat.gid),
    inode: String(stat.ino),
    links: String(stat.nlink),
    mode: Number(stat.mode & 0o777n),
    modifiedNanoseconds: String(stat.mtimeNs),
    owner: String(stat.uid),
    size: String(stat.size)
  });
}

async function hashOpenFile(handle, size) {
  if (size <= 0n || size > BigInt(MAX_NODE_EXECUTABLE_BYTES)) {
    throw new Error("AWS Staging launcher Node executable size is invalid");
  }
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let position = 0;
  for (;;) {
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
  }
  if (BigInt(position) !== size) {
    throw new Error("AWS Staging launcher Node executable size changed while hashing");
  }
  return hash.digest("hex");
}

async function openFingerprintedExecutable(fileSystem, executablePath, {
  expectedMode,
  requireSingleLink = false
} = {}) {
  const handle = await fileSystem.open(
    executablePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = await handle.stat({ bigint: true });
    const uid = typeof process.getuid === "function" ? BigInt(process.getuid()) : before.uid;
    if (!before.isFile()
      || (before.uid !== 0n && before.uid !== uid)
      || (before.mode & 0o022n) !== 0n
      || (expectedMode !== undefined && Number(before.mode & 0o777n) !== expectedMode)
      || (requireSingleLink && before.nlink !== 1n)) {
      throw new Error("AWS Staging launcher Node executable trust check failed");
    }
    await fileSystem.access(executablePath, fsConstants.X_OK);
    const digest = await hashOpenFile(handle, before.size);
    const after = await handle.stat({ bigint: true });
    if (!sameBigIntStat(before, after)) {
      throw new Error("AWS Staging launcher Node executable changed while inspected");
    }
    return Object.freeze({ digest, handle, metadata: after });
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function fingerprintExecutable(fileSystem, executablePath, options) {
  const fingerprint = await openFingerprintedExecutable(
    fileSystem,
    executablePath,
    options
  );
  try {
    return Object.freeze({
      digest: fingerprint.digest,
      metadata: fingerprint.metadata
    });
  } finally {
    await fingerprint.handle.close();
  }
}

async function requireTrustedDirectoryChain(fileSystem, directoryPath, trustRoot) {
  let current = directoryPath;
  for (;;) {
    const stat = await fileSystem.lstat(current);
    requireOwnedSafeNode(stat, "Node executable directory", "directory");
    if (await fileSystem.realpath(current) !== current) {
      throw new Error("AWS Staging launcher Node executable directory must be canonical");
    }
    if (current === trustRoot) return;
    const parent = path.dirname(current);
    if (parent === current || path.relative(trustRoot, parent).startsWith("..")) {
      throw new Error("AWS Staging launcher Node executable escaped its approved root");
    }
    current = parent;
  }
}

export function assertAwsStagingNodeRuntime(releaseName, version) {
  if (releaseName !== "node"
    || !/^\d+\.\d+\.\d+$/.test(version ?? "")
    || Number(version.split(".")[0]) !== 22) {
    throw new Error("AWS Staging launcher requires Node.js 22");
  }
}

function readCurrentNodeRuntime() {
  return Object.freeze({
    releaseName: process.release?.name,
    version: process.versions?.node
  });
}

async function captureTrustedNode(fileSystem, candidates, readNodeRuntime) {
  const runningPath = await fileSystem.realpath(process.execPath);
  for (const { candidate, trustRoot } of candidates) {
    try {
      if (await fileSystem.realpath(candidate) !== candidate || runningPath !== candidate) continue;
      const canonicalTrustRoot = await fileSystem.realpath(trustRoot);
      if (canonicalTrustRoot !== trustRoot) continue;
      await requireTrustedDirectoryChain(
        fileSystem,
        path.dirname(candidate),
        canonicalTrustRoot
      );
      const fingerprint = await openFingerprintedExecutable(fileSystem, candidate);
      try {
        const runtime = await readNodeRuntime();
        assertAwsStagingNodeRuntime(runtime?.releaseName, runtime?.version);
        return Object.freeze({
          sourceExecutablePath: candidate,
          trustRoot: canonicalTrustRoot,
          ...fingerprint
        });
      } catch (error) {
        await fingerprint.handle.close();
        throw error;
      }
    } catch {
      // Continue only through the explicit system installation candidates.
    }
  }
  throw new Error("AWS Staging launcher did not start under an approved absolute Node.js 22 executable");
}

function parseLaunchArguments(argv) {
  if (!Array.isArray(argv) || typeof argv[0] !== "string") {
    throw new Error("AWS Staging launcher arguments are invalid");
  }
  const runtimeEntrypoint = AWS_STAGING_ENTRYPOINTS[argv[0]];
  if (!runtimeEntrypoint) {
    throw new Error("AWS Staging launcher command is not approved");
  }
  const commandArguments = argv.slice(1);
  const sourceRevisions = [];
  for (let index = 0; index < commandArguments.length; index += 1) {
    if (commandArguments[index] === "--source-revision") {
      sourceRevisions.push(commandArguments[index + 1]);
    }
  }
  if (sourceRevisions.length !== 1
    || typeof sourceRevisions[0] !== "string"
    || !FULL_GIT_REVISION.test(sourceRevisions[0])) {
    throw new Error("AWS Staging launcher requires one full lower-case source revision");
  }
  return Object.freeze({
    commandArguments: Object.freeze(commandArguments),
    runtimeEntrypoint,
    sourceRevision: sourceRevisions[0]
  });
}

async function captureApprovedSource({
  fileSystem,
  repositoryRoot,
  runGit,
  sourceRevision
}) {
  const canonicalRepositoryRoot = await fileSystem.realpath(repositoryRoot);
  if (canonicalRepositoryRoot !== path.resolve(repositoryRoot)) {
    throw new Error("AWS Staging launcher repository root must be canonical");
  }
  const reportedRoot = trimSingleLine(
    await runGit(["rev-parse", "--show-toplevel"], { cwd: canonicalRepositoryRoot }),
    "launcher Git repository root"
  );
  if (await fileSystem.realpath(reportedRoot) !== canonicalRepositoryRoot) {
    throw new Error("AWS Staging launcher repository root does not match the approved worktree");
  }
  const currentRevision = trimSingleLine(
    await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: canonicalRepositoryRoot
    }),
    "launcher source revision"
  );
  if (currentRevision !== sourceRevision) {
    throw new Error("AWS Staging launcher source revision does not match the action-time approval");
  }

  const allPaths = [...AWS_STAGING_LAUNCHER_RUNTIME_FILES, TEMPLATE_REPOSITORY_PATH];
  const directoryRecords = [];
  for (const [label, relativePath] of [
    ["repository root", ""],
    ["scripts directory", "scripts"],
    ["template directory", "deploy/aws-staging"]
  ]) {
    directoryRecords.push(Object.freeze({
      label,
      identity: await captureDirectory(
        fileSystem,
        path.join(canonicalRepositoryRoot, relativePath),
        label
      )
    }));
  }

  const records = [];
  for (const relativePath of allPaths) {
    const gitMode = requireGitFileMode(
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
    if (indexedMode !== gitMode) {
      throw new Error(`AWS Staging launcher index mode for ${relativePath} differs from approval`);
    }
    const committedBytes = asBuffer(
      await runGit(["show", `${sourceRevision}:${relativePath}`], {
        cwd: canonicalRepositoryRoot
      }),
      `committed launcher file ${relativePath}`
    );
    const indexedBytes = asBuffer(
      await runGit(["show", `:${relativePath}`], { cwd: canonicalRepositoryRoot }),
      `indexed launcher file ${relativePath}`
    );
    if (!indexedBytes.equals(committedBytes)) {
      throw new Error(`AWS Staging launcher index for ${relativePath} differs from approval`);
    }
    const absolutePath = path.join(canonicalRepositoryRoot, relativePath);
    const current = await readStableFile(fileSystem, absolutePath, relativePath);
    if (!current.bytes.equals(committedBytes)) {
      throw new Error(`AWS Staging launcher bytes for ${relativePath} differ from approval`);
    }
    records.push(Object.freeze({
      absolutePath,
      byteLength: committedBytes.length,
      committedBytes,
      digest: sha256(committedBytes),
      gitMode,
      identity: current.identity,
      relativePath
    }));
  }

  const runtimeRecords = records.slice(0, AWS_STAGING_LAUNCHER_RUNTIME_FILES.length);
  requirePackageHasNoLiveEntrypoints(runtimeRecords[0].committedBytes);
  requireAwsStagingStaticModuleClosure(runtimeRecords);
  const manifestSha256 = runtimeManifestSha256(sourceRevision, runtimeRecords);

  async function assertCurrentState() {
    const revision = trimSingleLine(
      await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
        cwd: canonicalRepositoryRoot
      }),
      "launcher source revision"
    );
    if (revision !== sourceRevision) {
      throw new Error("AWS Staging launcher source revision changed after approval");
    }
    for (const { label, identity } of directoryRecords) {
      requireSameIdentity(
        identity,
        await captureDirectory(fileSystem, identity.realPath, label),
        label
      );
    }
    for (const record of records) {
      const indexedMode = requireGitFileMode(
        await runGit(["ls-files", "--stage", "--", record.relativePath], {
          cwd: canonicalRepositoryRoot
        }),
        record.relativePath,
        "index"
      );
      if (indexedMode !== record.gitMode) {
        throw new Error(`AWS Staging launcher index mode for ${record.relativePath} changed after approval`);
      }
      const indexedBytes = asBuffer(
        await runGit(["show", `:${record.relativePath}`], { cwd: canonicalRepositoryRoot }),
        `indexed launcher file ${record.relativePath}`
      );
      if (!indexedBytes.equals(record.committedBytes)) {
        throw new Error(`AWS Staging launcher index for ${record.relativePath} changed after approval`);
      }
      const current = await readStableFile(fileSystem, record.absolutePath, record.relativePath);
      requireSameIdentity(record.identity, current.identity, record.relativePath);
      if (!current.bytes.equals(record.committedBytes)) {
        throw new Error(`AWS Staging launcher bytes for ${record.relativePath} changed after approval`);
      }
    }
  }

  return Object.freeze({
    assertCurrentState,
    canonicalRepositoryRoot,
    manifestSha256,
    records: Object.freeze(records),
    runtimeRecords: Object.freeze(runtimeRecords),
    sourceRepositoryIdentity: directoryRecords.find(({ label }) => (
      label === "repository root"
    )).identity
  });
}

async function ensurePrivateTemporaryRoot(fileSystem, temporaryRoot) {
  const canonicalRoot = await fileSystem.realpath(temporaryRoot);
  const stat = await fileSystem.lstat(canonicalRoot);
  const mode = stat.mode & 0o7777;
  if (!stat.isDirectory()
    || stat.isSymbolicLink()
    || ((mode & 0o002) !== 0 && (mode & 0o1000) === 0)) {
    throw new Error("AWS Staging launcher temporary root is unsafe");
  }
  return canonicalRoot;
}

async function writeSnapshotFile(fileSystem, snapshotRoot, record) {
  const destination = path.join(snapshotRoot, record.relativePath);
  await fileSystem.mkdir(path.dirname(destination), {
    mode: PRIVATE_DIRECTORY_MODE,
    recursive: true
  });
  await fileSystem.writeFile(destination, record.committedBytes, {
    flag: "wx",
    mode: 0o600
  });
}

async function copyTrustedNodeFromHandle({
  destinationPath,
  fileSystem,
  trustedNode
}) {
  const before = await trustedNode.handle.stat({ bigint: true });
  if (!sameBigIntStat(before, trustedNode.metadata)) {
    throw new Error("AWS Staging launcher trusted Node handle changed before copying");
  }
  const destinationHandle = await fileSystem.open(
    destinationPath,
    fsConstants.O_WRONLY
      | fsConstants.O_CREAT
      | fsConstants.O_EXCL
      | fsConstants.O_NOFOLLOW,
    0o600
  );
  try {
    const digest = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    for (;;) {
      const { bytesRead } = await trustedNode.handle.read(
        buffer,
        0,
        buffer.length,
        position
      );
      if (bytesRead === 0) break;
      digest.update(buffer.subarray(0, bytesRead));
      let offset = 0;
      while (offset < bytesRead) {
        const { bytesWritten } = await destinationHandle.write(
          buffer,
          offset,
          bytesRead - offset,
          position + offset
        );
        if (!Number.isInteger(bytesWritten) || bytesWritten <= 0) {
          throw new Error("AWS Staging launcher trusted Node copy was incomplete");
        }
        offset += bytesWritten;
      }
      position += bytesRead;
    }
    const after = await trustedNode.handle.stat({ bigint: true });
    const destination = await destinationHandle.stat({ bigint: true });
    if (!sameBigIntStat(before, after)
      || BigInt(position) !== before.size
      || digest.digest("hex") !== trustedNode.digest
      || !destination.isFile()
      || destination.nlink !== 1n
      || destination.size !== before.size
      || (destination.dev === before.dev && destination.ino === before.ino)) {
      throw new Error("AWS Staging launcher trusted Node copy verification failed");
    }
    await destinationHandle.chmod(0o500);
    await destinationHandle.sync();
  } finally {
    await destinationHandle.close();
  }
  const copied = await fingerprintExecutable(fileSystem, destinationPath, {
    expectedMode: 0o500,
    requireSingleLink: true
  });
  if (copied.digest !== trustedNode.digest
    || copied.metadata.size !== trustedNode.metadata.size) {
    throw new Error("AWS Staging launcher trusted Node copy digest differs from approval");
  }
  return copied;
}

async function visitTree(fileSystem, root, visitor) {
  const stat = await fileSystem.lstat(root);
  if (stat.isSymbolicLink()) {
    throw new Error("AWS Staging launcher snapshot must not contain symlinks");
  }
  if (stat.isDirectory()) {
    for (const entry of await fileSystem.readdir(root)) {
      await visitTree(fileSystem, path.join(root, entry), visitor);
    }
  }
  await visitor(root, stat);
}

async function sealSnapshot(fileSystem, snapshotRoot, nodeExecutablePath) {
  await visitTree(fileSystem, snapshotRoot, async (candidate, stat) => {
    const desiredMode = stat.isDirectory()
      ? SEALED_DIRECTORY_MODE
      : candidate === nodeExecutablePath
        ? SEALED_DIRECTORY_MODE
        : SEALED_FILE_MODE;
    if ((stat.mode & 0o777) !== desiredMode) {
      await fileSystem.chmod(candidate, desiredMode);
    }
  });
}

async function makeSnapshotRemovable(fileSystem, snapshotRoot) {
  let directoryHandle;
  try {
    directoryHandle = await fileSystem.open(
      snapshotRoot,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW
    );
    const stat = await directoryHandle.stat();
    if (!stat.isDirectory()) return;
    await directoryHandle.chmod(PRIVATE_DIRECTORY_MODE);
  } catch {
    return;
  } finally {
    await directoryHandle?.close();
  }
  try {
    for (const entry of await fileSystem.readdir(snapshotRoot)) {
      const candidate = path.join(snapshotRoot, entry);
      const child = await fileSystem.lstat(candidate);
      if (child.isDirectory() && !child.isSymbolicLink()) {
        await makeSnapshotRemovable(fileSystem, candidate);
      }
    }
  } catch {
    // The final recursive removal reports any material cleanup failure.
  }
}

async function materializeSnapshot({
  approvedSource,
  fileSystem,
  runGit,
  runtimeEntrypoint,
  sourceRevision,
  temporaryRoot,
  trustedNode
}) {
  const canonicalTemporaryRoot = await ensurePrivateTemporaryRoot(fileSystem, temporaryRoot);
  const snapshotRoot = await fileSystem.mkdtemp(path.join(
    canonicalTemporaryRoot,
    "needo-aws-runtime-"
  ));
  await fileSystem.chmod(snapshotRoot, PRIVATE_DIRECTORY_MODE);
  try {
    await runGit(["init", "--quiet"], { cwd: snapshotRoot });
    const sourceObjectDirectory = trimSingleLine(
      await runGit(["rev-parse", "--path-format=absolute", "--git-path", "objects"], {
        cwd: approvedSource.canonicalRepositoryRoot
      }),
      "launcher Git object directory"
    );
    const canonicalObjectDirectory = await fileSystem.realpath(sourceObjectDirectory);
    if (canonicalObjectDirectory !== sourceObjectDirectory) {
      throw new Error("AWS Staging launcher Git object directory must be canonical");
    }
    const alternatesPath = path.join(snapshotRoot, ".git/objects/info/alternates");
    await fileSystem.writeFile(alternatesPath, `${canonicalObjectDirectory}\n`, {
      flag: "wx",
      mode: 0o600
    });
    await runGit(["read-tree", sourceRevision], { cwd: snapshotRoot });
    await runGit(["update-ref", "HEAD", sourceRevision], { cwd: snapshotRoot });
    for (const record of approvedSource.records) {
      await writeSnapshotFile(fileSystem, snapshotRoot, record);
    }

    const nodeExecutablePath = path.join(snapshotRoot, PRIVATE_NODE_EXECUTABLE_NAME);
    const copiedNode = await copyTrustedNodeFromHandle({
      destinationPath: nodeExecutablePath,
      fileSystem,
      trustedNode
    });
    const nodeExecutable = Object.freeze({
      byteLength: Number(trustedNode.metadata.size),
      identity: executableIdentity(copiedNode.metadata),
      relativePath: PRIVATE_NODE_EXECUTABLE_NAME,
      sha256: trustedNode.digest
    });

    const contextPath = path.join(snapshotRoot, LAUNCH_CONTEXT_NAME);
    const context = Object.freeze({
      evidenceOutputDirectory: path.join(
        approvedSource.canonicalRepositoryRoot,
        "outputs/aws-staging"
      ),
      runtimeEntrypoint,
      runtimeManifestSha256: approvedSource.manifestSha256,
      runtimeSourceRevision: sourceRevision,
      nodeExecutable,
      snapshotRoot,
      sourceRepositoryIdentity: approvedSource.sourceRepositoryIdentity,
      sourceRepositoryRoot: approvedSource.canonicalRepositoryRoot,
      version: 2
    });
    await fileSystem.writeFile(contextPath, `${JSON.stringify(context)}\n`, {
      flag: "wx",
      mode: 0o600
    });

    await sealSnapshot(fileSystem, snapshotRoot, nodeExecutablePath);
    const finalNode = await fingerprintExecutable(fileSystem, nodeExecutablePath, {
      expectedMode: 0o500,
      requireSingleLink: true
    });
    return Object.freeze({
      contextPath,
      nodeExecutable: Object.freeze({
        ...nodeExecutable,
        identity: executableIdentity(finalNode.metadata)
      }),
      nodeExecutableMetadata: finalNode.metadata,
      nodeExecutablePath,
      snapshotRoot
    });
  } catch (error) {
    await makeSnapshotRemovable(fileSystem, snapshotRoot);
    await fileSystem.rm(snapshotRoot, { force: true, recursive: true });
    throw error;
  }
}

async function assertSnapshotCurrent({
  approvedSource,
  contextPath,
  fileSystem,
  nodeExecutable,
  nodeExecutableMetadata,
  nodeExecutablePath,
  snapshotRoot
}) {
  if (((await fileSystem.lstat(snapshotRoot)).mode & 0o777) !== SEALED_DIRECTORY_MODE) {
    throw new Error("AWS Staging launcher snapshot root is not sealed");
  }
  for (const record of approvedSource.records) {
    const current = await readStableFile(
      fileSystem,
      path.join(snapshotRoot, record.relativePath),
      `snapshot ${record.relativePath}`
    );
    if ((Number(current.identity.mode) & 0o777) !== SEALED_FILE_MODE
      || !current.bytes.equals(record.committedBytes)) {
      throw new Error(`AWS Staging launcher snapshot ${record.relativePath} changed after sealing`);
    }
  }
  const context = await readStableFile(fileSystem, contextPath, "launch context");
  if ((Number(context.identity.mode) & 0o777) !== SEALED_FILE_MODE) {
    throw new Error("AWS Staging launcher context is not sealed");
  }
  if (await fileSystem.realpath(nodeExecutablePath) !== nodeExecutablePath) {
    throw new Error("AWS Staging launcher private Node executable is not canonical");
  }
  const currentNode = await fingerprintExecutable(fileSystem, nodeExecutablePath, {
    expectedMode: 0o500,
    requireSingleLink: true
  });
  if (currentNode.digest !== nodeExecutable.sha256
    || !sameBigIntStat(currentNode.metadata, nodeExecutableMetadata)) {
    throw new Error("AWS Staging launcher private Node executable changed after sealing");
  }
}

async function runSpawnedChild({ args, cwd, environment, executablePath }) {
  return new Promise((resolve, reject) => {
    const child = spawnChild(executablePath, args, {
      cwd,
      env: environment,
      shell: false,
      stdio: "inherit"
    });
    child.once("error", () => reject(new Error("AWS Staging guarded child failed to start")));
    child.once("exit", (status, signal) => {
      if (signal !== null || !Number.isInteger(status)) {
        reject(new Error("AWS Staging guarded child terminated unexpectedly"));
        return;
      }
      resolve(status);
    });
  });
}

export async function runAwsStagingTrustedLauncher({
  argv = process.argv.slice(2),
  fileSystem = fs,
  launcherSourceRevision = process.env.NEEDO_AWS_STAGING_TRUSTED_SOURCE_REVISION,
  nodeCandidates = APPROVED_NODE_CANDIDATES,
  readNodeRuntime = readCurrentNodeRuntime,
  repositoryRoot = process.env.NEEDO_AWS_STAGING_SOURCE_ROOT ?? process.cwd(),
  runChild = runSpawnedChild,
  runGit = runSystemGit,
  temporaryRoot = "/private/tmp"
} = {}) {
  if (typeof readNodeRuntime !== "function"
    || typeof runChild !== "function"
    || typeof runGit !== "function") {
    throw new Error("AWS Staging launcher requires injected command boundaries");
  }
  const parsed = parseLaunchArguments(argv);
  if (!FULL_GIT_REVISION.test(launcherSourceRevision ?? "")
    || launcherSourceRevision !== parsed.sourceRevision) {
    throw new Error("AWS Staging launcher Git-object revision does not match the approved runtime revision");
  }
  const trustedNode = await captureTrustedNode(fileSystem, nodeCandidates, readNodeRuntime);
  let trustedNodeHandleOpen = true;
  let snapshot;
  try {
    const approvedSource = await captureApprovedSource({
      fileSystem,
      repositoryRoot,
      runGit,
      sourceRevision: parsed.sourceRevision
    });
    snapshot = await materializeSnapshot({
      approvedSource,
      fileSystem,
      runGit,
      runtimeEntrypoint: parsed.runtimeEntrypoint,
      sourceRevision: parsed.sourceRevision,
      temporaryRoot,
      trustedNode
    });
    await trustedNode.handle.close();
    trustedNodeHandleOpen = false;
    await approvedSource.assertCurrentState();
    await assertSnapshotCurrent({ approvedSource, fileSystem, ...snapshot });
    const environment = Object.freeze({
      LANG: "C",
      LC_ALL: "C",
      NEEDO_AWS_STAGING_LAUNCH_CONTEXT: snapshot.contextPath
    });
    const guardUrl = pathToFileURL(path.join(
      snapshot.snapshotRoot,
      "scripts/aws-staging-runtime-guard.mjs"
    )).href;
    return await runChild({
      args: [
        "--no-addons",
        "--disallow-code-generation-from-strings",
        "--disable-warning=ExperimentalWarning",
        `--${LOAD_KEYWORD}=${guardUrl}`,
        path.join(snapshot.snapshotRoot, parsed.runtimeEntrypoint),
        ...parsed.commandArguments
      ],
      cwd: snapshot.snapshotRoot,
      environment,
      executablePath: snapshot.nodeExecutablePath,
      snapshotRoot: snapshot.snapshotRoot
    });
  } finally {
    if (trustedNodeHandleOpen) {
      await trustedNode.handle.close();
    }
    if (snapshot?.snapshotRoot) {
      await makeSnapshotRemovable(fileSystem, snapshot.snapshotRoot);
      await fileSystem.rm(snapshot.snapshotRoot, { force: true, recursive: true });
    }
  }
}

const directFileExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const trustedStdinExecution = process.env.NEEDO_AWS_STAGING_TRUSTED_STDIN === "1";

if (directFileExecution || trustedStdinExecution) {
  if (directFileExecution || process.argv[1] !== "-") {
    process.stderr.write('{"gate":"aws-staging-launcher","status":"failed"}\n');
    process.exitCode = 1;
  } else {
    runAwsStagingTrustedLauncher({ argv: process.argv.slice(2) })
      .then((status) => {
        process.exitCode = status;
      })
      .catch(() => {
        process.stderr.write('{"gate":"aws-staging-launcher","status":"failed"}\n');
        process.exitCode = 1;
      });
  }
}
