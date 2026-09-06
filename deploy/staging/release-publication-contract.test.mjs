import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
test("packages immutable Git notes and fails before publishing when the writer is absent", () => {
  const source = read("../../scripts/aws-staging-package-application.mjs");
  assert.ok(source.includes('collectReleaseManifest(repositoryRoot, revision)'));
  assert.ok(source.includes('backend/dist/cli/record-release.js'));
  assert.ok(source.indexOf('release-notes.json') < source.indexOf('await normalizeTree(stageRoot'));
});
test("records actual publication only after all ready gates and the active release switch", () => {
  const source = read("./deploy-release.sh");
  const write = source.indexOf('exec -T backend node dist/cli/record-release.js');
  for (const gate of ['ops-api/v1/ready', 'merchant-api/v1/ready', 'mv -Tf /srv/needo/current.next', 'deployment_complete=true']) assert.ok(source.indexOf(gate) < write);
  assert.ok(source.includes('datetime.datetime.now(datetime.timezone.utc)'));
  assert.ok(source.includes('publication_receipt'));
  assert.ok(source.includes('previous_revision'));
  assert.ok(source.indexOf('[[ -f "$release_dir/backend/dist/cli/record-release.js" ]]') < source.indexOf('aws secretsmanager'));
});
