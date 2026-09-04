import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildHostCommand,
  createRedactedSyncEvidence,
  orchestrateStagingAccountSync,
  parseImportSummary,
  transferObjectKey,
  validateSnapshot,
  validateSyncInput,
  validateLiveEnvironment,
  validateUpload,
  waitForCommand,
  writeRedactedEvidenceAtomic
} from "./aws-staging-account-sync-lib.mjs";

const sha = "a".repeat(64);
const input = { profile: "needo-staging-bootstrap", accountId: "430611185505", region: "ap-southeast-2", bundlePath: "/private/tmp/bundle.json.gz", bundleSha256: sha, sourceRevision: "b".repeat(40), instanceId: "i-0123456789abcdef0", volumeId: "vol-0123456789abcdef0", releaseBucket: "needo-transfer", backupBucket: "needo-backup" };
const tableCounts = Object.fromEntries(["users", "shops", "merchant_accounts", "customer_profiles", "technician_profiles", "user_identities", "merchant_identity_profiles", "user_roles", "merchant_shop_memberships", "technician_shop_affiliations", "public_identifiers"].map((table) => [table, table === "users" ? 261 : 0]));
const verificationDigests = Object.fromEntries(Object.keys(tableCounts).map((table) => [table, sha]));
const validLive = Object.freeze({ accountId: input.accountId, region: input.region, callerKind: "assumed-role", stackName: "needo-staging-infrastructure", stackStatus: "CREATE_COMPLETE", instanceId: "i-0123456789abcdef0", volumeId: "vol-0123456789abcdef0", releaseBucket: "needo-transfer", backupBucket: "needo-backup", releaseRevision: input.sourceRevision, ssmOnline: true, registrationCode: 40313, applicationDeployment: { sourceRevision: input.sourceRevision, status: "passed" } });

test("rejects every target or digest mismatch", () => {
  assert.throws(() => validateSyncInput({ ...input, region: "ap-northeast-1" }, sha), /ACCOUNT_SYNC_TARGET_REJECTED/);
  assert.throws(() => validateSyncInput(input, "c".repeat(64)), /ACCOUNT_SYNC_BUNDLE_SHA_INVALID/);
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
  for (const pattern of [/set -euo pipefail/, /umask 077/, /mysqldump --single-transaction/, /sha256sum --check/, /import:staging-test-accounts/, /rm -f -- "\$bundle_path"/]) assert.match(command, pattern);
  assert.doesNotMatch(command, /FOREIGN_KEY_CHECKS|prisma db seed|bundle content/);
  assert.match(command, /application-deployment\.json/);
  assert.match(command, /--version-id/);
  assert.match(command, /backend npm run import:staging-test-accounts/);
  assert.match(command, /trap cleanup/);
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
});

test("rejects a failed SSM invocation and writes evidence atomically with mode 0600", async () => {
  await assert.rejects(() => waitForCommand({ json: async () => ({ Status: "Failed" }) }, "12345678-1234-1234-1234-123456789012", validLive.instanceId, 1), /ACCOUNT_SYNC_SSM_STATUS_REJECTED/);
  const failedSummary = JSON.stringify({ gate: "staging-selective-account-import", status: "passed", userCount: 262, nonTestUserCount: 0, administratorCount: 1, tableCounts, verificationDigests });
  await assert.rejects(() => waitForCommand({ json: async () => ({ Status: "Success", ResponseCode: 1, StandardOutputContent: failedSummary }) }, "12345678-1234-1234-1234-123456789012", validLive.instanceId, 1), /ACCOUNT_SYNC_SSM_STATUS_REJECTED/);
  const summary = { gate: "staging-selective-account-import", status: "passed", userCount: 262, nonTestUserCount: 0, administratorCount: 1, tableCounts, verificationDigests };
  const evidence = createRedactedSyncEvidence({ timestamp: "2026-09-05T00:00:00.000Z", accountId: input.accountId, region: input.region, instanceId: validLive.instanceId, dataVolumeId: validLive.volumeId, sourceRevision: input.sourceRevision, bundleSha256: sha, bundleBytes: 5, transferBucket: validLive.releaseBucket, transferKey: transferObjectKey(input.sourceRevision, sha), transferVersionId: "v1", snapshotId: "snap-0123456789abcdef0", backupBucket: validLive.backupBucket, backupKey: `staging/pre-account-sync/${input.sourceRevision}/1-${sha}.sql.gz`, backupVersionId: "v2", backupSha256: sha, commandId: "12345678-1234-1234-1234-123456789012", summary });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "needo-account-sync-"));
  const evidencePath = path.join(directory, "account-sync.json");
  await writeRedactedEvidenceAtomic(evidencePath, evidence);
  assert.equal((await fs.stat(evidencePath)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await fs.readFile(evidencePath, "utf8")).status, "passed");
  await fs.rm(directory, { recursive: true, force: true });
});

test("orchestrates only versioned upload, completed snapshot, successful SSM, and redacted evidence", async () => {
  const summary = { gate: "staging-selective-account-import", status: "passed", userCount: 262, nonTestUserCount: 0, administratorCount: 1, tableCounts, verificationDigests };
  const live = validLive;
  const calls = [];
  const aws = { json: async (args) => {
    calls.push(args);
    if (args[0] === "s3" && args[1] === "put-object") return { VersionId: "v-transfer" };
    if (args[0] === "s3" && args[1] === "head-object" && args.includes("needo-transfer")) return { VersionId: "v-transfer", ContentLength: 5, Metadata: { sha256: sha, "source-revision": input.sourceRevision } };
    if (args[0] === "ec2" && args[1] === "create-snapshot") return { SnapshotId: "snap-0123456789abcdef0", VolumeId: live.volumeId };
    if (args[0] === "ec2" && args[1] === "describe-snapshots") return { Snapshots: [{ SnapshotId: "snap-0123456789abcdef0", VolumeId: live.volumeId, State: "completed" }] };
    if (args[0] === "ssm" && args[1] === "send-command") return { Command: { CommandId: "12345678-1234-1234-1234-123456789012" } };
    if (args[0] === "ssm" && args[1] === "get-command-invocation") return { Status: "Success", ResponseCode: 0, StandardOutputContent: JSON.stringify(summary) };
    if (args[0] === "s3" && args[1] === "head-object") return { VersionId: "v-backup", ContentLength: 6, Metadata: { sha256: sha } };
    throw new Error(`unexpected ${args.join(" ")}`);
  } };
  let written;
  const evidence = await orchestrateStagingAccountSync({ aws, input: { ...input, bundleBytes: 5 }, localSha256: sha, live, timestamp: "2026-09-05T00:00:00.000Z", writeEvidence: async (value) => { written = value; } });
  assert.equal(evidence.status, "passed");
  assert.equal(written.commandId, evidence.commandId);
  assert.ok(calls.some((args) => args[0] === "ec2" && args[1] === "create-snapshot"));
  assert.ok(calls.some((args) => args[0] === "ssm" && args[1] === "send-command"));
});
