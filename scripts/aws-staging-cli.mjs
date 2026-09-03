import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { userInfo as systemUserInfo } from "node:os";
import path from "node:path";

const MAX_BUFFER = 4 * 1024 * 1024;
const MAX_AWS_CLI_EXECUTABLE_BYTES = 128 * 1024 * 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const FORBIDDEN_ARGUMENTS = new Set([
  "getsecretvalue",
  "awssecretaccesskey",
  "awssessiontoken",
  "secretstring",
  "secretbinary",
  "withdecryption",
  "password"
]);
const ALLOWED_SERVICE_OPERATIONS = new Set([
  "configure list",
  "sts get-caller-identity",
  "ssm get-parameter",
  "ssm get-document",
  "ssm describe-instance-information",
  "ssm send-command",
  "ssm get-command-invocation",
  "ssm list-tags-for-resource",
  "ssm wait",
  "ec2 describe-images",
  "ec2 describe-instances",
  "ec2 describe-addresses",
  "ec2 describe-security-groups",
  "ec2 describe-volumes",
  "ec2 describe-tags",
  "ec2 wait",
  "cloudformation validate-template",
  "cloudformation describe-stacks",
  "cloudformation create-stack",
  "cloudformation wait",
  "cloudformation list-stack-resources",
  "s3api get-public-access-block",
  "s3api get-bucket-encryption",
  "s3api get-bucket-versioning",
  "s3api get-bucket-lifecycle-configuration",
  "s3api get-bucket-tagging",
  "s3api get-bucket-policy",
  "iam list-role-tags",
  "secretsmanager describe-secret",
  "secretsmanager list-secret-version-ids",
  "logs describe-log-groups",
  "logs list-tags-for-resource",
  "cloudwatch describe-alarms",
  "cloudwatch list-tags-for-resource",
  "sns list-tags-for-resource",
  "sns list-subscriptions-by-topic",
  "budgets describe-budget",
  "budgets describe-notifications-for-budget",
  "budgets describe-subscribers-for-notification",
  "budgets list-tags-for-resource",
  "resourcegroupstaggingapi get-resources"
]);
const CALLER_SUPPLIED_GLOBAL_OPTIONS = new Set([
  "--debug",
  "--endpoint-url",
  "--no-verify-ssl",
  "--no-paginate",
  "--output",
  "--query",
  "--profile",
  "--region",
  "--version",
  "--color",
  "--no-sign-request",
  "--ca-bundle",
  "--cli-read-timeout",
  "--cli-connect-timeout",
  "--cli-binary-format",
  "--no-cli-pager",
  "--cli-auto-prompt",
  "--no-cli-auto-prompt"
]);

function policyScannableArguments(args) {
  const operation = `${args[0] ?? ""} ${args[1] ?? ""}`;
  if (operation !== "cloudformation validate-template"
    && operation !== "cloudformation create-stack") {
    return args;
  }
  const templateBodyFlags = args
    .map((argument, index) => (argument === "--template-body" ? index : -1))
    .filter((index) => index >= 0);
  const [flagIndex] = templateBodyFlags;
  const hasExactValidateShape = operation !== "cloudformation validate-template"
    || (args.length === 4 && flagIndex === 2);
  if (templateBodyFlags.length !== 1
    || flagIndex < 2
    || typeof args[flagIndex + 1] !== "string"
    || args[flagIndex + 1].length === 0
    || !hasExactValidateShape) {
    throw new Error("AWS CLI inline template operation shape is not allowed");
  }
  return args.filter((_argument, index) => index !== flagIndex + 1);
}

function assertSafeArguments(args) {
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    throw new TypeError("AWS CLI arguments must be an array of strings");
  }
  if (args.some((argument) => argument.includes("\0"))) {
    throw new Error("forbidden AWS CLI NUL argument");
  }

  const scannedArguments = policyScannableArguments(args);
  const canonicalArguments = scannedArguments
    .map((argument) => argument.toLowerCase().replace(/[-_]/g, ""));
  const isAllowedConfigureList = args.length === 2
    && args[0] === "configure"
    && args[1] === "list";
  if (canonicalArguments.some((argument) => [...FORBIDDEN_ARGUMENTS].some((forbidden) => argument.includes(forbidden)))
    || (canonicalArguments.some((argument) => argument.startsWith("configure")) && !isAllowedConfigureList)) {
    throw new Error("forbidden AWS CLI credential or secret surface");
  }
}

function assertAllowedOperation(args) {
  const operation = `${args[0] ?? ""} ${args[1] ?? ""}`;
  if (!ALLOWED_SERVICE_OPERATIONS.has(operation)) {
    throw new Error("AWS CLI service operation is not allowed");
  }
  if (operation === "s3api get-bucket-policy") {
    const bucket = args[3];
    const owner = args[5];
    if (args.length !== 6
      || args[2] !== "--bucket"
      || typeof bucket !== "string"
      || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)
      || bucket.includes("..")
      || bucket.includes(".-")
      || bucket.includes("-.")
      || args[4] !== "--expected-bucket-owner"
      || typeof owner !== "string"
      || !/^\d{12}$/.test(owner)) {
      throw new Error("AWS CLI get-bucket-policy shape is not allowed");
    }
  }
  if (policyScannableArguments(args).some((argument) => {
    const normalized = argument.toLowerCase();
    return [...CALLER_SUPPLIED_GLOBAL_OPTIONS].some((option) => (
      normalized === option || normalized.startsWith(`${option}=`)
    ));
  })) {
    throw new Error("caller-supplied AWS CLI global flags are not allowed");
  }
}

function finalStderrLine(stderr) {
  const lines = String(stderr ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) ?? "unknown error").slice(0, 500);
}

function requireEnvironment(environment) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    throw new TypeError("AWS CLI environment must be an object");
  }
  return environment;
}

function uncredentialedEnvironment() {
  return {
    AWS_CLI_AUTO_PROMPT: "off",
    AWS_CLI_HISTORY_FILE: "/dev/null",
    AWS_CONFIG_FILE: "/dev/null",
    AWS_DATA_PATH: "/nonexistent/needo-aws-cli-models",
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: "true",
    AWS_PAGER: "",
    AWS_SHARED_CREDENTIALS_FILE: "/dev/null",
    HOME: "/nonexistent/needo-aws-cli-home",
    LANG: "C",
    LC_ALL: "C"
  };
}

function requireSafeProfile(profile) {
  if (typeof profile !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(profile)) {
    throw new Error("AWS CLI profile name is invalid");
  }
  return profile;
}

function requireSafeRegion(region) {
  if (typeof region !== "string" || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region)) {
    throw new Error("AWS CLI region is invalid");
  }
  return region;
}

function extractLoginSession(configText, profile) {
  const targetSection = profile === "default" ? "default" : `profile ${profile}`;
  let currentSection;
  let targetSections = 0;
  const loginSessions = [];

  for (const rawLine of String(configText).split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const section = /^\[([^\]\r\n]+)\]$/.exec(trimmed);
    if (section) {
      currentSection = section[1];
      if (currentSection === targetSection) targetSections += 1;
      continue;
    }
    if (currentSection !== targetSection) continue;
    if (/^\s/.test(rawLine)) {
      throw new Error("AWS CLI login profile contains an unsupported continuation");
    }
    const assignment = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(rawLine);
    if (!assignment) throw new Error("AWS CLI login profile is malformed");
    if (assignment[1].toLowerCase() === "login_session") {
      loginSessions.push(assignment[2]);
    }
  }

  if (targetSections !== 1 || loginSessions.length !== 1) {
    throw new Error("AWS CLI profile must contain exactly one login_session");
  }
  const [loginSession] = loginSessions;
  if (!/^arn:(?:aws|aws-us-gov|aws-cn):sts::\d{12}:assumed-role\/[A-Za-z0-9+=,.@_-]{1,64}\/[A-Za-z0-9+=,.@_-]{1,64}$/.test(loginSession)) {
    throw new Error("AWS CLI login_session is invalid");
  }
  return loginSession;
}

function sourcePathIdentity(metadata, realPath, label) {
  return Object.freeze({
    label,
    realPath,
    device: String(metadata.dev),
    inode: String(metadata.ino),
    owner: String(metadata.uid),
    group: String(metadata.gid),
    mode: String(metadata.mode & 0o777n),
    type: metadata.isFile() ? "file" : metadata.isDirectory() ? "directory" : "other"
  });
}

async function requireOwnedSourcePath(candidate, expectedType, label, expectedUid, {
  exactMode
} = {}) {
  const metadata = await fs.lstat(candidate, { bigint: true });
  const isExpectedType = expectedType === "file" ? metadata.isFile() : metadata.isDirectory();
  const actualMode = Number(metadata.mode & 0o777n);
  if (metadata.isSymbolicLink()
    || !isExpectedType
    || metadata.uid !== BigInt(expectedUid)
    || (exactMode === undefined && (actualMode & 0o022) !== 0)
    || (exactMode !== undefined && actualMode !== exactMode)) {
    const modeRequirement = exactMode === undefined
      ? "owner-controlled and not group/world-writable"
      : `${exactMode.toString(8).padStart(4, "0")}`;
    throw new Error(`${label} must be an owner-controlled ${expectedType} with mode ${modeRequirement}`);
  }
  const realPath = await fs.realpath(candidate);
  return sourcePathIdentity(metadata, realPath, label);
}

async function requirePrivateLoginCacheEntries(loginCache, expectedUid) {
  const entries = (await fs.readdir(loginCache)).sort();
  const identities = [];
  for (const entry of entries) {
    if (!/^[a-f0-9]{64}\.json$/.test(entry)) {
      throw new Error("AWS CLI login cache entry must be a regular owner-controlled 0600 file");
    }
    identities.push(await requireOwnedSourcePath(
      path.join(loginCache, entry),
      "file",
      "AWS CLI login cache entry",
      expectedUid,
      { exactMode: PRIVATE_FILE_MODE }
    ));
  }
  return Object.freeze({ entries: Object.freeze(entries), identities: Object.freeze(identities) });
}

async function requireTrustedSourceHomeChain(canonicalHome, expectedUid) {
  const identities = [];
  let current = canonicalHome;
  for (;;) {
    const metadata = await fs.lstat(current, { bigint: true });
    const ownerIsTrusted = current === canonicalHome
      ? metadata.uid === BigInt(expectedUid)
      : metadata.uid === BigInt(expectedUid) || metadata.uid === 0n;
    if (metadata.isSymbolicLink()
      || !metadata.isDirectory()
      || !ownerIsTrusted
      || (metadata.mode & 0o022n) !== 0n) {
      throw new Error("AWS CLI source HOME trust chain must be owner-controlled and not group/world-writable");
    }
    const realPath = await fs.realpath(current);
    if (realPath !== current) {
      throw new Error("AWS CLI source HOME trust chain must use canonical non-symlink paths");
    }
    identities.push(sourcePathIdentity(metadata, realPath, "AWS CLI source HOME trust chain"));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return Object.freeze(identities);
}

async function requireUnchangedResolverSource({ identities, loginCache, cacheEntries }) {
  try {
    const currentEntries = (await fs.readdir(loginCache)).sort();
    if (JSON.stringify(currentEntries) !== JSON.stringify(cacheEntries)) throw new Error();
    for (const expected of identities) {
      const metadata = await fs.lstat(expected.realPath, { bigint: true });
      const realPath = await fs.realpath(expected.realPath);
      const current = sourcePathIdentity(metadata, realPath, expected.label);
      if (Object.keys(expected).some((key) => expected[key] !== current[key])) throw new Error();
    }
  } catch {
    throw new Error("AWS CLI resolver source changed after attestation");
  }
}

async function createPrivateAwsCliState({
  profile,
  region,
  temporaryRoot,
  userInfoImpl
}) {
  const canonicalTemporaryRoot = await fs.realpath(temporaryRoot);
  let root;
  try {
    root = await fs.mkdtemp(path.join(canonicalTemporaryRoot, "needo-aws-cli-"));
    await fs.chmod(root, PRIVATE_DIRECTORY_MODE);
    const home = path.join(root, "home");
    const models = path.join(root, "models");
    const credentialsFile = path.join(root, "credentials");
    const resolverConfigFile = path.join(root, "resolver-config");
    const frozenConfigFile = path.join(root, "frozen-config");
    const historyFile = path.join(root, "history-disabled.db");
    await Promise.all([
      fs.mkdir(home, { mode: PRIVATE_DIRECTORY_MODE }),
      fs.mkdir(models, { mode: PRIVATE_DIRECTORY_MODE })
    ]);

    const user = userInfoImpl();
    const sourceHome = user?.homedir;
    const expectedUid = user?.uid;
    if (typeof sourceHome !== "string"
      || !path.isAbsolute(sourceHome)
      || !Number.isSafeInteger(expectedUid)
      || expectedUid < 0) {
      throw new Error("AWS CLI source home is invalid");
    }
    const canonicalSourceHome = await fs.realpath(sourceHome);
    const sourceHomeIdentities = await requireTrustedSourceHomeChain(
      canonicalSourceHome,
      expectedUid
    );
    const sourceAwsDirectoryIdentity = await requireOwnedSourcePath(
      path.join(canonicalSourceHome, ".aws"),
      "directory",
      "AWS CLI source directory",
      expectedUid
    );
    const sourceAwsDirectory = sourceAwsDirectoryIdentity.realPath;
    const sourceLoginDirectoryIdentity = await requireOwnedSourcePath(
      path.join(sourceAwsDirectory, "login"),
      "directory",
      "AWS CLI source login directory",
      expectedUid
    );
    const sourceLoginDirectory = sourceLoginDirectoryIdentity.realPath;
    const sourceConfigFileIdentity = await requireOwnedSourcePath(
      path.join(sourceAwsDirectory, "config"),
      "file",
      "AWS CLI source config",
      expectedUid,
      { exactMode: PRIVATE_FILE_MODE }
    );
    const sourceConfigFile = sourceConfigFileIdentity.realPath;
    const sourceLoginCacheIdentity = await requireOwnedSourcePath(
      path.join(sourceLoginDirectory, "cache"),
      "directory",
      "AWS CLI login cache",
      expectedUid
    );
    const sourceLoginCache = sourceLoginCacheIdentity.realPath;
    const cache = await requirePrivateLoginCacheEntries(sourceLoginCache, expectedUid);
    const sourceIdentities = Object.freeze([
      ...sourceHomeIdentities,
      sourceAwsDirectoryIdentity,
      sourceLoginDirectoryIdentity,
      sourceConfigFileIdentity,
      sourceLoginCacheIdentity,
      ...cache.identities
    ]);
    const sourceConfig = await fs.readFile(sourceConfigFile, "utf8");
    const loginSession = extractLoginSession(sourceConfig, profile);
    const profileHeader = profile === "default" ? "default" : `profile ${profile}`;
    const resolverConfig = [
      `[${profileHeader}]`,
      `login_session = ${loginSession}`,
      `region = ${region}`,
      "cli_history = disabled",
      ""
    ].join("\n");
    const frozenConfig = [
      "[default]",
      `region = ${region}`,
      "cli_history = disabled",
      ""
    ].join("\n");
    await Promise.all([
      fs.writeFile(credentialsFile, "", { mode: PRIVATE_FILE_MODE, flag: "wx" }),
      fs.writeFile(resolverConfigFile, resolverConfig, { mode: PRIVATE_FILE_MODE, flag: "wx" }),
      fs.writeFile(frozenConfigFile, frozenConfig, { mode: PRIVATE_FILE_MODE, flag: "wx" })
    ]);
    await Promise.all([
      fs.chmod(home, PRIVATE_DIRECTORY_MODE),
      fs.chmod(models, PRIVATE_DIRECTORY_MODE),
      fs.chmod(credentialsFile, PRIVATE_FILE_MODE),
      fs.chmod(resolverConfigFile, PRIVATE_FILE_MODE),
      fs.chmod(frozenConfigFile, PRIVATE_FILE_MODE)
    ]);

    const commonEnvironment = {
      ...uncredentialedEnvironment(),
      HOME: home,
      AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
      AWS_DATA_PATH: models,
      AWS_CLI_HISTORY_FILE: historyFile
    };
    let disposePromise;
    return {
      root,
      attestationEnvironment: {
        ...commonEnvironment,
        AWS_CONFIG_FILE: frozenConfigFile
      },
      resolverEnvironment: {
        ...commonEnvironment,
        AWS_CONFIG_FILE: resolverConfigFile,
        AWS_LOGIN_CACHE_DIRECTORY: sourceLoginCache
      },
      frozenEnvironment: {
        ...commonEnvironment,
        AWS_CONFIG_FILE: frozenConfigFile
      },
      assertResolverSourceCurrent() {
        return requireUnchangedResolverSource({
          identities: sourceIdentities,
          loginCache: sourceLoginCache,
          cacheEntries: cache.entries
        });
      },
      dispose() {
        disposePromise ??= fs.rm(root, { recursive: true, force: true });
        return disposePromise;
      }
    };
  } catch (error) {
    if (root) await fs.rm(root, { recursive: true, force: true });
    throw error;
  }
}

function requireAbsoluteExecutablePath(executablePath) {
  if (typeof executablePath !== "string" || !path.isAbsolute(executablePath)) {
    throw new Error("AWS CLI executable path must be absolute");
  }
  return executablePath;
}

function isPathWithin(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function requireTrustedDirectoryChain(directory, trustRoot, expectedUid, systemOwned) {
  let current = directory;
  for (;;) {
    const metadata = await fs.stat(current, { bigint: true });
    const ownerIsTrusted = systemOwned
      ? metadata.uid === 0n
      : metadata.uid === BigInt(expectedUid) || metadata.uid === 0n;
    if (!metadata.isDirectory() || !ownerIsTrusted || (metadata.mode & 0o022n) !== 0n) {
      throw new Error("AWS CLI executable directory trust check failed");
    }
    if (current === trustRoot) return;
    const parent = path.dirname(current);
    if (parent === current || !isPathWithin(parent, trustRoot)) {
      throw new Error("AWS CLI executable escaped its approved install root");
    }
    current = parent;
  }
}

function sameExecutableMetadata(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.gid === right.gid
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function readExecutableFingerprint(resolved, expectedUid, systemOwned) {
  const before = await fs.stat(resolved, { bigint: true });
  const ownerIsTrusted = systemOwned
    ? before.uid === 0n
    : before.uid === BigInt(expectedUid) || before.uid === 0n;
  if (!before.isFile()
    || !ownerIsTrusted
    || (before.mode & 0o022n) !== 0n
    || before.size <= 0n
    || before.size > BigInt(MAX_AWS_CLI_EXECUTABLE_BYTES)) {
    throw new Error("AWS CLI executable trust check failed");
  }
  await fs.access(resolved, fsConstants.X_OK);
  const digest = createHash("sha256").update(await fs.readFile(resolved)).digest("hex");
  const after = await fs.stat(resolved, { bigint: true });
  if (!sameExecutableMetadata(before, after)) {
    throw new Error("AWS CLI executable changed while it was inspected");
  }
  return Object.freeze({
    path: resolved,
    expectedUid,
    systemOwned,
    metadata: before,
    digest
  });
}

async function inspectApprovedAwsCliCandidate({ candidate, trustRoot, expectedUid, systemOwned }) {
  const canonicalTrustRoot = await fs.realpath(trustRoot);
  const resolved = await fs.realpath(candidate);
  if (!isPathWithin(resolved, canonicalTrustRoot)) {
    throw new Error("AWS CLI executable escaped its approved install root");
  }
  await requireTrustedDirectoryChain(
    path.dirname(resolved),
    canonicalTrustRoot,
    expectedUid,
    systemOwned
  );
  const fingerprint = await readExecutableFingerprint(resolved, expectedUid, systemOwned);
  return Object.freeze({ ...fingerprint, trustRoot: canonicalTrustRoot });
}

async function resolveAwsCliExecutable({ homedir, uid }, approvedCandidates) {
  const canonicalHome = await fs.realpath(homedir);
  const defaultCandidates = [
    {
      candidate: path.join(canonicalHome, ".local", "share", "aws-cli", "aws"),
      trustRoot: canonicalHome,
      expectedUid: uid,
      systemOwned: false
    },
    {
      candidate: path.join(canonicalHome, ".local", "bin", "aws"),
      trustRoot: canonicalHome,
      expectedUid: uid,
      systemOwned: false
    },
    { candidate: "/usr/local/bin/aws", trustRoot: "/usr/local", expectedUid: uid, systemOwned: true },
    { candidate: "/usr/bin/aws", trustRoot: "/usr", expectedUid: uid, systemOwned: true },
    { candidate: "/opt/aws-cli/bin/aws", trustRoot: "/opt/aws-cli", expectedUid: uid, systemOwned: true },
    { candidate: "/opt/aws-cli/v2/current/bin/aws", trustRoot: "/opt/aws-cli", expectedUid: uid, systemOwned: true }
  ];
  if (approvedCandidates !== undefined
    && (!Array.isArray(approvedCandidates) || approvedCandidates.length === 0)) {
    throw new Error("Approved AWS CLI executable candidates are invalid");
  }
  const candidates = approvedCandidates === undefined
    ? defaultCandidates
    : approvedCandidates.map((candidate) => ({ ...candidate, expectedUid: uid }));
  for (const candidate of candidates) {
    try {
      return await inspectApprovedAwsCliCandidate(candidate);
    } catch {
      // Keep searching only the fixed approved installation roots.
    }
  }
  throw new Error("Trusted AWS CLI v2 executable was not found in approved install roots");
}

async function verifyAwsCliExecutable(fingerprint) {
  let current;
  try {
    if (await fs.realpath(fingerprint.path) !== fingerprint.path) throw new Error();
    await requireTrustedDirectoryChain(
      path.dirname(fingerprint.path),
      fingerprint.trustRoot,
      fingerprint.expectedUid,
      fingerprint.systemOwned
    );
    current = await readExecutableFingerprint(
      fingerprint.path,
      fingerprint.expectedUid,
      fingerprint.systemOwned
    );
  } catch {
    throw new Error("Trusted AWS CLI executable changed after attestation");
  }
  if (!sameExecutableMetadata(fingerprint.metadata, current.metadata)
    || fingerprint.digest !== current.digest) {
    throw new Error("Trusted AWS CLI executable changed after attestation");
  }
}

async function attestAwsCliV2(
  execFileImpl,
  fingerprint,
  environment,
  assertRuntimeCurrent
) {
  await assertRuntimeCurrent();
  await verifyAwsCliExecutable(fingerprint);
  const executablePath = fingerprint.path;
  return new Promise((resolve, reject) => {
    execFileImpl(
      executablePath,
      ["--version"],
      { shell: false, maxBuffer: MAX_BUFFER, env: environment },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error("AWS CLI v2.32 or newer is required"));
          return;
        }
        const version = /(?:^|\s)aws-cli\/(2)\.(\d+)\.(\d+)(?:\s|$)/.exec(
          `${String(stdout ?? "")} ${String(stderr ?? "")}`
        );
        if (!version || Number(version[2]) < 32) {
          reject(new Error("AWS CLI v2.32 or newer is required"));
          return;
        }
        resolve();
      }
    );
  });
}

function invoke(execFileImpl, executablePath, profile, region, args, output, {
  environment,
  includeProfile = true,
  credentialExpiresAt,
  now = Date.now,
  verifyExecutable,
  assertRuntimeCurrent
}) {
  assertSafeArguments(args);
  assertAllowedOperation(args);
  if (credentialExpiresAt !== undefined && now() >= credentialExpiresAt) {
    throw new Error("The frozen AWS CLI credential session has expired");
  }
  const fullArgs = [
    ...args,
    ...(includeProfile ? ["--profile", profile] : []),
    "--region", region,
    "--output", output,
    "--no-cli-pager"
  ];

  return Promise.resolve()
    .then(() => assertRuntimeCurrent?.())
    .then(() => verifyExecutable?.())
    .then(() => new Promise((resolve, reject) => {
    execFileImpl(
      executablePath,
      fullArgs,
      { shell: false, maxBuffer: MAX_BUFFER, env: environment },
      (error, stdout, stderr) => {
        if (error) {
          const code = error.code ?? "unknown";
          reject(new Error(`AWS CLI failed (${code}): ${finalStderrLine(stderr)}`));
          return;
        }
        resolve({ stdout: String(stdout ?? "") });
      }
    );
    }));
}

function requireExportedTemporaryCredentials(rawCredentials, now) {
  let parsed;
  try {
    parsed = JSON.parse(rawCredentials);
  } catch {
    throw new Error("AWS CLI temporary credential transfer was malformed");
  }
  const accessKeyId = parsed?.AccessKeyId;
  const secretAccessKey = parsed?.SecretAccessKey;
  const sessionToken = parsed?.SessionToken;
  const expiration = parsed?.Expiration;
  const expiresAt = Date.parse(expiration);
  if (parsed?.Version !== 1
    || typeof accessKeyId !== "string" || !/^[A-Z0-9]{16,128}$/.test(accessKeyId)
    || typeof secretAccessKey !== "string" || !/^[\x21-\x7e]{20,256}$/.test(secretAccessKey)
    || typeof sessionToken !== "string" || !/^[\x21-\x7e]{20,8192}$/.test(sessionToken)
    || typeof expiration !== "string" || !Number.isFinite(expiresAt)
    || expiresAt <= now()) {
    throw new Error("AWS CLI requires one unexpired temporary credential session");
  }
  return Object.freeze({ accessKeyId, secretAccessKey, sessionToken, expiresAt });
}

function credentialResolverFailure() {
  const error = new Error("AWS CLI credential resolution failed");
  error.code = "AWS_CLI_CREDENTIAL_RESOLUTION_FAILED";
  return error;
}

async function invokeCredentialResolver(
  execFileImpl,
  executablePath,
  args,
  environment,
  verifyExecutable,
  assertResolverSourceCurrent,
  assertRuntimeCurrent
) {
  await assertRuntimeCurrent();
  await verifyExecutable();
  await assertResolverSourceCurrent();
  return new Promise((resolve, reject) => {
    try {
      execFileImpl(
        executablePath,
        args,
        { shell: false, maxBuffer: MAX_BUFFER, env: environment },
        (error, stdout) => {
          if (error) {
            reject(credentialResolverFailure());
            return;
          }
          resolve(String(stdout ?? ""));
        }
      );
    } catch {
      reject(credentialResolverFailure());
    }
  });
}

function createAwsCliInternal({
  executablePath,
  profile,
  region,
  execFileImpl,
  environment,
  includeProfile,
  configureListOutput,
  credentialExpiresAt,
  now,
  dispose,
  isDisposed = () => false,
  verifyExecutable,
  assertRuntimeCurrent
}) {
  function requireActive() {
    if (isDisposed()) throw new Error("The frozen AWS CLI adapter has been disposed");
  }
  const adapter = {
    json(args) {
      requireActive();
      return invoke(execFileImpl, executablePath, profile, region, args, "json", {
        environment,
        includeProfile,
        credentialExpiresAt,
        now,
        verifyExecutable,
        assertRuntimeCurrent
      }).then(({ stdout }) => JSON.parse(stdout));
    },
    text(args) {
      requireActive();
      assertSafeArguments(args);
      assertAllowedOperation(args);
      if (configureListOutput !== undefined
        && args.length === 2
        && args[0] === "configure"
        && args[1] === "list") {
        return Promise.resolve()
          .then(() => assertRuntimeCurrent?.())
          .then(() => configureListOutput.trim());
      }
      return invoke(execFileImpl, executablePath, profile, region, args, "text", {
        environment,
        includeProfile,
        credentialExpiresAt,
        now,
        verifyExecutable,
        assertRuntimeCurrent
      }).then(({ stdout }) => stdout.trim());
    }
  };
  if (dispose) adapter.dispose = dispose;
  return Object.freeze(adapter);
}

export function createAwsCli({
  profile,
  region,
  executablePath,
  execFileImpl = execFile,
  environment = process.env
}) {
  requireEnvironment(environment);
  return createAwsCliInternal({
    executablePath: requireAbsoluteExecutablePath(executablePath),
    profile: requireSafeProfile(profile),
    region: requireSafeRegion(region),
    execFileImpl,
    environment: uncredentialedEnvironment(),
    includeProfile: true
  });
}

export async function createFrozenAwsCli({
  profile,
  region,
  execFileImpl = execFile,
  environment = process.env,
  now = Date.now,
  temporaryRoot = "/tmp",
  userInfoImpl = systemUserInfo,
  approvedExecutableCandidates,
  assertRuntimeCurrent
}) {
  requireEnvironment(environment);
  if (typeof assertRuntimeCurrent !== "function") {
    throw new Error("AWS CLI requires an approved runtime re-attestation boundary");
  }
  await assertRuntimeCurrent();
  const safeProfile = requireSafeProfile(profile);
  const safeRegion = requireSafeRegion(region);
  const user = userInfoImpl();
  if (!user
    || typeof user.homedir !== "string"
    || !path.isAbsolute(user.homedir)
    || !Number.isSafeInteger(user.uid)
    || user.uid < 0) {
    throw new Error("AWS CLI OS user identity is invalid");
  }
  const executable = await resolveAwsCliExecutable(user, approvedExecutableCandidates);
  const executablePath = executable.path;
  const verifyExecutable = () => verifyAwsCliExecutable(executable);
  const state = await createPrivateAwsCliState({
    profile: safeProfile,
    region: safeRegion,
    temporaryRoot,
    userInfoImpl: () => user
  });
  try {
    await attestAwsCliV2(
      execFileImpl,
      executable,
      state.attestationEnvironment,
      assertRuntimeCurrent
    );
    const configureListOutput = await invokeCredentialResolver(execFileImpl, executablePath, [
      "configure", "list",
      "--profile", safeProfile,
      "--region", safeRegion,
      "--output", "text",
      "--no-cli-pager"
    ], state.resolverEnvironment, verifyExecutable, state.assertResolverSourceCurrent, assertRuntimeCurrent);
    const exported = await invokeCredentialResolver(execFileImpl, executablePath, [
      "configure", ["ex", "port-credentials"].join(""),
      "--profile", safeProfile,
      "--format", "process",
      "--no-cli-pager"
    ], state.resolverEnvironment, verifyExecutable, state.assertResolverSourceCurrent, assertRuntimeCurrent);
    const credentials = requireExportedTemporaryCredentials(exported, now);
    const lockedEnvironment = {
      ...state.frozenEnvironment,
      AWS_ACCESS_KEY_ID: credentials.accessKeyId,
      AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
      AWS_SESSION_TOKEN: credentials.sessionToken
    };
    let disposed = false;
    const dispose = async () => {
      if (disposed) return;
      disposed = true;
      delete lockedEnvironment.AWS_ACCESS_KEY_ID;
      delete lockedEnvironment.AWS_SECRET_ACCESS_KEY;
      delete lockedEnvironment.AWS_SESSION_TOKEN;
      await state.dispose();
    };
    return createAwsCliInternal({
      executablePath,
      profile: safeProfile,
      region: safeRegion,
      execFileImpl,
      environment: lockedEnvironment,
      includeProfile: false,
      configureListOutput,
      credentialExpiresAt: credentials.expiresAt,
      now,
      dispose,
      isDisposed: () => disposed,
      verifyExecutable,
      assertRuntimeCurrent
    });
  } catch (error) {
    await state.dispose();
    throw error;
  }
}
