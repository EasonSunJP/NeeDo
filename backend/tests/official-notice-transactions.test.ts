import { OfficialNoticeRepository } from "../src/repositories/official-notice.repository";
import { AppError } from "../src/utils/app-error";

const now = new Date("2026-09-05T03:00:00Z");
const publicId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const notice = {
  id: 1,
  publicId,
  level: "IMPORTANT",
  status: "SCHEDULED",
  sourceLocale: "JA",
  scheduledAt: now,
  sentAt: null,
  cancelledAt: null,
  archivedAt: null,
  lockVersion: 1,
  targetSummary: "audience",
  createdAt: now,
  updatedAt: now,
  translations: []
};
function fixture() {
  const client = {
    officialNotice: {
      findFirst: jest.fn(async () => notice),
      findUnique: jest.fn(async () => null),
      updateMany: jest.fn(async () => ({ count: 1 })),
      update: jest.fn(async () => notice),
      findMany: jest.fn(async (): Promise<Array<{ publicId: string }>> => []),
      count: jest.fn(async () => 0),
      findUniqueOrThrow: jest.fn(async () => notice)
    },
    shopEmployee: { findFirst: jest.fn(async () => null) },
    noticeDelivery: {
      findMany: jest.fn(async (): Promise<Array<{ id: number; attemptCount: number }>> => []),
      findUnique: jest.fn(async () => ({ noticeId: 1, status: "DELIVERED" })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 1),
      groupBy: jest.fn(async () => [])
    },
    noticeAudience: { groupBy: jest.fn(async () => []) },
    auditLog: { findFirst: jest.fn(async (): Promise<unknown> => null), create: jest.fn() },
    $queryRaw: jest.fn(async () => [{ id: 1 }]),
    $transaction: jest.fn()
  };
  client.$transaction.mockImplementation((operation) => operation(client));
  return { client, repository: new OfficialNoticeRepository(client as never) };
}

describe("official notice transaction regression", () => {
  it("does not dispatch after another command wins the scheduled-to-sending transition", async () => {
    const { client, repository } = fixture();
    client.officialNotice.updateMany.mockResolvedValue({ count: 0 });
    await repository.dispatchNotice(publicId, now);
    expect(client.noticeDelivery.findMany).not.toHaveBeenCalled();
  });

  it("locks before the first consistent read in each delivery transaction", async () => {
    const { client, repository } = fixture();
    const operations: string[] = [];
    client.noticeDelivery.findMany.mockResolvedValue([{ id: 1, attemptCount: 0 }]);
    client.$queryRaw.mockImplementation(async () => {
      operations.push("lock");
      return [{ id: 1 }];
    });
    client.noticeDelivery.findUnique.mockImplementation(async () => {
      operations.push("read");
      return { noticeId: 1, status: "DELIVERED" };
    });
    await repository.dispatchNotice(publicId, now);
    expect(operations.slice(0, 3)).toEqual(["lock", "lock", "read"]);
  });

  it("limits one delivery pass so a large audience cannot monopolize a request or worker", async () => {
    const { client, repository } = fixture();
    await repository.dispatchNotice(publicId, now);
    expect(client.noticeDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 250 })
    );
  });

  it("holds a transaction lock while deciding whether all attempts have finished", async () => {
    const { client, repository } = fixture();
    let inTransaction = false;
    client.$transaction.mockImplementation(async (operation) => {
      inTransaction = true;
      try {
        return await operation(client);
      } finally {
        inTransaction = false;
      }
    });
    client.noticeDelivery.count.mockImplementation(async () => {
      expect(inTransaction).toBe(true);
      expect(client.$queryRaw).toHaveBeenCalled();
      return 1;
    });
    await repository.dispatchNotice(publicId, now);
  });

  it("skips notices waiting for a future retry when selecting the next worker batch", async () => {
    const { client, repository } = fixture();
    await repository.dispatchDueBatch(now, 10);
    expect(client.officialNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 10,
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { deliveries: expect.objectContaining({ some: expect.any(Object) }) }
          ])
        })
      })
    );
  });

  it("reconciles a sending notice after the last receipt committed before a worker crash", async () => {
    const { client, repository } = fixture();
    await repository.dispatchDueBatch(now, 10);
    expect(client.officialNotice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              deliveries: {
                none: {
                  deletedAt: null,
                  OR: [{ status: "PENDING" }, { status: "FAILED", attemptCount: { lt: 3 } }]
                }
              }
            }
          ])
        })
      })
    );
  });

  it("continues the batch when a notice is cancelled after selection", async () => {
    const { client, repository } = fixture();
    client.officialNotice.findMany.mockResolvedValue([
      { publicId },
      { publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }
    ]);
    const dispatch = jest.spyOn(repository, "dispatchNotice");
    dispatch
      .mockRejectedValueOnce(
        new AppError({
          code: 40901,
          statusCode: 409,
          message: "error.official_notice.not_dispatchable"
        })
      )
      .mockResolvedValueOnce({ delivery: { delivered: 2, failed: 0 } } as never);
    await expect(repository.dispatchDueBatch(now, 10)).resolves.toEqual({
      notices: 2,
      delivered: 2,
      failed: 0
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("recognizes a persisted lifecycle replay before checking its now-stale version", async () => {
    const { client, repository } = fixture();
    client.auditLog.findFirst.mockResolvedValue({
      metadata: { requestFingerprint: "same-command" }
    });
    client.officialNotice.findUniqueOrThrow.mockResolvedValue({ ...notice, lockVersion: 2 });
    await repository.cancel({
      publicId,
      actorUserId: 7,
      context: { ip: "127.0.0.1" },
      now,
      expectedLockVersion: 1,
      reason: "cancel scheduled notice",
      idempotencyKey: "cancel-command",
      requestFingerprint: "same-command",
      issuerScope: { type: "platform" }
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
    expect(client.officialNotice.updateMany).not.toHaveBeenCalled();
  });

  it("keeps previously delivered content visible while failed recipients retry", async () => {
    const { client, repository } = fixture();
    client.officialNotice.findUniqueOrThrow.mockResolvedValue({ ...notice, status: "SENT" });
    await repository.retryFailures({
      publicId,
      actorUserId: 7,
      context: { ip: "127.0.0.1" },
      now,
      expectedLockVersion: 1,
      reason: "retry failed recipients",
      idempotencyKey: "retry-command",
      requestFingerprint: "retry-fingerprint",
      issuerScope: { type: "platform" }
    });
    expect(client.officialNotice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENDING" })
      })
    );
  });

  it("checks active shop employment before looking up an idempotency replay", async () => {
    const { client, repository } = fixture();
    await expect(
      repository.createAndPlan({
        publicId,
        actorUserId: 7,
        issuerScope: {
          type: "shop",
          shopId: 11,
          actorUserId: 7,
          actorIdentityId: 17
        },
        context: { ip: "127.0.0.1" },
        now,
        level: "important",
        sourceLocale: "ja",
        audience: { type: "shop_employees" },
        targetSummary: "本店の従業員",
        scheduledAt: now,
        sendMode: "now",
        idempotencyKey: "merchant-create",
        requestFingerprint: "merchant-fingerprint",
        translations: {}
      } as never)
    ).rejects.toMatchObject({ message: "error.identity.forbidden", statusCode: 403 });
    expect(client.shopEmployee.findFirst).toHaveBeenCalled();
    expect(client.officialNotice.findUnique).not.toHaveBeenCalled();
  });

  it.each(["cancel", "archive", "retryFailures"] as const)(
    "rechecks active shop employment before merchant %s replay or mutation",
    async (command) => {
      const { client, repository } = fixture();
      await expect(
        repository[command]({
          publicId,
          actorUserId: 7,
          context: { ip: "127.0.0.1" },
          now,
          expectedLockVersion: 1,
          reason: "merchant lifecycle",
          idempotencyKey: `merchant-${command}`,
          requestFingerprint: `merchant-${command}-fingerprint`,
          issuerScope: {
            type: "shop",
            shopId: 11,
            actorUserId: 7,
            actorIdentityId: 17
          }
        })
      ).rejects.toMatchObject({ message: "error.identity.forbidden", statusCode: 403 });
      expect(client.shopEmployee.findFirst).toHaveBeenCalled();
      expect(client.auditLog.findFirst).not.toHaveBeenCalled();
      expect(client.officialNotice.update).not.toHaveBeenCalled();
    }
  );

  it("separates platform and current-shop management queries", async () => {
    const { client, repository } = fixture();
    await repository.listBackoffice({
      issuerScope: { type: "platform" },
      page: 1,
      pageSize: 20
    });
    await repository.listBackoffice({
      issuerScope: { type: "shop", shopId: 11 },
      page: 1,
      pageSize: 20
    });
    expect(client.officialNotice.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { deletedAt: null, issuerType: "PLATFORM" } })
    );
    expect(client.officialNotice.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { deletedAt: null, issuerType: "SHOP", issuerShopId: 11 }
      })
    );
  });
});
