import { createHash } from "node:crypto";

const FULL_REVISION = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ACCOUNT_ID = /^\d{12}$/;
const INSTANCE_ID = /^i-[0-9a-f]{17}$/;
const VOLUME_ID = /^vol-[0-9a-f]{17}$/;
const SNAPSHOT_ID = /^snap-[0-9a-f]{17}$/;
const COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const SAFE_VERSION_ID = /^[A-Za-z0-9._-]{1,1024}$/;
const APPROVED_ACCOUNT = "430611185505";
const APPROVED_REGION = "ap-southeast-2";
const APPROVED_HOSTNAME = "staging.needo.life";

function requireString(value, label, pattern) {
  if (typeof value !== "string" || !value || value.trim() !== value || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function requireBucket(value, label) {
  const bucket = requireString(value, label, BUCKET);
  if (bucket.includes("..") || bucket.includes(".-") || bucket.includes("-.")) {
    throw new Error(`${label} is invalid`);
  }
  return bucket;
}

function shellQuote(value) {
  const safe = requireString(value, "shell value");
  if (safe.includes("\0") || safe.includes("\r") || safe.includes("\n")) {
    throw new Error("shell value is invalid");
  }
  return `'${safe.replaceAll("'", `'"'"'`)}'`;
}

export async function assertCleanRevision(repository, approvedRevision) {
  requireString(approvedRevision, "approved revision", FULL_REVISION);
  if (!repository || typeof repository.resolveRevision !== "function" || typeof repository.statusPorcelain !== "function") {
    throw new Error("repository adapter is invalid");
  }
  const [resolvedRevision, status] = await Promise.all([
    repository.resolveRevision(),
    repository.statusPorcelain()
  ]);
  if (resolvedRevision !== approvedRevision) {
    throw new Error("repository revision does not match the approved revision");
  }
  if (typeof status !== "string" || status.length !== 0) {
    throw new Error("repository must be clean before packaging");
  }
  return Object.freeze({ revision: approvedRevision });
}

export function releaseKey(revision, archiveSha256) {
  requireString(revision, "source revision", FULL_REVISION);
  requireString(archiveSha256, "archive SHA-256", SHA256);
  return `staging/releases/${revision}/${archiveSha256}.tar.gz`;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function requireAcceptedEnvironment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("environment acceptance evidence is invalid");
  }
  if (value.accountId !== APPROVED_ACCOUNT
    || value.region !== APPROVED_REGION
    || value.hostname !== APPROVED_HOSTNAME
    || value.applicationDeployed !== false
    || value.migrationRun !== false
    || value.seedRun !== false
    || value.dnsModified !== false
    || value.businessDataMutation !== false
    || value.secretVersionCount !== 0
    || value.ssm?.online !== true
    || value.stack?.name !== "needo-staging-infrastructure"
    || !["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(value.stack?.status)) {
    throw new Error("environment acceptance evidence is not approved for first application deployment");
  }
  const resourceIds = value.resourceIds;
  if (!resourceIds || typeof resourceIds !== "object" || Array.isArray(resourceIds)) {
    throw new Error("environment resource identity is invalid");
  }
  const instanceId = requireString(resourceIds.instanceId, "instance ID", INSTANCE_ID);
  const rootVolumeId = requireString(resourceIds.rootVolumeId, "root volume ID", VOLUME_ID);
  const dataVolumeId = requireString(resourceIds.dataVolumeId, "data volume ID", VOLUME_ID);
  const releaseBucketName = requireBucket(resourceIds.releaseBucketName, "release bucket");
  const backupBucketName = requireBucket(resourceIds.backupBucketName, "backup bucket");
  if (releaseBucketName === backupBucketName) {
    throw new Error("release and backup buckets must be distinct");
  }
  return Object.freeze({
    accountId: APPROVED_ACCOUNT,
    backupBucketName,
    dataVolumeId,
    elasticIp: requireString(value.elasticIp, "Elastic IP", /^32\.236\.134\.43$/),
    hostname: APPROVED_HOSTNAME,
    instanceId,
    region: APPROVED_REGION,
    releaseBucketName,
    rootVolumeId,
    stackName: "needo-staging-infrastructure"
  });
}

export function buildApplicationDeploymentCommand({
  accountId,
  archiveSha256,
  backupBucketName,
  hostname,
  region,
  releaseBucketName,
  releaseObjectKey,
  revision,
  secretId
}) {
  if (accountId !== APPROVED_ACCOUNT || region !== APPROVED_REGION || hostname !== APPROVED_HOSTNAME) {
    throw new Error("deployment target is not the approved staging target");
  }
  requireString(revision, "source revision", FULL_REVISION);
  requireString(archiveSha256, "archive SHA-256", SHA256);
  requireBucket(releaseBucketName, "release bucket");
  requireBucket(backupBucketName, "backup bucket");
  if (releaseObjectKey !== releaseKey(revision, archiveSha256)) {
    throw new Error("release object key does not match release identity");
  }
  requireString(
    secretId,
    "application secret ID",
    /^arn:aws:secretsmanager:ap-southeast-2:430611185505:secret:[A-Za-z0-9/_+=.@-]+$/
  );

  const releaseDirectory = `/srv/needo/releases/${revision}-${archiveSha256.slice(0, 16)}`;
  const archivePath = `/srv/needo/tmp/${archiveSha256}.tar.gz`;
  const checksumLine = `${archiveSha256}  ${archivePath}`;
  return [
    "set -euo pipefail",
    "umask 077",
    "install -d -m 0700 /srv/needo/tmp /srv/needo/releases",
    `archive_path=${shellQuote(archivePath)}`,
    `release_dir=${shellQuote(releaseDirectory)}`,
    "release_created=false",
    "cleanup_failed_release() {",
    "  status=$?",
    "  trap - EXIT",
    "  rm -f -- \"$archive_path\"",
    "  if test \"$status\" -ne 0 && test \"$release_created\" = true; then",
    "    active_release=\"$(readlink -f /srv/needo/current 2>/dev/null || true)\"",
    "    test \"$active_release\" != \"$release_dir\"",
    "    rm -rf --one-file-system -- \"$release_dir\"",
    "  fi",
    "  exit \"$status\"",
    "}",
    "trap cleanup_failed_release EXIT",
    `aws s3 cp ${shellQuote(`s3://${releaseBucketName}/${releaseObjectKey}`)} \"$archive_path\" --region ${shellQuote(region)} --only-show-errors`,
    `printf '%s\\n' ${shellQuote(checksumLine)} | sha256sum --check -`,
    "test ! -e \"$release_dir\"",
    "install -d -m 0750 \"$release_dir\"",
    "release_created=true",
    "tar -xzf \"$archive_path\" -C \"$release_dir\" --no-same-owner --no-same-permissions",
    "test -x \"$release_dir/deploy/staging/deploy-release.sh\"",
    `\"$release_dir/deploy/staging/deploy-release.sh\" --region ${shellQuote(region)} --hostname ${shellQuote(hostname)} --secret-id ${shellQuote(secretId)} --backup-bucket ${shellQuote(backupBucketName)} --revision ${shellQuote(revision)} --archive-sha256 ${shellQuote(archiveSha256)}`,
    "release_created=false",
    "rm -f -- \"$archive_path\"",
    "trap - EXIT"
  ].join("\n");
}

export function createRedactedApplicationEvidence(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("application evidence input is invalid");
  }
  const status = requireString(input.status, "deployment status", /^(?:passed|failed)$/);
  const timestamp = requireString(input.timestamp, "deployment timestamp");
  if (new Date(timestamp).toISOString() !== timestamp) {
    throw new Error("deployment timestamp must be canonical ISO 8601");
  }
  const revision = requireString(input.revision, "source revision", FULL_REVISION);
  const archiveSha256 = requireString(input.archiveSha256, "archive SHA-256", SHA256);
  const releaseObjectKey = requireString(input.releaseObjectKey, "release object key");
  if (releaseObjectKey !== releaseKey(revision, archiveSha256)) {
    throw new Error("release object key does not match release identity");
  }
  const evidence = {
    gate: "aws-staging-application-deployment",
    status,
    timestamp,
    accountId: APPROVED_ACCOUNT,
    region: APPROVED_REGION,
    hostname: APPROVED_HOSTNAME,
    sourceRevision: revision,
    archiveSha256,
    releaseObjectKey,
    objectVersionId: requireString(input.objectVersionId, "release object version", SAFE_VERSION_ID),
    snapshotId: requireString(input.snapshotId, "snapshot ID", SNAPSHOT_ID),
    instanceId: requireString(input.instanceId, "instance ID", INSTANCE_ID),
    commandId: requireString(input.commandId, "SSM command ID", COMMAND_ID),
    secretVersionCount: input.secretVersionCount,
    applicationDeployed: status === "passed",
    migrationRun: status === "passed",
    seedRun: false,
    dnsModified: false,
    businessDataMutation: status === "passed"
  };
  if (input.secretVersionCount !== 1) {
    throw new Error("application secret must have exactly one version");
  }
  return Object.freeze(evidence);
}
