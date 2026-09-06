import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { env } from "../src/config/env";
import { prisma } from "../src/prisma/client";
import { CarouselPublicationRepository } from "../src/repositories/carousel-publication.repository";

async function main() {
  const url = new URL(env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.ok(["/needo_dev", "/needo_test"].includes(url.pathname));
  assert.ok(["local", "test"].includes(env.DEPLOY_ENV));
  assert.notEqual(env.NODE_ENV, "production");
  const rollback = new Error("rollback_local_carousel_verification");
  try {
    await prisma.$transaction(
      async (tx) => {
        const client = new Proxy(tx, {
          get(target, key) {
            if (key === "$transaction")
              return (operation: (inner: typeof tx) => Promise<unknown>) => operation(tx);
            return Reflect.get(target, key);
          }
        });
        const repository = new CarouselPublicationRepository(client as never);
        const current = await repository.getScene("USER_HOME");
        assert.ok(current.published, "requires an existing local published carousel");
        assert.equal(current.draft, null, "refuses to interfere with an existing operator draft");
        const row = await tx.carouselRelease.findUniqueOrThrow({
          where: { id: current.published.releaseId }
        });
        const actorId = row.publishedById ?? row.createdById;
        assert.ok(actorId);
        const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
        const now = new Date();
        const base = {
          scene: "USER_HOME" as const,
          actorUserId: actorId,
          actor: {
            userId: actorId,
            email: actor.email!,
            roles: ["operator"],
            permissions: [],
            accessTokenJti: "local-transaction-test",
            accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 60
          },
          context: { ip: "127.0.0.1", userAgent: "local-carousel-transaction-verification" },
          validateAffiliateTask: async () => undefined,
          now
        };
        const draft = await repository.cloneForRollback({
          ...base,
          idempotencyKey: randomUUID(),
          requestFingerprint: randomUUID(),
          sourceReleaseId: current.published.releaseId,
          expectedCurrentVersion: current.latestVersion,
          reason: "本地事务回滚验证：编辑当前内容"
        });
        assert.deepEqual(
          draft.slides.map((s) => s.translations),
          current.published.slides.map((s) => s.translations)
        );
        await repository.publish({
          ...base,
          idempotencyKey: randomUUID(),
          requestFingerprint: randomUUID(),
          releaseId: draft.releaseId,
          expectedLockVersion: draft.lockVersion
        });
        const replaced = await tx.carouselRelease.findUniqueOrThrow({ where: { id: row.id } });
        assert.ok(replaced.deletedAt);
        const history = await repository.listHistory({
          scene: "USER_HOME",
          page: 1,
          pageSize: 100
        });
        assert.ok(history.list.every((item) => item.releaseId !== row.id));
        assert.equal(await repository.findRelease("USER_HOME", row.id), null);
        assert.equal(
          (await repository.getScene("USER_HOME")).published?.releaseId,
          draft.releaseId
        );
        assert.equal(
          await tx.auditLog.count({
            where: { action: "content.carousel.publish", targetId: draft.releaseId }
          }),
          1
        );
        throw rollback;
      },
      { isolationLevel: "Serializable", timeout: 30000 }
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
  process.stdout.write(
    "carousel database checks passed: current content editing, locale preservation, old version retirement, history exclusion, publication audit; all changes rolled back\n"
  );
}
void main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
