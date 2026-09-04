import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assertCleanRevision,
  buildApplicationDeploymentCommand,
  createRedactedApplicationEvidence,
  releaseKey,
  requireAcceptedEnvironment
} from "./aws-staging-application-lib.mjs";

const revision = "8a9d95627a8ef37ee68ee6bba1dc832297c90057";
const sha256 = "a".repeat(64);

test("clean source must resolve to the exact approved full revision", async () => {
  const repository = {
    resolveRevision: async () => revision,
    statusPorcelain: async () => ""
  };

  assert.deepEqual(await assertCleanRevision(repository, revision), { revision });
  await assert.rejects(
    assertCleanRevision({ ...repository, statusPorcelain: async () => " M src/App.tsx\n" }, revision),
    /clean/
  );
  await assert.rejects(
    assertCleanRevision({ ...repository, resolveRevision: async () => "b".repeat(40) }, revision),
    /revision/
  );
});

test("release keys are immutable and content addressed", () => {
  assert.equal(
    releaseKey(revision, sha256),
    `staging/releases/${revision}/${sha256}.tar.gz`
  );
  assert.throws(() => releaseKey("HEAD", sha256), /revision/);
  assert.throws(() => releaseKey(revision, "ABC"), /SHA-256/);
});

test("accepted environment is bound to exact staging resources", () => {
  const environment = requireAcceptedEnvironment({
    accountId: "430611185505",
    applicationDeployed: false,
    businessDataMutation: false,
    dnsModified: false,
    elasticIp: "32.236.134.43",
    hostname: "staging.needo.life",
    migrationRun: false,
    region: "ap-southeast-2",
    resourceIds: {
      applicationSecretArn: "REDACTED",
      backupBucketName: "needo-staging-backup-example",
      dataVolumeId: "vol-0123456789abcdef0",
      instanceId: "i-0123456789abcdef0",
      releaseBucketName: "needo-staging-release-example",
      rootVolumeId: "vol-0fedcba9876543210"
    },
    secretVersionCount: 0,
    seedRun: false,
    ssm: { online: true },
    stack: { name: "needo-staging-infrastructure", status: "UPDATE_COMPLETE" }
  });

  assert.equal(environment.instanceId, "i-0123456789abcdef0");
  assert.equal(environment.releaseBucketName, "needo-staging-release-example");
  assert.equal(environment.dataVolumeId, "vol-0123456789abcdef0");
});

test("bounded SSM command verifies content before invoking the repository deploy payload", () => {
  const command = buildApplicationDeploymentCommand({
    accountId: "430611185505",
    archiveSha256: sha256,
    backupBucketName: "needo-staging-backup-example",
    hostname: "staging.needo.life",
    region: "ap-southeast-2",
    releaseBucketName: "needo-staging-release-example",
    releaseObjectKey: releaseKey(revision, sha256),
    revision,
    secretId: "arn:aws:secretsmanager:ap-southeast-2:430611185505:secret:needo-staging-example"
  });

  assert.match(command, /sha256sum --check/);
  assert.match(command, /deploy\/staging\/deploy-release\.sh/);
  assert.match(command, /set -euo pipefail/);
  assert.doesNotMatch(command, /ADMIN_DEFAULT_PASSWORD|SecretString/);
  assert.ok(command.length < 7_500);
});

test("application evidence is allowlisted and never serializes secrets", () => {
  const evidence = createRedactedApplicationEvidence({
    archiveSha256: sha256,
    commandId: "12345678-1234-1234-1234-123456789012",
    instanceId: "i-0123456789abcdef0",
    objectVersionId: "example-version",
    releaseObjectKey: releaseKey(revision, sha256),
    revision,
    secretVersionCount: 1,
    snapshotId: "snap-0123456789abcdef0",
    status: "passed",
    timestamp: "2026-09-04T00:00:00.000Z",
    ignored: { ADMIN_DEFAULT_PASSWORD: "must-not-appear" }
  });
  const serialized = JSON.stringify(evidence);

  assert.equal(serialized.includes("ADMIN_DEFAULT_PASSWORD"), false);
  assert.equal(serialized.includes("must-not-appear"), false);
  assert.equal(evidence.applicationDeployed, true);
  assert.equal(evidence.migrationRun, true);
  assert.equal(evidence.seedRun, false);
});

test("repository deployment payload is locked, secret-safe, and switches current only after health", () => {
  const payload = readFileSync(
    new URL("../deploy/staging/deploy-release.sh", import.meta.url),
    "utf8"
  );

  assert.match(payload, /flock -n 9/);
  assert.match(payload, /secretsmanager get-secret-value/);
  assert.match(payload, /env_file="\/srv\/needo\/config\/staging\.env"[\s\S]*chmod 0600 "\$env_file"/);
  assert.match(payload, /docker compose[\s\S]*run --rm migrate/);
  assert.match(payload, /docker compose[\s\S]*run --rm bootstrap-admin/);
  assert.match(payload, /curl --fail --silent --show-error[\s\S]*\/api\/v1\/ready/);
  assert.ok(payload.indexOf("/api/v1/ready") < payload.lastIndexOf("/srv/needo/current"));
  assert.doesNotMatch(payload, /set -x|echo .*PASSWORD|printenv/);
});
