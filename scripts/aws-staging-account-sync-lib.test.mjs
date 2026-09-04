import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildHostCommand,
  createRedactedSyncEvidence,
  orchestrateStagingAccountSync,
  parseHostResult,
  parseImportSummary,
  transferObjectKey,
  validateSnapshot,
  validateSyncInput,
  validateLiveEnvironment,
  validateUpload,
  waitForCommand,
  writeRedactedEvidenceAtomic
} from "./aws-staging-account-sync-lib.mjs";
import { createAws, requireAcceptedDeployment } from "./aws-staging-sync-test-accounts.mjs";

const sha = "a".repeat(64);
const input = { profile: "needo-staging-bootstrap", accountId: "430611185505", region: "ap-southeast-2", bundlePath: "/private/tmp/bundle.json.gz", bundleSha256: sha, sourceRevision: "b".repeat(40), instanceId: "i-0123456789abcdef0", volumeId: "vol-0123456789abcdef0", releaseBucket: "needo-transfer", backupBucket: "needo-backup" };
const tableCounts = Object.fromEntries(["users", "shops", "merchant_accounts", "customer_profiles", "technician_profiles", "user_identities", "merchant_identity_profiles", "user_roles", "merchant_shop_memberships", "technician_shop_affiliations", "public_identifiers"].map((table) => [table, table === "users" ? 261 : 0]));
const verificationDigests = Object.fromEntries(Object.keys(tableCounts).map((table) => [table, sha]));
const validLive = Object.freeze({ accountId: input.accountId, region: input.region, callerKind: "assumed-role", stackName: "needo-staging-infrastructure", stackStatus: "CREATE_COMPLETE", instanceId: "i-0123456789abcdef0", volumeId: "vol-0123456789abcdef0", releaseBucket: "needo-transfer", backupBucket: "needo-backup", releaseRevision: input.sourceRevision, ssmOnline: true, registrationCode: 40313, applicationDeployment: { sourceRevision: input.sourceRevision, status: "passed" } });
const backupKey = `staging/pre-account-sync/${input.sourceRevision}/1-${sha}.sql.gz`;
const importSummary = { gate: "staging-selective-account-import", status: "passed", userCount: 262, nonTestUserCount: 0, administratorCount: 1, tableCounts, verificationDigests };
const hostResult = (versionId = "v-backup", resultBackupKey = backupKey) => JSON.stringify({ importSummary, backupKey: resultBackupKey, backupVersionId: versionId, backupSha256: sha });

test("rejects every target or digest mismatch", () => {
  assert.throws(() => validateSyncInput({ ...input, region: "ap-northeast-1" }, sha), /ACCOUNT_SYNC_TARGET_REJECTED/);
  assert.throws(() => validateSyncInput(input, "c".repeat(64)), /ACCOUNT_SYNC_BUNDLE_SHA_INVALID/);
});

test("AWS CLI adapter preserves binary-safe s3api argv and retries only transient invocation lookup", async () => {
  const calls = [];
  const aws = createAws({ executable: "/private/tmp/aws", profile: input.profile, region: input.region, execute: async (executable, args, options) => {
    calls.push({ executable, args, options });
    return { stdout: "{}" };
  } });
  await aws.json(["s3api", "put-object", "--body", input.bundlePath]);
  assert.deepEqual(calls[0].args, ["s3api", "put-object", "--body", input.bundlePath, "--profile", input.profile, "--region", input.region, "--output", "json", "--no-cli-pager"]);
  const delayed = createAws({ executable: "/private/tmp/aws", profile: input.profile, region: input.region, execute: async () => {
    const error = new Error("not yet"); error.stderr = "InvocationDoesNotExist"; throw error;
  } });
  assert.equal(await delayed.json(["ssm", "get-command-invocation"], { allowInvocationDelay: true }), null);
});

test("deployment evidence is an exact allowlist bound to the accepted target", () => {
  const accepted = { hostname: "staging.needo.life", instanceId: input.instanceId };
  const deployment = {
    gate: "aws-staging-application-deployment", status: "passed", timestamp: "2026-09-05T00:00:00.000Z", accountId: input.accountId, region: input.region, hostname: accepted.hostname,
    sourceRevision: input.sourceRevision, archiveSha256: sha, releaseObjectKey: `staging/releases/${input.sourceRevision}/${sha}.tar.gz`, objectVersionId: "v-release", snapshotId: "snap-0123456789abcdef0",
    instanceId: input.instanceId, commandId: "12345678-1234-1234-1234-123456789012", secretVersionCount: 1, applicationDeployed: true, migrationRun: true, seedRun: false, dnsModified: false, businessDataMutation: true
  };
  assert.equal(requireAcceptedDeployment(deployment, input, accepted).sourceRevision, input.sourceRevision);
  assert.throws(() => requireAcceptedDeployment({ ...deployment, unexpected: true }, input, accepted), /Application deployment evidence is not accepted/);
  assert.throws(() => requireAcceptedDeployment({ ...deployment, sourceRevision: "c".repeat(40) }, input, accepted), /Application deployment evidence is not accepted/);
});

test("CLI failure stderr is fixed and never echoes a rejected path", () => {
  const rejectedPath = "/private/tmp/not-for-output";
  const result = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "aws-staging-sync-test-accounts.mjs"), "--bundle", rejectedPath], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, `${JSON.stringify({ gate: "aws-staging-account-sync", status: "failed" })}\n`);
  assert.doesNotMatch(result.stderr, new RegExp(rejectedPath));
});

test("rejects changed live stack identity and release", () => {
  const rejected = [
    { ...validLive, instanceId: "i-1123456789abcdef0" },
    { ...validLive, volumeId: "vol-1123456789abcdef0" },
    { ...validLive, releaseBucket: "other-transfer" },
    { ...validLive, releaseRevision: "c".repeat(40) },
    { ...validLive, registrationCode: 0 },
    { ...validLive, callerKind: "user" }
  ];
  for (const live of rejected) assert.throws(() => validateLiveEnvironment(live, input), /ACCOUNT_SYNC_LIVE_ENVIRONMENT_REJECTED/);
  assert.throws(() => validateLiveEnvironment(validLive, { ...input, instanceId: "i-1123456789abcdef0" }), /ACCOUNT_SYNC_LIVE_ENVIRONMENT_REJECTED/);
});

test("builds a bounded, non-disclosing host command", () => {
  const command = buildHostCommand({ ...input, transferBucket: "transfer", transferKey: transferObjectKey(input.sourceRevision, sha), transferVersionId: "v1", backupBucket: "backup", backupKey: `staging/pre-account-sync/${input.sourceRevision}/1-${sha}.sql.gz` });
  for (const pattern of [/set -euo pipefail/, /umask 077/, /mysqldump --single-transaction/, /sha256sum --check/, /selective-account-import\.cli\.js/, /rm -f -- "\$bundle_path"/]) assert.match(command, pattern);
  assert.doesNotMatch(command, /FOREIGN_KEY_CHECKS|prisma db seed|bundle content/);
  assert.match(command, /application-deployment\.json/);
  assert.match(command, /--version-id/);
  assert.match(command, /node dist\/staging\/selective-account-import\.cli\.js/);
  assert.match(command, /MYSQL_PWD="\$MYSQL_PASSWORD" mysqldump .* -u"\$MYSQL_USER" "\$MYSQL_DATABASE"/);
  assert.match(command, /mysqldump --single-transaction --routines --triggers --no-tablespaces/);
  assert.match(command, /aws s3api get-object[^\n]+>\/dev\/null/);
  assert.match(command, /sha256sum --check[^\n]+>\/dev\/null/);
  assert.match(command, /backup_version_id=\$\(aws s3api put-object/);
  assert.match(command, /head-object[^\n]+--version-id "\$backup_version_id"/);
  assert.match(command, /backupVersionId/);
  assert.match(command, /wc -l/);
  assert.match(command, /trap cleanup/);
  assert.ok(command.indexOf("trap cleanup EXIT") < command.indexOf("flock -n 9"));
});

test("validates versioned transfer, completed snapshot, and exact object identity", () => {
  const objectKey = transferObjectKey(input.sourceRevision, sha);
  assert.equal(objectKey, `staging/account-sync/${input.sourceRevision}/${sha}.json.gz`);
  assert.throws(() => validateUpload({ VersionId: "v1", ContentLength: 5, Metadata: { sha256: sha, "source-revision": input.sourceRevision } }, { ...input, bundleBytes: 4, transferKey: objectKey }), /ACCOUNT_SYNC_TRANSFER_REJECTED/);
  assert.throws(() => validateSnapshot({ SnapshotId: "snap-0123456789abcdef0", VolumeId: "vol-0123456789abcdef0", State: "pending" }, "vol-0123456789abcdef0"), /ACCOUNT_SYNC_SNAPSHOT_STATE_REJECTED/);
});

test("accepts only the redacted importer summary and evidence fields", () => {
  const summary = parseImportSummary(JSON.stringify({ gate: "staging-selective-account-import", status: "passed", userCount: 262, nonTestUserCount: 0, administratorCount: 1, tableCounts, verificationDigests }));
  assert.equal(summary.userCount, 262);
  assert.throws(() => parseImportSummary(JSON.stringify({ ...summary, status: "failed" })), /ACCOUNT_SYNC_SSM_SUMMARY_REJECTED/);
  const evidence = createRedactedSyncEvidence({ timestamp: "2026-09-05T00:00:00.000Z", accountId: input.accountId, region: input.region, instanceId: "i-0123456789abcdef0", dataVolumeId: "vol-0123456789abcdef0", sourceRevision: input.sourceRevision, bundleSha256: sha, bundleBytes: 5, transferBucket: "needo-transfer", transferKey: transferObjectKey(input.sourceRevision, sha), transferVersionId: "v1", snapshotId: "snap-0123456789abcdef0", backupBucket: "needo-backup", backupKey: `staging/pre-account-sync/${input.sourceRevision}/1-${sha}.sql.gz`, backupVersionId: "v2", backupSha256: sha, commandId: "12345678-1234-1234-1234-123456789012", summary });
  assert.equal(evidence.status, "passed");
  assert.doesNotMatch(JSON.stringify(evidence), /bundle_path|stdout|password|token|secret/i);
  assert.equal(parseHostResult(hostResult(), backupKey).backupVersionId, "v-backup");
  assert.throws(() => parseHostResult(JSON.stringify({ importSummary, backupKey, backupVersionId: "v-backup", backupSha256: sha, latestVersionId: "other" }), backupKey), /ACCOUNT_SYNC_SSM_SUMMARY_REJECTED/);
});

test("rejects a failed SSM invocation and writes evidence atomically with mode 0600", async () => {
  await assert.rejects(() => waitForCommand({ json: async () => ({ Status: "Failed" }) }, "12345678-1234-1234-1234-123456789012", validLive.instanceId, 1), /ACCOUNT_SYNC_SSM_STATUS_REJECTED/);
  await assert.rejects(() => waitForCommand({ json: async () => ({ Status: "Success", ResponseCode: 1, StandardOutputContent: hostResult() }) }, "12345678-1234-1234-1234-123456789012", validLive.instanceId, backupKey, 1), /ACCOUNT_SYNC_SSM_STATUS_REJECTED/);
  const summary = { gate: "staging-selective-account-import", status: "passed", userCount: 262, nonTestUserCount: 0, administratorCount: 1, tableCounts, verificationDigests };
  const evidence = createRedactedSyncEvidence({ timestamp: "2026-09-05T00:00:00.000Z", accountId: input.accountId, region: input.region, instanceId: validLive.instanceId, dataVolumeId: validLive.volumeId, sourceRevision: input.sourceRevision, bundleSha256: sha, bundleBytes: 5, transferBucket: validLive.releaseBucket, transferKey: transferObjectKey(input.sourceRevision, sha), transferVersionId: "v1", snapshotId: "snap-0123456789abcdef0", backupBucket: validLive.backupBucket, backupKey: `staging/pre-account-sync/${input.sourceRevision}/1-${sha}.sql.gz`, backupVersionId: "v2", backupSha256: sha, commandId: "12345678-1234-1234-1234-123456789012", summary });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "needo-account-sync-"));
  const evidencePath = path.join(directory, "account-sync.json");
  await writeRedactedEvidenceAtomic(evidencePath, evidence);
  assert.equal((await fs.stat(evidencePath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await fs.readFile(evidencePath, "utf8")).status, "passed");
  await fs.rm(directory, { recursive: true, force: true });
});

test("retries transient SSM lookup and cleans the exact uploaded version after every later failure", async () => {
  const summary = hostResult();
  let attempts = 0;
  const waits = [];
  const parsed = await waitForCommand({ json: async () => {
    attempts += 1;
    return attempts === 1 ? null : { Status: "Success", ResponseCode: 0, StandardOutputContent: summary };
  } }, "12345678-1234-1234-1234-123456789012", validLive.instanceId, backupKey, 3, async (milliseconds) => { waits.push(milliseconds); });
  assert.equal(parsed.importSummary.userCount, 262);
  assert.deepEqual(waits, [10_000]);

  for (const stage of ["snapshot", "send", "command-id"]) {
    const calls = [];
    const aws = { json: async (args) => {
      calls.push(args);
      if (args[0] === "s3api" && args[1] === "put-object") return { VersionId: "v-transfer" };
      if (args[0] === "s3api" && args[1] === "head-object") return { VersionId: "v-transfer", ContentLength: 5, Metadata: { sha256: sha, "source-revision": input.sourceRevision } };
      if (args[0] === "ec2" && args[1] === "create-snapshot") {
        if (stage === "snapshot") throw new Error("snapshot failure");
        return { SnapshotId: "snap-0123456789abcdef0", VolumeId: validLive.volumeId };
      }
      if (args[0] === "ec2" && args[1] === "describe-snapshots") return { Snapshots: [{ SnapshotId: "snap-0123456789abcdef0", VolumeId: validLive.volumeId, State: "completed" }] };
      if (args[0] === "ssm" && args[1] === "send-command") {
        if (stage === "send") throw new Error("send failure");
        return { Command: { CommandId: "not-a-command-id" } };
      }
      if (args[0] === "s3api" && args[1] === "delete-object") return {};
      throw new Error(`unexpected ${args.join(" ")}`);
    } };
    await assert.rejects(() => orchestrateStagingAccountSync({ aws, input: { ...input, bundleBytes: 5 }, localSha256: sha, live: validLive, timestamp: "2026-09-05T00:00:00.000Z" }), stage === "command-id" ? /ACCOUNT_SYNC_SSM_STATUS_REJECTED/ : new RegExp(`${stage} failure`));
    const deleteCall = calls.find((args) => args[0] === "s3api" && args[1] === "delete-object");
    assert.deepEqual(deleteCall, ["s3api", "delete-object", "--bucket", validLive.releaseBucket, "--key", transferObjectKey(input.sourceRevision, sha), "--version-id", "v-transfer"]);
  }
});

test("orchestrates with the host backup VersionId even when a newer concurrent version exists", async () => {
  const live = validLive;
  const calls = [];
  let expectedBackupKey;
  const newerConcurrentVersionId = "v-backup-newer";
  const aws = { json: async (args) => {
    calls.push(args);
    if (args[0] === "s3api" && args[1] === "put-object") return { VersionId: "v-transfer" };
    if (args[0] === "s3api" && args[1] === "head-object" && args.includes("needo-transfer")) return { VersionId: "v-transfer", ContentLength: 5, Metadata: { sha256: sha, "source-revision": input.sourceRevision } };
    if (args[0] === "ec2" && args[1] === "create-snapshot") return { SnapshotId: "snap-0123456789abcdef0", VolumeId: live.volumeId };
    if (args[0] === "ec2" && args[1] === "describe-snapshots") return { Snapshots: [{ SnapshotId: "snap-0123456789abcdef0", VolumeId: live.volumeId, State: "completed" }] };
    if (args[0] === "ssm" && args[1] === "send-command") {
      expectedBackupKey = String(args.at(-1)).match(/staging\/pre-account-sync\/[a-f0-9]{40}\/[0-9]+-[a-f0-9]{64}\.sql\.gz/)?.[0];
      return { Command: { CommandId: "12345678-1234-1234-1234-123456789012" } };
    }
    if (args[0] === "ssm" && args[1] === "get-command-invocation") return { Status: "Success", ResponseCode: 0, StandardOutputContent: hostResult("v-backup-exact", expectedBackupKey) };
    if (args[0] === "s3api" && args[1] === "head-object") {
      assert.ok(args.includes("--version-id"));
      assert.ok(args.includes("v-backup-exact"));
      assert.ok(!args.includes(newerConcurrentVersionId));
      return { VersionId: "v-backup-exact", ContentLength: 6, Metadata: { sha256: sha } };
    }
    if (args[0] === "s3api" && args[1] === "delete-object") return {};
    throw new Error(`unexpected ${args.join(" ")}`);
  } };
  let written;
  const evidence = await orchestrateStagingAccountSync({ aws, input: { ...input, bundleBytes: 5 }, localSha256: sha, live, timestamp: "2026-09-05T00:00:00.000Z", writeEvidence: async (value) => { written = value; } });
  assert.equal(evidence.status, "passed");
  assert.equal(written.commandId, evidence.commandId);
  assert.equal(evidence.logicalBackup.versionId, "v-backup-exact");
  assert.ok(calls.some((args) => args[0] === "s3api" && args[1] === "put-object" && args.includes(input.bundlePath)));
  assert.ok(calls.some((args) => args[0] === "ec2" && args[1] === "create-snapshot"));
  assert.ok(calls.some((args) => args[0] === "ssm" && args[1] === "send-command"));
});
