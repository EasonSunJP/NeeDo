import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { isIPv4 } from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createAwsCli } from "./aws-staging-cli.mjs";
import {
  parseAwsStagingArgs,
  requireAwsStagingRegion,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";
import { deployAwsStagingInfrastructure } from "./aws-staging-deploy-lib.mjs";
import { runAwsStagingPreflight } from "./aws-staging-preflight-lib.mjs";

const modulePath = fileURLToPath(import.meta.url);
const moduleDir = path.dirname(modulePath);
const defaultTrustedRoot = path.resolve(moduleDir, "..");
const defaultOutputDirectory = path.join(defaultTrustedRoot, "outputs", "aws-staging");
const evidenceFileName = "environment-stack.json";
const stableStackStates = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE"]);
const topLevelEvidenceKeys = Object.freeze([
  "scope",
  "accountId",
  "region",
  "stackName",
  "stackStatus",
  "outputs",
  "instance",
  "applicationDeployed",
  "migrationRun",
  "seedRun",
  "dnsModified"
]);
const outputKeys = Object.freeze([
  "InstanceId",
  "ElasticIp",
  "DataVolumeId",
  "ReleaseBucketName",
  "BackupBucketName",
  "ApplicationSecretArn",
  "HostBootstrapDocumentName",
  "HostVerificationDocumentName",
  "CloudWatchAgentConfigParameterName",
  "BudgetName"
]);
const instanceKeys = Object.freeze(["instanceId", "instanceType", "state"]);
const temporaryOpenFlags = fsConstants.O_WRONLY
  | fsConstants.O_CREAT
  | fsConstants.O_EXCL
  | fsConstants.O_NOFOLLOW;
const directoryOpenFlags = fsConstants.O_RDONLY
  | fsConstants.O_DIRECTORY
  | fsConstants.O_NOFOLLOW;
const instanceIdPattern = /^i-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const volumeIdPattern = /^vol-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const ssmDocumentNamePattern = /^[A-Za-z0-9_.-]{3,128}$/;
const accessKeyIdPattern = /^(?:AKIA|ASIA)[A-Z0-9]{16}$/;
const secretAccessKeyPattern = /^(?=.{40}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[+/])[A-Za-z0-9+/=]+$/;
const sessionTokenPattern = /^(?:FwoGZXIvYXdz|IQoJb3JpZ2luX2Vj)[A-Za-z0-9+/=]{20,}$/;

function requireExactKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object with exact keys`);
  }
  const actualKeys = Reflect.ownKeys(value);
  const hasOnlyStringKeys = actualKeys.every((key) => typeof key === "string");
  const sameKeys = hasOnlyStringKeys
    && actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(value, key));
  if (!sameKeys) {
    throw new Error(`${label} must contain exact keys: ${expectedKeys.join(", ")}`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function requireSafeResourceValue(value, label) {
  if (accessKeyIdPattern.test(value)
    || secretAccessKeyPattern.test(value)
    || sessionTokenPattern.test(value)
    || /^[A-Za-z][A-Za-z0-9_.-]*=/.test(value)
    || /(?:\$\(|`|;|&&|\|\||[<>]|\r|\n|^#!|cloud-config|user[-_ ]?data)/i.test(value)) {
    throw new Error(`${label} contains an unsafe credential, assignment, shell, or user-data value`);
  }
  return value;
}

function requirePattern(value, pattern, label) {
  if (!pattern.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function requireBucketName(value, label) {
  const validCharacters = value.length >= 3
    && value.length <= 63
    && value.split(".").every((labelPart) => (
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(labelPart)
    ));
  const forbiddenShape = value.includes("..")
    || isIPv4(value)
    || value.startsWith("xn--")
    || value.startsWith("sthree-")
    || value.startsWith("amzn-s3-demo-")
    || value.endsWith("-s3alias")
    || value.endsWith("--ol-s3")
    || value.endsWith(".mrap")
    || value.endsWith("--x-s3")
    || value.endsWith("--table-s3");
  if (!validCharacters || forbiddenShape) {
    throw new Error(`${label} bucket name is invalid`);
  }
  return value;
}

function reconstructRedactedEvidence(evidence) {
  const region = requireAwsStagingRegion(evidence.region);
  requireExactKeys(evidence, topLevelEvidenceKeys, "AWS Staging evidence");
  requireExactKeys(evidence.outputs, outputKeys, "AWS Staging evidence outputs");
  requireExactKeys(evidence.instance, instanceKeys, "AWS Staging evidence instance");

  if (evidence.scope !== "environment-only") {
    throw new Error("AWS Staging evidence scope must be environment-only");
  }
  if (typeof evidence.accountId !== "string" || !/^\d{12}$/.test(evidence.accountId)) {
    throw new Error("AWS Staging evidence accountId must contain exactly 12 digits");
  }
  if (evidence.stackName !== "needo-staging-infrastructure") {
    throw new Error("AWS Staging evidence stackName is not approved");
  }
  if (!stableStackStates.has(evidence.stackStatus)) {
    throw new Error("AWS Staging evidence stackStatus is not stable complete");
  }
  for (const flag of ["applicationDeployed", "migrationRun", "seedRun", "dnsModified"]) {
    if (evidence[flag] !== false) {
      throw new Error(`AWS Staging evidence ${flag} must be explicitly false`);
    }
  }

  const outputs = Object.fromEntries(outputKeys.map((key) => [
    key,
    requireSafeResourceValue(
      requireNonEmptyString(evidence.outputs[key], `AWS Staging evidence outputs.${key}`),
      `AWS Staging evidence outputs.${key}`
    )
  ]));
  if (outputs.ApplicationSecretArn !== "REDACTED") {
    throw new Error("AWS Staging evidence ApplicationSecretArn must be exactly REDACTED");
  }
  const instance = Object.fromEntries(instanceKeys.map((key) => [
    key,
    requireSafeResourceValue(
      requireNonEmptyString(evidence.instance[key], `AWS Staging evidence instance.${key}`),
      `AWS Staging evidence instance.${key}`
    )
  ]));

  const serializedValues = [
    evidence.scope,
    evidence.accountId,
    evidence.region,
    evidence.stackName,
    evidence.stackStatus,
    ...Object.values(outputs),
    ...Object.values(instance)
  ].join("\n");
  if (/arn:[a-z0-9-]+:/i.test(serializedValues)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serializedValues)
    || /access.?key|secret.?access.?key|session.?token|credential|parameter.?overrides|cloud.?formation.?parameters|caller.?arn|user.?data/i.test(serializedValues)) {
    throw new Error("AWS Staging evidence contains a forbidden ARN, email, credential, parameter, or userData surface");
  }

  requirePattern(outputs.InstanceId, instanceIdPattern, "AWS Staging evidence outputs.InstanceId");
  if (!isIPv4(outputs.ElasticIp)) {
    throw new Error("AWS Staging evidence outputs.ElasticIp is invalid");
  }
  requirePattern(outputs.DataVolumeId, volumeIdPattern, "AWS Staging evidence outputs.DataVolumeId");
  requireBucketName(outputs.ReleaseBucketName, "AWS Staging evidence outputs.ReleaseBucketName");
  requireBucketName(outputs.BackupBucketName, "AWS Staging evidence outputs.BackupBucketName");
  if (outputs.ReleaseBucketName === outputs.BackupBucketName) {
    throw new Error("AWS Staging evidence bucket names must be distinct");
  }
  requirePattern(
    outputs.HostBootstrapDocumentName,
    ssmDocumentNamePattern,
    "AWS Staging evidence outputs.HostBootstrapDocumentName"
  );
  requirePattern(
    outputs.HostVerificationDocumentName,
    ssmDocumentNamePattern,
    "AWS Staging evidence outputs.HostVerificationDocumentName"
  );
  if (outputs.HostBootstrapDocumentName === outputs.HostVerificationDocumentName) {
    throw new Error("AWS Staging evidence document names must be distinct");
  }
  if (outputs.CloudWatchAgentConfigParameterName !== "/needo/staging/cloudwatch-agent") {
    throw new Error("AWS Staging evidence outputs.CloudWatchAgentConfigParameterName is invalid");
  }
  if (outputs.BudgetName !== "needo-staging-infrastructure-monthly-cost") {
    throw new Error("AWS Staging evidence outputs.BudgetName is invalid");
  }
  if (instance.instanceId !== outputs.InstanceId) {
    throw new Error("AWS Staging evidence instance identity does not match outputs.InstanceId");
  }
  if (instance.instanceType !== "t4g.large") {
    throw new Error("AWS Staging evidence instanceType must be t4g.large");
  }
  if (instance.state !== "running") {
    throw new Error("AWS Staging evidence instance state must be running");
  }

  const reconstructed = {
    scope: "environment-only",
    accountId: evidence.accountId,
    region,
    stackName: "needo-staging-infrastructure",
    stackStatus: evidence.stackStatus,
    outputs,
    instance,
    applicationDeployed: false,
    migrationRun: false,
    seedRun: false,
    dnsModified: false
  };

  return reconstructed;
}

function requireAbsoluteDescendant(trustedRoot, outputDirectory) {
  if (!path.isAbsolute(trustedRoot) || !path.isAbsolute(outputDirectory)) {
    throw new Error("AWS Staging evidence outputDirectory must be an absolute descendant of trustedRoot");
  }
  const normalizedRoot = path.resolve(trustedRoot);
  const normalizedOutput = path.resolve(outputDirectory);
  const relativeOutput = path.relative(normalizedRoot, normalizedOutput);
  if (!relativeOutput
    || relativeOutput === ".."
    || relativeOutput.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeOutput)) {
    throw new Error("AWS Staging evidence outputDirectory must be an absolute descendant of trustedRoot");
  }
  return {
    normalizedRoot,
    normalizedOutput,
    components: relativeOutput.split(path.sep)
  };
}

function isMissing(error) {
  return error?.code === "ENOENT";
}

async function requireRealDirectory(fileSystem, directoryPath) {
  const stats = await fileSystem.lstat(directoryPath);
  if (stats.isSymbolicLink()) {
    throw new Error(`AWS Staging evidence path component must not be a symlink: ${directoryPath}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`AWS Staging evidence path component must be a real directory: ${directoryPath}`);
  }
  return stats;
}

async function captureDirectoryIdentity(fileSystem, directoryPath) {
  const stats = await requireRealDirectory(fileSystem, directoryPath);
  const identity = Object.freeze({
    path: directoryPath,
    realPath: await fileSystem.realpath(directoryPath),
    dev: stats.dev,
    ino: stats.ino
  });
  await verifyDirectoryIdentities(fileSystem, [identity]);
  return identity;
}

async function prepareDirectoryPath(fileSystem, pathBoundary) {
  const identities = [
    await captureDirectoryIdentity(fileSystem, pathBoundary.normalizedRoot)
  ];
  let currentPath = pathBoundary.normalizedRoot;

  for (const component of pathBoundary.components) {
    currentPath = path.join(currentPath, component);
    await verifyDirectoryIdentities(fileSystem, identities);
    try {
      await requireRealDirectory(fileSystem, currentPath);
    } catch (error) {
      if (!isMissing(error)) throw error;
      await verifyDirectoryIdentities(fileSystem, identities);
      try {
        await fileSystem.mkdir(currentPath, { mode: 0o700 });
      } catch (mkdirError) {
        if (mkdirError?.code !== "EEXIST") throw mkdirError;
      }
      await verifyDirectoryIdentities(fileSystem, identities);
    }
    await verifyDirectoryIdentities(fileSystem, identities);
    const componentIdentity = await captureDirectoryIdentity(fileSystem, currentPath);
    await verifyDirectoryIdentities(fileSystem, identities);
    identities.push(componentIdentity);
    await verifyDirectoryIdentities(fileSystem, identities);
  }

  return Object.freeze(identities);
}

async function verifyDirectoryIdentities(fileSystem, identities) {
  for (const identity of identities) {
    let stats;
    let realPath;
    try {
      stats = await requireRealDirectory(fileSystem, identity.path);
      realPath = await fileSystem.realpath(identity.path);
    } catch (error) {
      throw new Error(`AWS Staging evidence directory identity changed: ${identity.path}`, { cause: error });
    }
    if (stats.dev !== identity.dev
      || stats.ino !== identity.ino
      || realPath !== identity.realPath) {
      throw new Error(`AWS Staging evidence directory identity changed: ${identity.path}`);
    }
  }
}

function requireSameDirectory(stats, expectedIdentity) {
  if (!stats.isDirectory()
    || stats.dev !== expectedIdentity.dev
    || stats.ino !== expectedIdentity.ino) {
    throw new Error(`AWS Staging evidence directory handle identity changed: ${expectedIdentity.path}`);
  }
}

async function enforcePrivateEvidenceDirectory(fileSystem, identities) {
  const finalIdentity = identities.at(-1);
  await verifyDirectoryIdentities(fileSystem, identities);
  const directoryHandle = await fileSystem.open(finalIdentity.path, directoryOpenFlags);
  try {
    requireSameDirectory(await directoryHandle.stat(), finalIdentity);
    await directoryHandle.chmod(0o700);
    const privateStats = await directoryHandle.stat();
    requireSameDirectory(privateStats, finalIdentity);
    if ((privateStats.mode & 0o777) !== 0o700) {
      throw new Error("AWS Staging evidence directory mode must be 0700");
    }
  } finally {
    await directoryHandle.close();
  }
  await verifyDirectoryIdentities(fileSystem, identities);
  const finalPathStats = await requireRealDirectory(fileSystem, finalIdentity.path);
  requireSameDirectory(finalPathStats, finalIdentity);
  if ((finalPathStats.mode & 0o777) !== 0o700) {
    throw new Error("AWS Staging evidence directory mode must be 0700");
  }
}

function requireSameRegularFile(stats, expectedIdentity, label) {
  if (!stats.isFile()
    || stats.isSymbolicLink()
    || stats.dev !== expectedIdentity.dev
    || stats.ino !== expectedIdentity.ino) {
    throw new Error(`AWS Staging evidence ${label} identity changed`);
  }
}

async function removeTemporaryFile(fileSystem, temporaryPath) {
  try {
    await fileSystem.unlink(temporaryPath);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

export async function writeAwsStagingEnvironmentEvidence({
  evidence,
  outputDirectory = defaultOutputDirectory,
  trustedRoot = defaultTrustedRoot,
  fileSystem = fs
}) {
  const reconstructed = reconstructRedactedEvidence(evidence);
  const contents = `${JSON.stringify(reconstructed, null, 2)}\n`;
  const pathBoundary = requireAbsoluteDescendant(trustedRoot, outputDirectory);
  const directoryIdentities = await prepareDirectoryPath(fileSystem, pathBoundary);
  await enforcePrivateEvidenceDirectory(fileSystem, directoryIdentities);

  const finalPath = path.join(pathBoundary.normalizedOutput, evidenceFileName);
  const temporaryPath = path.join(
    pathBoundary.normalizedOutput,
    `.${evidenceFileName}.${process.pid}.${randomUUID()}.tmp`
  );
  let temporaryCreated = false;
  let handle;

  try {
    // Node has no openat/renameat API. Rechecking every path component and its
    // realpath/dev/ino identity around each critical operation is the strongest
    // dependency-free boundary available here; O_NOFOLLOW also protects the leaf.
    await verifyDirectoryIdentities(fileSystem, directoryIdentities);
    handle = await fileSystem.open(temporaryPath, temporaryOpenFlags, 0o600);
    temporaryCreated = true;
    try {
      await verifyDirectoryIdentities(fileSystem, directoryIdentities);
      await handle.chmod(0o600);
      const openedStats = await handle.stat();
      if (!openedStats.isFile()) {
        throw new Error("AWS Staging evidence temporary path is not a regular file");
      }
      const temporaryIdentity = { dev: openedStats.dev, ino: openedStats.ino };
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;

      await verifyDirectoryIdentities(fileSystem, directoryIdentities);
      const temporaryStats = await fileSystem.lstat(temporaryPath);
      requireSameRegularFile(temporaryStats, temporaryIdentity, "temporary file");
      await fileSystem.rename(temporaryPath, finalPath);
      temporaryCreated = false;
      await verifyDirectoryIdentities(fileSystem, directoryIdentities);
      const finalStats = await fileSystem.lstat(finalPath);
      requireSameRegularFile(finalStats, temporaryIdentity, "final file");
      if ((finalStats.mode & 0o777) !== 0o600) {
        throw new Error("AWS Staging evidence final file mode must be 0600");
      }
      return finalPath;
    } finally {
      if (handle) {
        await handle.close();
        handle = undefined;
      }
    }
  } catch (error) {
    const cleanupErrors = [];
    if (handle) {
      try {
        await handle.close();
      } catch (closeError) {
        cleanupErrors.push(closeError);
      }
      handle = undefined;
    }
    if (temporaryCreated) {
      try {
        await removeTemporaryFile(fileSystem, temporaryPath);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        "AWS Staging evidence write failed and cleanup also failed"
      );
    }
    throw error;
  }
}

export async function runAwsStagingDeployCli(argv) {
  const config = resolveAwsStagingConfig(parseAwsStagingArgs(argv));
  const aws = createAwsCli({ profile: config.profile, region: config.region });
  const evidence = await deployAwsStagingInfrastructure({
    aws,
    config,
    runPreflight: runAwsStagingPreflight
  });
  const evidencePath = await writeAwsStagingEnvironmentEvidence({ evidence });
  return Object.freeze({
    gate: "aws-staging-deploy",
    scope: evidence.scope,
    stackStatus: evidence.stackStatus,
    evidenceFile: path.relative(path.resolve(moduleDir, ".."), evidencePath),
    applicationDeployed: false,
    migrationRun: false,
    seedRun: false,
    dnsModified: false
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const summary = await runAwsStagingDeployCli(process.argv.slice(2));
  console.log(JSON.stringify(summary));
}
