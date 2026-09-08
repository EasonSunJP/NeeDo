import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "../src/config/env";
import { prisma } from "../src/prisma/client";
import { ReleasePublicationRepository } from "../src/repositories/release-publication.repository";
import type { ReleasePublicationInput } from "../src/domain/release-publication";

async function main() {
  const url = new URL(env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.ok(["/needo_dev", "/needo_test"].includes(url.pathname));
  assert.ok(["local", "test"].includes(env.DEPLOY_ENV));
  assert.notEqual(env.NODE_ENV, "production");
  const repository = new ReleasePublicationRepository();
  const deploymentIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const actor = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true } });
  assert.ok(actor, "a local user is required for actor-linked audit verification");
  const publication: ReleasePublicationInput = {
    deploymentId: deploymentIds[0],
    environment: "test",
    sourceRevision: "a".repeat(40),
    previousRevision: null,
    version: "local-integration-test",
    kind: "baseline",
    publishedAt: new Date(Date.now() - 60000).toISOString(),
    changes: ["Disposable release persistence verification"]
  };
  try {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => repository.publish(publication))
    );
    assert.equal(new Set(results.map((result) => result.id)).size, 1);
    assert.equal(results.filter((result) => !result.replayed).length, 1);
    assert.equal(
      await prisma.auditLog.count({
        where: { action: "release.published", targetId: results[0].id }
      }),
      1
    );
    await assert.rejects(repository.publish({ ...publication, changes: ["conflicting content"] }));
    const second = await repository.publish({
      ...publication,
      deploymentId: deploymentIds[1],
      publishedAt: new Date().toISOString(),
      kind: "release"
    });
    const listed = await repository.list("test", { page: 1, pageSize: 100 });
    assert.deepEqual(
      listed.list.filter((row) => deploymentIds.includes(row.deploymentId)).map((row) => row.id),
      [second.id, results[0].id]
    );
    const local = await repository.list("local", { page: 1, pageSize: 100 });
    assert.ok(local.list.every((row) => !deploymentIds.includes(row.deploymentId)));
    const firstPage = await repository.list("test", { page: 1, pageSize: 1 });
    const secondPage = await repository.list("test", { page: 2, pageSize: 1 });
    assert.notEqual(firstPage.list[0]?.id, secondPage.list[0]?.id);
    await assert.rejects(
      repository.edit("test", actor.id, results[0].id, {
        version: "forbidden",
        changes: ["deployment evidence must stay immutable"],
        reason: "negative test",
        expectedVersion: 1
      })
    );
    const manualAt = new Date(Date.now() - 120000).toISOString();
    const manual = await repository.createManual("test", actor.id, {
      deploymentId: deploymentIds[3],
      version: "manual-local-check",
      sourceRevision: null,
      publishedAt: manualAt,
      changes: ["Disposable manual release persistence verification"],
      reason: "local integration verification"
    });
    const corrected = await repository.edit("test", actor.id, manual.id, {
      version: "manual-local-check-v2",
      changes: ["Disposable corrected release persistence verification"],
      reason: "verify optimistic correction history",
      expectedVersion: 1
    });
    assert.equal(corrected.lockVersion, 2);
    assert.equal(corrected.publishedAt, manualAt);
    assert.equal(
      await prisma.releasePublicationRevision.count({ where: { releasePublicationId: manual.id } }),
      2
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { targetType: "ReleasePublication", targetId: manual.id }
      }),
      2
    );
    const tokyoDay = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(manualAt));
    const inPeriod = await repository.list("test", {
      page: 1,
      pageSize: 100,
      from: tokyoDay,
      to: tokyoDay
    });
    assert.ok(inPeriod.list.some((row) => row.id === manual.id));
    // Exercise the packaged writer with this checkout's real Git manifest.
    const execute = promisify(execFile);
    const root = path.resolve(__dirname, "../..");
    const { stdout: manifestText } = await execute(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'import { execFileSync } from "node:child_process"; import { collectReleaseManifest } from "./scripts/release-notes.mjs"; const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); process.stdout.write(JSON.stringify(await collectReleaseManifest(process.cwd(), revision)));'
      ],
      { cwd: root, maxBuffer: 32 * 1024 * 1024 }
    );
    const current = JSON.parse(manifestText) as { sourceRevision: string };
    const receipt = {
      deploymentId: deploymentIds[2],
      environment: "test",
      sourceRevision: current.sourceRevision,
      previousRevision: null,
      publishedAt: new Date().toISOString(),
      current,
      previous: null
    };
    const invokeWriter = async (value: unknown) => {
      const pending = execute(
        process.execPath,
        [path.join(root, "backend/dist/cli/record-release.js")],
        {
          cwd: path.join(root, "backend"),
          env: { ...process.env, DEPLOY_ENV: "test" },
          maxBuffer: 1024 * 1024
        }
      );
      pending.child.stdin?.end(JSON.stringify(value));
      const result = await pending;
      return JSON.parse(result.stdout.trim()) as { publicationId: number; replayed: boolean };
    };
    const written = await invokeWriter(receipt);
    assert.equal(written.replayed, false);
    const replayed = await invokeWriter(receipt);
    assert.deepEqual(replayed, { publicationId: written.publicationId, replayed: true });
    await assert.rejects(invokeWriter({ ...receipt, environment: "staging" }));
    const persisted = await prisma.releasePublication.findUniqueOrThrow({
      where: { deploymentId: deploymentIds[2] }
    });
    assert.equal(persisted.publishedAt.toISOString(), receipt.publishedAt);
    assert.equal(persisted.sourceRevision, current.sourceRevision);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          action: "release.published",
          targetType: "ReleasePublication",
          targetId: written.publicationId
        }
      }),
      1
    );
    process.stdout.write(
      "release database checks passed: concurrent idempotency, immutable deployment evidence, manual creation and optimistic correction history, Tokyo period search, audit trail, ordering, pagination, environment isolation, real Git manifest to compiled CLI, original receipt replay\n"
    );
  } finally {
    const rows = await prisma.releasePublication.findMany({
      where: { deploymentId: { in: deploymentIds } },
      select: { id: true }
    });
    await prisma.$transaction(async (tx) => {
      await tx.releasePublicationRevision.deleteMany({
        where: { releasePublicationId: { in: rows.map((row) => row.id) } }
      });
      await tx.auditLog.deleteMany({
        where: {
          targetType: "ReleasePublication",
          targetId: { in: rows.map((row) => row.id) }
        }
      });
      await tx.releasePublication.deleteMany({ where: { deploymentId: { in: deploymentIds } } });
    });
    assert.equal(
      await prisma.releasePublication.count({ where: { deploymentId: { in: deploymentIds } } }),
      0
    );
  }
}
void main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`release database verification failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
