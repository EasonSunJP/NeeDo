import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectReleaseManifest } from "./release-notes.mjs";
test("packages real commit subjects and ancestry without using commit time as publication time", async () => {
  const directory = mkdtempSync(join(tmpdir(), "needo-release-history-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.name", "Release test"); git("config", "user.email", "release-test@example.invalid");
    writeFileSync(join(directory, "notes"), "first"); git("add", "notes"); git("commit", "-qm", "初始版本");
    const previous = git("rev-parse", "HEAD");
    writeFileSync(join(directory, "notes"), "second"); git("commit", "-qam", "修复筛选 `literal` $(literal)");
    const revision = git("rev-parse", "HEAD");
    const manifest = await collectReleaseManifest(directory, revision);
    assert.equal(manifest.sourceRevision, revision);
    assert.equal(manifest.commits[0].summary, "修复筛选 `literal` $(literal)");
    assert.deepEqual(manifest.commits[0].parents, [previous]);
    assert.equal(manifest.publishedAt, undefined);
    await assert.rejects(collectReleaseManifest(directory, "HEAD; echo invalid"));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
