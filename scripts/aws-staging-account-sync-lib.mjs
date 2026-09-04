import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const APPROVED = Object.freeze({ profile: "needo-staging-bootstrap", accountId: "430611185505", region: "ap-southeast-2", stackName: "needo-staging-infrastructure" });
const FULL_REVISION = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const INSTANCE_ID = /^i-[0-9a-f]{17}$/;
const VOLUME_ID = /^vol-[0-9a-f]{17}$/;
const SNAPSHOT_ID = /^snap-[0-9a-f]{17}$/;
const COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION_ID = /^[A-Za-z0-9._-]{1,1024}$/;
const BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const TABLES = ["users", "shops", "merchant_accounts", "customer_profiles", "technician_profiles", "user_identities", "merchant_identity_profiles", "user_roles", "merchant_shop_memberships", "technician_shop_affiliations", "public_identifiers"];

const fail = (code) => { throw new Error(code); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const shellQuote = (value) => {
  if (typeof value !== "string" || !value || /[\0\r\n]/u.test(value)) fail("ACCOUNT_SYNC_COMMAND_VALUE_REJECTED");
  return `'${value.replaceAll("'", `"'"'`)}'`;
};
const requireBucket = (value) => {
  if (typeof value !== "string" || !BUCKET.test(value) || value.includes("..") || value.includes(".-") || value.includes("-.")) fail("ACCOUNT_SYNC_BUCKET_REJECTED");
  return value;
};
const requirePositiveInteger = (value, code) => {
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
};

export const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const validateSyncInput = (input, localSha256) => {
  if (!input || input.profile !== APPROVED.profile || input.accountId !== APPROVED.accountId || input.region !== APPROVED.region || !path.isAbsolute(input.bundlePath ?? "") || !SHA256.test(input.bundleSha256 ?? "") || !FULL_REVISION.test(input.sourceRevision ?? "")) fail("ACCOUNT_SYNC_TARGET_REJECTED");
  if (localSha256 !== input.bundleSha256) fail("ACCOUNT_SYNC_BUNDLE_SHA_INVALID");
  return Object.freeze({ ...input });
};

export const transferObjectKey = (sourceRevision, bundleSha256) => {
  if (!FULL_REVISION.test(sourceRevision ?? "") || !SHA256.test(bundleSha256 ?? "")) fail("ACCOUNT_SYNC_TRANSFER_REJECTED");
  return `staging/account-sync/${sourceRevision}/${bundleSha256}.json.gz`;
};

export const validateLiveEnvironment = (live, input) => {
  if (!live || live.accountId !== APPROVED.accountId || live.region !== APPROVED.region || live.callerKind !== "assumed-role" || live.stackName !== APPROVED.stackName || !["CREATE_COMPLETE", "UPDATE_COMPLETE"].includes(live.stackStatus) || !INSTANCE_ID.test(live.instanceId ?? "") || !VOLUME_ID.test(live.volumeId ?? "") || !requireBucket(live.releaseBucket) || !requireBucket(live.backupBucket) || live.releaseBucket === live.backupBucket || live.ssmOnline !== true || live.releaseRevision !== input.sourceRevision || live.registrationCode !== 40313 || live.applicationDeployment?.sourceRevision !== input.sourceRevision || live.applicationDeployment?.status !== "passed") fail("ACCOUNT_SYNC_LIVE_ENVIRONMENT_REJECTED");
  if (input.instanceId && input.instanceId !== live.instanceId || input.volumeId && input.volumeId !== live.volumeId || input.releaseBucket && input.releaseBucket !== live.releaseBucket || input.backupBucket && input.backupBucket !== live.backupBucket) fail("ACCOUNT_SYNC_LIVE_ENVIRONMENT_REJECTED");
  return Object.freeze({ ...live });
};

export const validateUpload = (head, expected) => {
  if (!head || !VERSION_ID.test(head.VersionId ?? "") || head.VersionId !== expected.versionId || head.ContentLength !== requirePositiveInteger(expected.bundleBytes, "ACCOUNT_SYNC_TRANSFER_REJECTED") || head.Metadata?.sha256 !== expected.bundleSha256 || head.Metadata?.["source-revision"] !== expected.sourceRevision) fail("ACCOUNT_SYNC_TRANSFER_REJECTED");
  return Object.freeze({ key: expected.transferKey, versionId: head.VersionId, bytes: head.ContentLength });
};

export const validateSnapshot = (snapshot, volumeId) => {
  if (!snapshot || !SNAPSHOT_ID.test(snapshot.SnapshotId ?? "") || snapshot.VolumeId !== volumeId) fail("ACCOUNT_SYNC_SNAPSHOT_IDENTITY_REJECTED");
  if (snapshot.State !== "completed") fail("ACCOUNT_SYNC_SNAPSHOT_STATE_REJECTED");
  return Object.freeze({ snapshotId: snapshot.SnapshotId, volumeId });
};

const summaryKeys = ["gate", "status", "userCount", "nonTestUserCount", "administratorCount", "tableCounts", "verificationDigests"];
export const parseImportSummary = (stdout) => {
  let value;
  try { value = JSON.parse(typeof stdout === "string" ? stdout.trim() : ""); } catch { fail("ACCOUNT_SYNC_SSM_SUMMARY_REJECTED"); }
  if (!exactKeys(value, summaryKeys) || value.gate !== "staging-selective-account-import" || value.status !== "passed" || value.userCount !== 252 || value.nonTestUserCount !== 0 || value.administratorCount !== 1 || !exactKeys(value.tableCounts, TABLES) || !exactKeys(value.verificationDigests, TABLES)) fail("ACCOUNT_SYNC_SSM_SUMMARY_REJECTED");
  for (const table of TABLES) if (!Number.isSafeInteger(value.tableCounts[table]) || value.tableCounts[table] < 0 || !SHA256.test(value.verificationDigests[table] ?? "")) fail("ACCOUNT_SYNC_SSM_SUMMARY_REJECTED");
  return Object.freeze({ ...value, tableCounts: Object.freeze({ ...value.tableCounts }), verificationDigests: Object.freeze({ ...value.verificationDigests }) });
};

const hostResultKeys = ["importSummary", "backupKey", "backupVersionId", "backupSha256"];
export const parseHostResult = (stdout, expectedBackupKey) => {
  let value;
  try { value = JSON.parse(typeof stdout === "string" ? stdout.trim() : ""); } catch { fail("ACCOUNT_SYNC_SSM_SUMMARY_REJECTED"); }
  if (!exactKeys(value, hostResultKeys) || value.backupKey !== expectedBackupKey || !VERSION_ID.test(value.backupVersionId ?? "") || !SHA256.test(value.backupSha256 ?? "")) fail("ACCOUNT_SYNC_SSM_SUMMARY_REJECTED");
  return Object.freeze({ importSummary: parseImportSummary(JSON.stringify(value.importSummary)), backupKey: value.backupKey, backupVersionId: value.backupVersionId, backupSha256: value.backupSha256 });
};

export const buildHostCommand = ({ region, transferBucket, transferKey, transferVersionId, backupBucket, backupKey, sourceRevision, bundleSha256 }) => {
  requireBucket(transferBucket); requireBucket(backupBucket);
  if (region !== APPROVED.region || !FULL_REVISION.test(sourceRevision ?? "") || !SHA256.test(bundleSha256 ?? "") || !VERSION_ID.test(transferVersionId ?? "") || transferKey !== transferObjectKey(sourceRevision, bundleSha256) || !new RegExp(`^staging/pre-account-sync/${sourceRevision}/[0-9]+-${bundleSha256}\\.sql\\.gz$`).test(backupKey ?? "")) fail("ACCOUNT_SYNC_COMMAND_VALUE_REJECTED");
  const compose = "docker compose --env-file /srv/needo/config/staging.env --project-name needo-staging --file \"$current_release/deploy/staging/docker-compose.yml\"";
  return [
    "set -euo pipefail", "umask 077", "bundle_path=''", "backup_path=''", "transfer_deleted=0", `cleanup() { status=$?; trap - EXIT; rm -f -- \"$bundle_path\" \"$backup_path\"; if [ \"$transfer_deleted\" -ne 1 ]; then aws s3api delete-object --region ${shellQuote(region)} --bucket ${shellQuote(transferBucket)} --key ${shellQuote(transferKey)} --version-id ${shellQuote(transferVersionId)} >/dev/null || true; fi; exit \"$status\"; }`, "trap cleanup EXIT", "exec 9>/srv/needo/account-sync.lock", "flock -n 9",
    "current_release=$(readlink -f /srv/needo/current)", "test -d \"$current_release\"", "manifest_path=/srv/needo/active-release.json", "test -f \"$manifest_path\"",
    `test "$(python3 -c 'import json,os,re,sys; value=json.load(open(sys.argv[1],encoding="utf-8")); assert set(value)=={"sourceRevision","archiveSha256"}; revision=value["sourceRevision"]; archive=value["archiveSha256"]; assert isinstance(revision,str) and re.fullmatch(r"[a-f0-9]{40}",revision); assert isinstance(archive,str) and re.fullmatch(r"[a-f0-9]{64}",archive); expected=os.path.join(os.path.realpath("/srv/needo/releases"),revision+"-"+archive[:16]); assert os.path.realpath(sys.argv[2])==expected; print(revision)' "$manifest_path" "$current_release")" = ${shellQuote(sourceRevision)}`,
    "install -d -m 0700 /srv/needo/tmp", "bundle_path=$(mktemp /srv/needo/account-sync.XXXXXX.json.gz)",
    `aws s3api get-object --region ${shellQuote(region)} --bucket ${shellQuote(transferBucket)} --key ${shellQuote(transferKey)} --version-id ${shellQuote(transferVersionId)} \"$bundle_path\" >/dev/null`,
    `printf '%s  %s\\n' ${shellQuote(bundleSha256)} \"$bundle_path\" | sha256sum --check >/dev/null`,
    `backend_uid=$(${compose} run --rm --no-deps backend id -u)`, "case \"$backend_uid\" in *[!0-9]*|'') exit 1 ;; esac", "chown \"$backend_uid\" \"$bundle_path\"", "chmod 0600 \"$bundle_path\"",
    `backup_path=/srv/needo/tmp/pre-account-sync-$(date +%s)-${bundleSha256}.sql.gz`,
    `${compose} exec -T mysql sh -c 'MYSQL_PWD=\"$MYSQL_PASSWORD\" mysqldump --single-transaction --routines --triggers --no-tablespaces -u\"$MYSQL_USER\" \"$MYSQL_DATABASE\"' | gzip -c > \"$backup_path\"`,
    "backup_sha256=$(sha256sum \"$backup_path\" | awk '{print $1}')",
    `backup_version_id=$(aws s3api put-object --region ${shellQuote(region)} --bucket ${shellQuote(backupBucket)} --key ${shellQuote(backupKey)} --body \"$backup_path\" --metadata sha256=\"$backup_sha256\" --query VersionId --output text)`, "test \"$backup_version_id\" != None", `aws s3api head-object --region ${shellQuote(region)} --bucket ${shellQuote(backupBucket)} --key ${shellQuote(backupKey)} --version-id \"$backup_version_id\" --query 'Metadata.sha256' --output text | grep -Fx \"$backup_sha256\" >/dev/null`,
    `import_summary=$(${compose} run --rm --no-deps --volume \"$bundle_path:/run/needo/account-sync.json.gz:ro\" backend node dist/staging/selective-account-import.cli.js --input /run/needo/account-sync.json.gz --sha256 ${shellQuote(bundleSha256)})`, "test \"$(printf '%s\\n' \"$import_summary\" | wc -l | tr -d ' ')\" = 1",
    `aws s3api delete-object --region ${shellQuote(region)} --bucket ${shellQuote(transferBucket)} --key ${shellQuote(transferKey)} --version-id ${shellQuote(transferVersionId)} >/dev/null`, "transfer_deleted=1",
    "rm -f -- \"$bundle_path\" \"$backup_path\"", "bundle_path=''", "backup_path=''", "trap - EXIT", `python3 -c 'import json,sys; summary=json.loads(sys.argv[1]); print(json.dumps({"importSummary":summary,"backupKey":sys.argv[2],"backupVersionId":sys.argv[3],"backupSha256":sys.argv[4]},separators=(",",":")))' "$import_summary" ${shellQuote(backupKey)} "$backup_version_id" "$backup_sha256"`
  ].join("\n");
};

export const createRedactedSyncEvidence = (input) => {
  const keys = ["timestamp", "accountId", "region", "instanceId", "dataVolumeId", "sourceRevision", "bundleSha256", "bundleBytes", "transferBucket", "transferKey", "transferVersionId", "snapshotId", "backupBucket", "backupKey", "backupVersionId", "backupSha256", "commandId", "summary"];
  if (!exactKeys(input, keys) || input.accountId !== APPROVED.accountId || input.region !== APPROVED.region || !INSTANCE_ID.test(input.instanceId ?? "") || !VOLUME_ID.test(input.dataVolumeId ?? "") || !FULL_REVISION.test(input.sourceRevision ?? "") || !SHA256.test(input.bundleSha256 ?? "") || !SNAPSHOT_ID.test(input.snapshotId ?? "") || !COMMAND_ID.test(input.commandId ?? "") || !VERSION_ID.test(input.transferVersionId ?? "") || !VERSION_ID.test(input.backupVersionId ?? "") || !SHA256.test(input.backupSha256 ?? "") || input.transferKey !== transferObjectKey(input.sourceRevision, input.bundleSha256)) fail("ACCOUNT_SYNC_EVIDENCE_REJECTED");
  const timestamp = new Date(input.timestamp); if (timestamp.toISOString() !== input.timestamp) fail("ACCOUNT_SYNC_EVIDENCE_REJECTED");
  requireBucket(input.transferBucket); requireBucket(input.backupBucket); requirePositiveInteger(input.bundleBytes, "ACCOUNT_SYNC_EVIDENCE_REJECTED");
  const summary = parseImportSummary(JSON.stringify(input.summary));
  return Object.freeze({ gate: "aws-staging-account-sync", status: "passed", timestamp: input.timestamp, accountId: input.accountId, region: input.region, instanceId: input.instanceId, dataVolumeId: input.dataVolumeId, sourceRevision: input.sourceRevision, bundleSha256: input.bundleSha256, bundleBytes: input.bundleBytes, transfer: Object.freeze({ bucket: input.transferBucket, key: input.transferKey, versionId: input.transferVersionId }), snapshotId: input.snapshotId, logicalBackup: Object.freeze({ bucket: input.backupBucket, key: input.backupKey, versionId: input.backupVersionId, sha256: input.backupSha256 }), commandId: input.commandId, userCount: summary.userCount, nonTestUserCount: summary.nonTestUserCount, administratorCount: summary.administratorCount, tableCounts: summary.tableCounts, verificationDigests: summary.verificationDigests });
};

export const writeRedactedEvidenceAtomic = async (filePath, evidence) => {
  const serialized = `${JSON.stringify(evidence)}\n`;
  if (!path.isAbsolute(filePath) || /(?:password|token|secret|stdout|bundle_path)/iu.test(serialized)) fail("ACCOUNT_SYNC_EVIDENCE_REJECTED");
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, serialized, { mode: 0o600, flag: "wx" });
  await fs.rename(temporary, filePath);
  await fs.chmod(filePath, 0o600);
};

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const waitForSnapshot = async (aws, snapshotId, volumeId, attempts = 80, wait = delay) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const described = await aws.json(["ec2", "describe-snapshots", "--snapshot-ids", snapshotId]);
    const snapshot = described?.Snapshots?.[0];
    if (!snapshot || snapshot.SnapshotId !== snapshotId || snapshot.VolumeId !== volumeId) fail("ACCOUNT_SYNC_SNAPSHOT_IDENTITY_REJECTED");
    if (snapshot.State === "completed") return validateSnapshot(snapshot, volumeId);
    if (snapshot.State === "error") fail("ACCOUNT_SYNC_SNAPSHOT_STATE_REJECTED");
    await wait(15_000);
  }
  fail("ACCOUNT_SYNC_SNAPSHOT_STATE_REJECTED");
};

export const waitForCommand = async (aws, commandId, instanceId, expectedBackupKey, attempts = 361, wait = delay) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const invocation = await aws.json(["ssm", "get-command-invocation", "--command-id", commandId, "--instance-id", instanceId], { allowInvocationDelay: true });
    if (invocation?.Status === "Success" && invocation.ResponseCode === 0) return parseHostResult(invocation.StandardOutputContent, expectedBackupKey);
    if (invocation?.Status === "Success") fail("ACCOUNT_SYNC_SSM_STATUS_REJECTED");
    if (["Cancelled", "Cancelling", "Failed", "TimedOut", "Undeliverable", "Terminated"].includes(invocation?.Status)) fail("ACCOUNT_SYNC_SSM_STATUS_REJECTED");
    await wait(10_000);
  }
  fail("ACCOUNT_SYNC_SSM_STATUS_REJECTED");
};

export const orchestrateStagingAccountSync = async ({ aws, input, localSha256, live, timestamp, writeEvidence = async () => {} }) => {
  if (!aws || typeof aws.json !== "function" || typeof writeEvidence !== "function") fail("ACCOUNT_SYNC_ORCHESTRATOR_REJECTED");
  const approvedInput = validateSyncInput(input, localSha256);
  const environment = validateLiveEnvironment(live, approvedInput);
  const bundleBytes = requirePositiveInteger(approvedInput.bundleBytes, "ACCOUNT_SYNC_BUNDLE_SHA_INVALID");
  const operationTime = new Date(timestamp);
  if (operationTime.toISOString() !== timestamp) fail("ACCOUNT_SYNC_EVIDENCE_REJECTED");
  const transferKey = transferObjectKey(approvedInput.sourceRevision, approvedInput.bundleSha256);
  const uploaded = await aws.json(["s3api", "put-object", "--bucket", environment.releaseBucket, "--key", transferKey, "--body", approvedInput.bundlePath, "--metadata", `sha256=${approvedInput.bundleSha256},source-revision=${approvedInput.sourceRevision}`]);
  if (!VERSION_ID.test(uploaded?.VersionId ?? "")) fail("ACCOUNT_SYNC_TRANSFER_REJECTED");
  const deleteTransfer = async () => {
    try { await aws.json(["s3api", "delete-object", "--bucket", environment.releaseBucket, "--key", transferKey, "--version-id", uploaded.VersionId]); } catch { /* best-effort compensating cleanup */ }
  };
  try {
  const transfer = validateUpload(await aws.json(["s3api", "head-object", "--bucket", environment.releaseBucket, "--key", transferKey, "--version-id", uploaded.VersionId]), { ...approvedInput, bundleBytes, transferKey, versionId: uploaded.VersionId });
  const createdSnapshot = await aws.json(["ec2", "create-snapshot", "--volume-id", environment.volumeId, "--description", `NeeDo pre-account-sync ${approvedInput.sourceRevision}`, "--tag-specifications", `ResourceType=snapshot,Tags=[{Key=Project,Value=needo},{Key=Environment,Value=staging},{Key=Purpose,Value=pre-account-sync},{Key=SourceRevision,Value=${approvedInput.sourceRevision}]`]);
  if (createdSnapshot?.VolumeId !== environment.volumeId || !SNAPSHOT_ID.test(createdSnapshot?.SnapshotId ?? "")) fail("ACCOUNT_SYNC_SNAPSHOT_IDENTITY_REJECTED");
  const snapshot = await waitForSnapshot(aws, createdSnapshot.SnapshotId, environment.volumeId);
  const backupKey = `staging/pre-account-sync/${approvedInput.sourceRevision}/${operationTime.getTime()}-${approvedInput.bundleSha256}.sql.gz`;
  const hostCommand = buildHostCommand({ region: approvedInput.region, transferBucket: environment.releaseBucket, transferKey, transferVersionId: transfer.versionId, backupBucket: environment.backupBucket, backupKey, sourceRevision: approvedInput.sourceRevision, bundleSha256: approvedInput.bundleSha256 });
  const sent = await aws.json(["ssm", "send-command", "--document-name", "AWS-RunShellScript", "--instance-ids", environment.instanceId, "--timeout-seconds", "3600", "--comment", `NeeDo staging account sync ${approvedInput.sourceRevision.slice(0, 12)}`, "--parameters", JSON.stringify({ commands: [hostCommand], executionTimeout: ["3600"] })]);
  const commandId = sent?.Command?.CommandId;
  if (!COMMAND_ID.test(commandId ?? "")) fail("ACCOUNT_SYNC_SSM_STATUS_REJECTED");
  const result = await waitForCommand(aws, commandId, environment.instanceId, backupKey);
  const backup = await aws.json(["s3api", "head-object", "--bucket", environment.backupBucket, "--key", result.backupKey, "--version-id", result.backupVersionId]);
  if (backup?.VersionId !== result.backupVersionId || !Number.isSafeInteger(backup?.ContentLength) || backup.ContentLength <= 0 || backup?.Metadata?.sha256 !== result.backupSha256) fail("ACCOUNT_SYNC_BACKUP_REJECTED");
  const evidence = createRedactedSyncEvidence({ timestamp, accountId: approvedInput.accountId, region: approvedInput.region, instanceId: environment.instanceId, dataVolumeId: environment.volumeId, sourceRevision: approvedInput.sourceRevision, bundleSha256: approvedInput.bundleSha256, bundleBytes, transferBucket: environment.releaseBucket, transferKey, transferVersionId: transfer.versionId, snapshotId: snapshot.snapshotId, backupBucket: environment.backupBucket, backupKey: result.backupKey, backupVersionId: result.backupVersionId, backupSha256: result.backupSha256, commandId, summary: result.importSummary });
  await writeEvidence(evidence);
  return evidence;
  } finally {
    await deleteTransfer();
  }
};
