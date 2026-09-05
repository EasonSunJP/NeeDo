import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import type { PrismaClient } from "@prisma/client";
import type { RealtimeEvent } from "../src/services/realtime-event.gateway";

async function main(): Promise<void> {
  const envFile = process.env.ENV_FILE;
  if (!envFile) throw new Error("ENV_FILE is required for local notice acceptance");
  const loaded = loadDotenv({ path: envFile, override: true });
  if (loaded.error) throw loaded.error;
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
    !["local", "test"].includes(process.env.DEPLOY_ENV ?? "") ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/(?:dev|test|local)/i.test(url.pathname) ||
    /prod|staging/i.test(url.pathname)
  )
    throw new Error("Notice checker requires an explicitly local non-production database");

  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const { OfficialNoticeRepository } =
    await import("../src/repositories/official-notice.repository");
  const { OfficialNoticeService } = await import("../src/services/official-notice.service");
  const { RealtimeRepository } = await import("../src/repositories/realtime.repository");
  const { officialNoticeCreateBodySchema } =
    await import("../src/validators/official-notice.validator");
  const marker = `notice-check-${randomUUID()}`;
  const rollback = new Error("notice acceptance rollback");
  let report: Record<string, unknown> | undefined;
  try {
    await prisma.$transaction(
      async (tx) => {
        const accounts = await tx.user.findMany({
          where: {
            isTestAccount: true,
            isActive: true,
            deletedAt: null,
            identities: { some: { isActive: true, deletedAt: null } }
          },
          orderBy: { id: "asc" },
          take: 2,
          select: {
            id: true,
            identities: {
              where: { isActive: true, deletedAt: null },
              take: 1,
              select: { id: true }
            }
          }
        });
        assert.equal(accounts.length, 2, "two existing formal test accounts are required");
        const sender = accounts[0];
        const outsider = accounts[1];
        // Every fixture and every nested repository operation stays inside this rollback boundary.
        const transactionClient = new Proxy(tx, {
          get(target, property) {
            if (property === "$transaction")
              return (operation: (client: typeof tx) => Promise<unknown>) => operation(tx);
            return Reflect.get(target, property);
          }
        }) as unknown as PrismaClient;
        const events: RealtimeEvent[] = [];
        const repository = new OfficialNoticeRepository(transactionClient, 3, {
          publish: (event) => {
            events.push(event);
          }
        });
        const now = new Date();
        const service = new OfficialNoticeService(repository, { now: () => now });
        const actor = {
          userId: sender.id,
          currentIdentityId: sender.identities[0].id
        } as Parameters<typeof service.createAndPlan>[0];
        const context = { ip: "127.0.0.1", userAgent: marker };
        await tx.userIdentity.createMany({
          data: Array.from({ length: 502 }, (_, index) => ({
            userId: sender.id,
            type: "customer",
            scopeType: "global",
            displayName: `${marker}-${index}`,
            isActive: true,
            isDefault: false,
            createdAt: now,
            updatedAt: now
          }))
        });
        const recipient = await tx.userIdentity.findFirstOrThrow({
          where: { displayName: `${marker}-0`, userId: sender.id },
          select: { id: true }
        });
        const expected = await tx.userIdentity.count({
          where: { userId: sender.id, isActive: true, deletedAt: null }
        });
        const body = officialNoticeCreateBodySchema.parse({
          sourceLocale: "ja",
          level: "important",
          title: marker,
          summary: "Local rollback acceptance",
          blocks: [{ id: "text-1", type: "paragraph", content: "Persisted notice acceptance" }],
          audience: { type: "exact_users", userIds: [sender.id] },
          sendMode: "now",
          scheduledAt: null,
          idempotencyKey: marker
        });
        let notice = await service.createAndPlan(actor, context, body);
        assert.equal(notice.audienceCount, expected);
        assert.equal(notice.delivery.delivered, 250, "first dispatch must be bounded");
        assert.equal(notice.status, "sending");
        const replay = await service.createAndPlan(actor, context, body);
        assert.equal(replay.publicId, notice.publicId);
        for (let pass = 0; pass < 5 && notice.status !== "sent"; pass++)
          notice = await repository.dispatchNotice(notice.publicId, now);
        assert.equal(notice.status, "sent");
        assert.equal(notice.delivery.delivered, expected);
        const persisted = await tx.officialNotice.findUniqueOrThrow({
          where: { publicId: notice.publicId }
        });
        assert.equal(
          await tx.noticeAudience.count({ where: { noticeId: persisted.id } }),
          expected
        );
        assert.equal(
          await tx.noticeDelivery.count({
            where: { noticeId: persisted.id, notificationId: { not: null } }
          }),
          expected
        );
        await repository.dispatchNotice(notice.publicId, now);
        assert.equal(
          events.length,
          expected,
          "duplicate dispatch must not publish duplicate receipts"
        );
        assert.equal(new Set(events.map((event) => event.id)).size, expected);
        const mine = await repository.listMine({
          recipientIdentityId: recipient.id,
          locale: "ja",
          unreadOnly: true,
          page: 1,
          pageSize: 20
        });
        assert.equal(mine.total, 1);
        assert.equal(mine.list[0].publicId, notice.publicId);
        const foreign = await repository.listMine({
          recipientIdentityId: outsider.identities[0].id,
          locale: "ja",
          unreadOnly: true,
          page: 1,
          pageSize: 20
        });
        assert.ok(!foreign.list.some((item) => item.publicId === notice.publicId));
        await assert.rejects(
          repository.markRead({
            publicId: notice.publicId,
            recipientIdentityId: outsider.identities[0].id,
            actorUserId: outsider.id,
            context,
            now
          }),
          /not_found/
        );
        const read = await repository.markRead({
          publicId: notice.publicId,
          recipientIdentityId: recipient.id,
          actorUserId: sender.id,
          context,
          now
        });
        const repeatedRead = await repository.markRead({
          publicId: notice.publicId,
          recipientIdentityId: recipient.id,
          actorUserId: sender.id,
          context,
          now: new Date(now.getTime() + 1000)
        });
        assert.deepEqual(repeatedRead, read);
        const receipt = await tx.noticeDelivery.findFirstOrThrow({
          where: { noticeId: persisted.id, recipientIdentityId: recipient.id },
          include: { notification: true }
        });
        assert.deepEqual(receipt.readAt, receipt.notification?.readAt);
        assert.equal(
          await tx.auditLog.count({
            where: {
              targetType: "OfficialNotice",
              targetId: persisted.id,
              action: "official_notice.read"
            }
          }),
          1
        );

        const inboxRepository = new RealtimeRepository(transactionClient);
        for (const [index, mode] of [
          [1, "single"],
          [2, "all"]
        ] as const) {
          const inboxIdentity = await tx.userIdentity.findFirstOrThrow({
            where: { displayName: `${marker}-${index}`, userId: sender.id }
          });
          const inboxDelivery = await tx.noticeDelivery.findFirstOrThrow({
            where: { noticeId: persisted.id, recipientIdentityId: inboxIdentity.id }
          });
          assert.ok(inboxDelivery.notificationId);
          if (mode === "single")
            await inboxRepository.markNotificationRead(
              inboxIdentity.id,
              inboxDelivery.notificationId
            );
          else await inboxRepository.markAllNotificationsRead(inboxIdentity.id);
          const receiptAfter = await tx.noticeDelivery.findUniqueOrThrow({
            where: { id: inboxDelivery.id },
            include: { notification: true }
          });
          assert.ok(receiptAfter.readAt, `${mode} inbox read must update official receipt`);
          assert.deepEqual(receiptAfter.readAt, receiptAfter.notification?.readAt);
          assert.equal(
            (
              await repository.listMine({
                recipientIdentityId: inboxIdentity.id,
                locale: "ja",
                unreadOnly: true,
                page: 1,
                pageSize: 20
              })
            ).total,
            0
          );
          await inboxRepository.markNotificationRead(
            inboxIdentity.id,
            inboxDelivery.notificationId
          );
          assert.equal((await inboxRepository.markAllNotificationsRead(inboxIdentity.id)).count, 0);
          assert.deepEqual(
            (await tx.noticeDelivery.findUniqueOrThrow({ where: { id: inboxDelivery.id } })).readAt,
            receiptAfter.readAt
          );
        }

        const scheduled = await service.createAndPlan(actor, context, {
          ...body,
          idempotencyKey: `${marker}-scheduled`,
          sendMode: "scheduled",
          scheduledAt: new Date(now.getTime() + 60_000).toISOString()
        });
        const cancelBody = {
          expectedLockVersion: scheduled.lockVersion,
          reason: "rollback acceptance cancellation",
          idempotencyKey: `${marker}-cancel`
        };
        const cancelled = await service.cancel(actor, context, scheduled.publicId, cancelBody);
        assert.equal(cancelled.status, "cancelled");
        const laterService = new OfficialNoticeService(repository, {
          now: () => new Date(now.getTime() + 120_000)
        });
        const scheduledBody = {
          ...body,
          idempotencyKey: `${marker}-scheduled`,
          sendMode: "scheduled" as const,
          scheduledAt: new Date(now.getTime() + 60_000).toISOString()
        };
        assert.equal(
          (await laterService.createAndPlan(actor, context, scheduledBody)).publicId,
          scheduled.publicId
        );
        await assert.rejects(
          laterService.createAndPlan(actor, context, {
            ...scheduledBody,
            idempotencyKey: `${marker}-invalid-past`
          }),
          /schedule_future_required/
        );
        assert.equal(
          (await service.cancel(actor, context, scheduled.publicId, cancelBody)).status,
          "cancelled"
        );
        await assert.rejects(
          repository.dispatchNotice(scheduled.publicId, new Date(now.getTime() + 120_000)),
          /not_dispatchable/
        );
        report = {
          recipientCount: expected,
          batchLimit: 250,
          idempotentCreate: true,
          idempotentDispatch: true,
          identityIsolation: true,
          readSynchronization: true,
          idempotentRead: true,
          inboxSingleAndAllReadSynchronization: true,
          idempotentCancel: true,
          elapsedScheduleReplay: true,
          newPastScheduleRejected: true,
          cancelledNotSent: true
        };
        throw rollback;
      },
      { timeout: 120_000 }
    );
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    try {
      const [notices, identities] = await Promise.all([
        prisma.officialNotice.count({ where: { idempotencyKey: { startsWith: marker } } }),
        prisma.userIdentity.count({ where: { displayName: { startsWith: marker } } })
      ]);
      assert.equal(notices, 0, "notice fixtures must roll back");
      assert.equal(identities, 0, "identity fixtures must roll back");
    } finally {
      await disconnectPrisma();
    }
  }
  assert.ok(report, "checker must finish every acceptance assertion");
  const concurrent = await checkConcurrentDelivery();
  process.stdout.write(
    `${JSON.stringify({ ...report, rolledBack: true, ...concurrent }, null, 2)}\n`
  );
}

async function checkConcurrentDelivery() {
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  const { OfficialNoticeRepository } =
    await import("../src/repositories/official-notice.repository");
  const { OfficialNoticeService } = await import("../src/services/official-notice.service");
  const { officialNoticeCreateBodySchema } =
    await import("../src/validators/official-notice.validator");
  const marker = `notice-concurrency-${randomUUID()}`;
  let noticeId: number | undefined;
  let publicId: string | undefined;
  try {
    const user = await prisma.user.findFirstOrThrow({
      where: {
        isTestAccount: true,
        isActive: true,
        deletedAt: null,
        identities: { some: { isActive: true, deletedAt: null } }
      },
      select: { id: true },
      orderBy: { id: "asc" }
    });
    const now = new Date();
    // Future scheduling prevents the ordinary local workers from consuming this fixture.
    const dueAt = new Date(now.getTime() + 3_600_000);
    const repository = new OfficialNoticeRepository(prisma);
    const service = new OfficialNoticeService(repository, { now: () => now });
    const created = await service.createAndPlan(
      { userId: user.id } as Parameters<typeof service.createAndPlan>[0],
      { ip: "127.0.0.1", userAgent: marker },
      officialNoticeCreateBodySchema.parse({
        sourceLocale: "ja",
        level: "general",
        title: marker,
        summary: marker,
        blocks: [{ id: "p-1", type: "paragraph", content: marker }],
        audience: { type: "exact_users", userIds: [user.id] },
        sendMode: "scheduled",
        scheduledAt: dueAt.toISOString(),
        idempotencyKey: marker
      })
    );
    publicId = created.publicId;
    noticeId = (await prisma.officialNotice.findUniqueOrThrow({ where: { publicId } })).id;
    const deliveredEvents: RealtimeEvent[] = [];
    let arrivals = 0;
    let release!: () => void;
    let bothReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const concurrentClient = () => {
      let firstLock = true;
      return new Proxy(prisma, {
        get(target, property) {
          if (property !== "$transaction") return Reflect.get(target, property);
          return (operation: (client: unknown) => Promise<unknown>) =>
            prisma.$transaction(
              async (tx) => {
                const instrumented = new Proxy(tx, {
                  get(transaction, key) {
                    if (key !== "$queryRaw") return Reflect.get(transaction, key);
                    return async (query: Parameters<typeof tx.$queryRaw>[0]) => {
                      if (firstLock) {
                        firstLock = false;
                        if (++arrivals === 2) release();
                        await bothReady;
                      }
                      return tx.$queryRaw(query);
                    };
                  }
                });
                return operation(instrumented);
              },
              { timeout: 20_000 }
            );
        }
      }) as PrismaClient;
    };
    const workers = [concurrentClient(), concurrentClient()].map(
      (client) =>
        new OfficialNoticeRepository(client, 3, {
          publish: (event) => {
            deliveredEvents.push(event);
          }
        })
    );
    await Promise.all(workers.map((worker) => worker.dispatchNotice(created.publicId, dueAt)));
    const receipts = await prisma.noticeDelivery.findMany({ where: { noticeId }, take: 500 });
    const notifications = await prisma.notification.count({
      where: { title: marker, payload: { path: "$.publicId", equals: publicId } }
    });
    assert.equal(receipts.length, created.audienceCount);
    assert.ok(receipts.every((receipt) => receipt.status === "DELIVERED"));
    assert.equal(
      notifications,
      receipts.length,
      "concurrent workers must not leave orphan duplicate notifications"
    );
    assert.equal(
      deliveredEvents.length,
      receipts.length,
      "each receipt publishes once across workers"
    );
    assert.equal(new Set(deliveredEvents.map((event) => event.id)).size, receipts.length);
    arrivals = 0;
    bothReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { RealtimeRepository } = await import("../src/repositories/realtime.repository");
    const noticeReader = new OfficialNoticeRepository(concurrentClient());
    const inboxReader = new RealtimeRepository(concurrentClient());
    const recipient = receipts[0];
    assert.ok(recipient.notificationId);
    const [readResult] = await Promise.all([
      noticeReader.markRead({
        publicId: created.publicId,
        recipientIdentityId: recipient.recipientIdentityId,
        actorUserId: user.id,
        context: { ip: "127.0.0.1", userAgent: marker },
        now: dueAt
      }),
      inboxReader.markNotificationRead(recipient.recipientIdentityId, recipient.notificationId)
    ]);
    const readReceipt = await prisma.noticeDelivery.findUniqueOrThrow({
      where: { id: recipient.id },
      include: { notification: true }
    });
    assert.deepEqual(readResult.readAt, readReceipt.readAt);
    assert.deepEqual(readReceipt.readAt, readReceipt.notification?.readAt);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          targetType: "OfficialNotice",
          targetId: noticeId,
          action: "official_notice.read"
        }
      }),
      1,
      "competing read entry points must emit only one read audit"
    );
    return {
      independentConcurrentTransactions: true,
      concurrentRecipientCount: receipts.length,
      concurrentInboxAndNoticeRead: true,
      concurrentFixturesCleaned: true
    };
  } finally {
    try {
      // Resolve the exact fixture even if an assertion failed between creation and ID capture.
      const fixture = await prisma.officialNotice.findUnique({ where: { idempotencyKey: marker } });
      if (fixture) {
        noticeId = fixture.id;
        publicId = fixture.publicId;
        await prisma.$transaction(async (tx) => {
          await tx.noticeDelivery.deleteMany({ where: { noticeId } });
          await tx.noticeAudience.deleteMany({ where: { noticeId } });
          await tx.officialNoticeTranslation.deleteMany({ where: { noticeId } });
          await tx.auditLog.deleteMany({
            where: { targetType: "OfficialNotice", targetId: noticeId }
          });
          await tx.notification.deleteMany({
            where: { title: marker, payload: { path: "$.publicId", equals: publicId } }
          });
          await tx.officialNotice.delete({ where: { id: noticeId } });
        });
      }
      assert.equal(await prisma.officialNotice.count({ where: { idempotencyKey: marker } }), 0);
      assert.equal(await prisma.notification.count({ where: { title: marker } }), 0);
    } finally {
      await disconnectPrisma();
    }
  }
}

if (require.main === module)
  void main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Notice acceptance failed"}\n`
    );
    process.exitCode = 1;
  });
