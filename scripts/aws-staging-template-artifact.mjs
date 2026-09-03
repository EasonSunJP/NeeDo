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
const TEMPLATE_REPOSITORY_PATH = "deploy/aws-staging/cloudformation.yml";
const MAX_INLINE_TEMPLATE_BYTES = 51_200;

async function runSystemGit(args, { cwd }) {
  const { stdout } = await execFileAsync("/usr/bin/git", [
    "-c", "core.fsmonitor=false",
    ...args
  ], {
    cwd,
    encoding: "buffer",
    maxBuffer: 2 * 1024 * 1024,
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
    throw new Error(`AWS Staging ${label} must be a single non-empty line`);
  }
  return line;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireApproval(approvedRevision, approvedSha256) {
  if (approvedRevision !== undefined
    && (typeof approvedRevision !== "string"
      || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(approvedRevision))) {
    throw new Error("AWS Staging approved source revision must be a full lower-case Git revision");
  }
  if (approvedSha256 !== undefined
    && (typeof approvedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(approvedSha256))) {
    throw new Error("AWS Staging approved template SHA-256 must be lower-case hexadecimal");
  }
}

function requireRegularTemplate(stat) {
  if (!stat?.isFile?.() || stat.isSymbolicLink?.()) {
    throw new Error("AWS Staging template path must be a regular non-symlink file");
  }
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error("AWS Staging template path must be owned by the current OS user");
  }
  if ((stat.mode & 0o022) !== 0) {
    throw new Error("AWS Staging template path must not be group- or world-writable");
  }
}

function templateIdentity(stat, realPath) {
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

async function readStableTemplate(fileSystem, templatePath, realPath) {
  const handle = await fileSystem.open(
    templatePath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  try {
    const before = await handle.stat();
    requireRegularTemplate(before);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    requireRegularTemplate(after);
    const beforeIdentity = templateIdentity(before, realPath);
    const afterIdentity = templateIdentity(after, realPath);
    if (Object.keys(beforeIdentity).some((key) => beforeIdentity[key] !== afterIdentity[key])) {
      throw new Error("AWS Staging template changed while its exact bytes were read");
    }
    return { bytes, stat: after };
  } finally {
    await handle.close();
  }
}

function requireSameIdentity(expected, actual) {
  if (Object.keys(expected).some((key) => expected[key] !== actual[key])) {
    throw new Error("AWS Staging template path identity changed after validation");
  }
}

export function requireAwsStagingTemplateArtifact(
  templateArtifact,
  expectedSourceRevision
) {
  if (!templateArtifact
    || typeof templateArtifact !== "object"
    || !Object.isFrozen(templateArtifact)
    || typeof templateArtifact.body !== "string"
    || templateArtifact.body.length === 0
    || Buffer.byteLength(templateArtifact.body, "utf8") > MAX_INLINE_TEMPLATE_BYTES
    || typeof templateArtifact.templateSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(templateArtifact.templateSha256)
    || typeof templateArtifact.sourceRevision !== "string"
    || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(templateArtifact.sourceRevision)
    || typeof templateArtifact.assertCurrentState !== "function") {
    throw new Error("AWS Staging requires an immutable approved template artifact");
  }
  if (expectedSourceRevision !== undefined
    && templateArtifact.sourceRevision !== expectedSourceRevision) {
    throw new Error("AWS Staging template revision does not match the approved source revision");
  }
  const actualSha256 = sha256(Buffer.from(templateArtifact.body, "utf8"));
  if (actualSha256 !== templateArtifact.templateSha256) {
    throw new Error("AWS Staging template artifact SHA-256 does not match its immutable bytes");
  }
  return templateArtifact;
}

export async function captureAwsStagingTemplateArtifact({
  templatePath,
  repositoryRoot = defaultRepositoryRoot,
  approvedRevision,
  approvedSha256,
  runGit = runSystemGit,
  fileSystem = fs
}) {
  requireApproval(approvedRevision, approvedSha256);
  if (typeof templatePath !== "string" || !path.isAbsolute(templatePath)) {
    throw new Error("AWS Staging template path must be absolute");
  }
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) {
    throw new Error("AWS Staging repository root must be absolute");
  }
  if (typeof runGit !== "function") {
    throw new Error("AWS Staging template artifact requires an injected command runner");
  }

  const canonicalRepositoryRoot = await fileSystem.realpath(repositoryRoot);
  const reportedRoot = trimSingleLine(
    await runGit(["rev-parse", "--show-toplevel"], { cwd: canonicalRepositoryRoot }),
    "Git repository root"
  );
  const canonicalReportedRoot = await fileSystem.realpath(reportedRoot);
  if (canonicalReportedRoot !== canonicalRepositoryRoot) {
    throw new Error("AWS Staging template repository root does not match the approved worktree");
  }

  const canonicalTemplatePath = await fileSystem.realpath(templatePath);
  const relativeTemplatePath = path.relative(canonicalRepositoryRoot, canonicalTemplatePath);
  if (relativeTemplatePath !== TEMPLATE_REPOSITORY_PATH) {
    throw new Error("AWS Staging template path is not the approved repository artifact");
  }

  const sourceRevision = trimSingleLine(
    await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
      cwd: canonicalRepositoryRoot
    }),
    "source revision"
  );
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceRevision)) {
    throw new Error("AWS Staging source revision must be a full lower-case Git revision");
  }
  if (approvedRevision !== undefined && sourceRevision !== approvedRevision) {
    throw new Error("AWS Staging source revision does not match the action-time approval");
  }

  const statusArgs = [
    "status", "--porcelain=v1", "--untracked-files=no", "--", TEMPLATE_REPOSITORY_PATH
  ];
  const initialStatus = decodeUtf8(
    await runGit(statusArgs, { cwd: canonicalRepositoryRoot }),
    "template status"
  );
  if (initialStatus !== "") {
    throw new Error("AWS Staging tracked template must be clean before approval");
  }

  const committedBytes = asBuffer(
    await runGit(["show", `${sourceRevision}:${TEMPLATE_REPOSITORY_PATH}`], {
      cwd: canonicalRepositoryRoot
    }),
    "committed template"
  );
  const indexedBytes = asBuffer(
    await runGit(["show", `:${TEMPLATE_REPOSITORY_PATH}`], {
      cwd: canonicalRepositoryRoot
    }),
    "indexed template"
  );
  if (!indexedBytes.equals(committedBytes)) {
    throw new Error("AWS Staging tracked template index must match the approved revision");
  }
  const { bytes: workingBytes, stat: initialStat } = await readStableTemplate(
    fileSystem,
    templatePath,
    canonicalTemplatePath
  );
  const initialIdentity = templateIdentity(initialStat, canonicalTemplatePath);
  if (!Buffer.isBuffer(workingBytes)) {
    throw new Error("AWS Staging template reader must return exact bytes");
  }
  if (!workingBytes.equals(committedBytes)) {
    throw new Error("AWS Staging tracked template bytes differ from the approved revision");
  }
  if (workingBytes.length === 0 || workingBytes.length > MAX_INLINE_TEMPLATE_BYTES) {
    throw new Error(`AWS Staging template must contain 1-${MAX_INLINE_TEMPLATE_BYTES} bytes`);
  }
  const body = decodeUtf8(workingBytes, "CloudFormation template");
  if (body.includes("\0")) {
    throw new Error("AWS Staging CloudFormation template must not contain NUL bytes");
  }
  if (!Buffer.from(body, "utf8").equals(workingBytes)) {
    throw new Error("AWS Staging CloudFormation template must preserve exact UTF-8 byte identity without a BOM");
  }
  if (/^fileb?:\/\//i.test(body)) {
    throw new Error("AWS Staging inline template must not be an AWS CLI file reference");
  }
  const templateSha256 = sha256(workingBytes);
  if (approvedSha256 !== undefined && templateSha256 !== approvedSha256) {
    throw new Error("AWS Staging template SHA-256 does not match the action-time approval");
  }

  async function assertCurrentState() {
    const currentRevision = trimSingleLine(
      await runGit(["rev-parse", "--verify", "HEAD^{commit}"], {
        cwd: canonicalRepositoryRoot
      }),
      "source revision"
    );
    if (currentRevision !== sourceRevision) {
      throw new Error("AWS Staging source revision changed after template validation");
    }
    const currentStatus = decodeUtf8(
      await runGit(statusArgs, { cwd: canonicalRepositoryRoot }),
      "template status"
    );
    if (currentStatus !== "") {
      throw new Error("AWS Staging tracked template became dirty after validation");
    }
    const currentIndexedBytes = asBuffer(
      await runGit(["show", `:${TEMPLATE_REPOSITORY_PATH}`], {
        cwd: canonicalRepositoryRoot
      }),
      "indexed template"
    );
    if (!currentIndexedBytes.equals(committedBytes)) {
      throw new Error("AWS Staging tracked template index changed after validation");
    }
    const currentRealPath = await fileSystem.realpath(templatePath);
    const { bytes: currentBytes, stat: currentStat } = await readStableTemplate(
      fileSystem,
      templatePath,
      currentRealPath
    );
    requireSameIdentity(initialIdentity, templateIdentity(currentStat, currentRealPath));
    if (!Buffer.isBuffer(currentBytes)
      || sha256(currentBytes) !== templateSha256
      || !currentBytes.equals(workingBytes)) {
      throw new Error("AWS Staging template bytes changed after validation");
    }
  }

  return requireAwsStagingTemplateArtifact(Object.freeze({
    body,
    sourceRevision,
    templateSha256,
    assertCurrentState
  }));
}
