import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  OfficialNoticeService,
  type OfficialNoticePayload,
  type OfficialNoticeRepositoryPort
} from "../src/services/official-notice.service";

const now = new Date("2026-09-02T12:00:00.000Z");
const actor = {
  userId: 7,
  currentIdentityId: 17,
  currentIdentityType: "platform",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null
} as AuthenticatedAccessContext;

const payload = (patch: Partial<OfficialNoticePayload> = {}): OfficialNoticePayload => ({
  publicId: "11111111-1111-4111-8111-111111111111",
  level: "important",
  status: "scheduled",
  sourceLocale: "zh-CN",
  targetSummary: "用户端 / 技师端",
  scheduledAt: now,
  sentAt: null,
  cancelledAt: null,
  archivedAt: null,
  lockVersion: 1,
  translations: {
    "zh-CN": {
      title: "维护",
      summary: "摘要",
      blocks: [],
      sourceLocale: "zh-CN",
      isInitialCopy: false
    },
    "zh-TW": {
      title: "维护",
      summary: "摘要",
      blocks: [],
      sourceLocale: "zh-CN",
      isInitialCopy: true
    },
    en: { title: "维护", summary: "摘要", blocks: [], sourceLocale: "zh-CN", isInitialCopy: true },
    ja: { title: "维护", summary: "摘要", blocks: [], sourceLocale: "zh-CN", isInitialCopy: true },
    ko: { title: "维护", summary: "摘要", blocks: [], sourceLocale: "zh-CN", isInitialCopy: true }
  },
  audienceCount: 2,
  delivery: { pending: 2, delivered: 0, failed: 0, read: 0 },
  createdAt: now,
  updatedAt: now,
  ...patch
});

function repository(): jest.Mocked<OfficialNoticeRepositoryPort> {
  return {
    createAndPlan: jest.fn(
      async (input: Parameters<OfficialNoticeRepositoryPort["createAndPlan"]>[0]) => {
        void input;
        return payload();
      }
    ),
    dispatchNotice: jest.fn(async (publicId: string, dispatchAt: Date) => {
      void publicId;
      void dispatchAt;
      return payload({
        status: "sent",
        sentAt: now,
        delivery: { pending: 0, delivered: 2, failed: 0, read: 0 }
      });
    }),
    listBackoffice: jest.fn(
      async (input: Parameters<OfficialNoticeRepositoryPort["listBackoffice"]>[0]) => {
        void input;
        return { list: [payload()], total: 1 };
      }
    ),
    cancel: jest.fn(async (input: Parameters<OfficialNoticeRepositoryPort["cancel"]>[0]) => {
      void input;
      return payload({ status: "cancelled", cancelledAt: now });
    }),
    archive: jest.fn(async (input: Parameters<OfficialNoticeRepositoryPort["archive"]>[0]) => {
      void input;
      return payload({ status: "archived", archivedAt: now });
    }),
    retryFailures: jest.fn(
      async (input: Parameters<OfficialNoticeRepositoryPort["retryFailures"]>[0]) => {
        void input;
        return payload({ status: "scheduled" });
      }
    ),
    listMine: jest.fn(async (input: Parameters<OfficialNoticeRepositoryPort["listMine"]>[0]) => {
      void input;
      return { list: [], total: 0 };
    }),
    markRead: jest.fn(async (input: Parameters<OfficialNoticeRepositoryPort["markRead"]>[0]) => {
      void input;
      return { publicId: payload().publicId, readAt: now };
    }),
    dispatchDueBatch: jest.fn(async (dispatchAt: Date, batchSize: number) => {
      void dispatchAt;
      void batchSize;
      return { notices: 0, delivered: 0, failed: 0 };
    })
  } as jest.Mocked<OfficialNoticeRepositoryPort>;
}

describe("OfficialNoticeService", () => {
  it("copies the source translation to all locales, snapshots segment labels, and dispatches now", async () => {
    const repo = repository();
    const service = new OfficialNoticeService(repo, {
      now: () => now,
      createPublicId: () => payload().publicId
    });
    const result = await service.createAndPlan(
      actor,
      { ip: "127.0.0.1" },
      {
        sourceLocale: "zh-CN",
        level: "important",
        title: "维护",
        summary: "摘要",
        blocks: [{ id: "p-1", type: "paragraph", content: "正文" }],
        audience: { type: "identity_types", identityTypes: ["customer", "technician"] },
        sendMode: "now",
        scheduledAt: null,
        idempotencyKey: "notice-service-now-1"
      }
    );

    expect(repo.createAndPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: payload().publicId,
        actorUserId: 7,
        scheduledAt: now,
        targetSummary: "用户端 / 技师端",
        audience: { type: "identity_types", identityTypes: ["customer", "technician"] },
        translations: expect.objectContaining({
          ja: expect.objectContaining({ title: "维护", sourceLocale: "zh-CN", isInitialCopy: true })
        })
      })
    );
    expect(repo.dispatchNotice).toHaveBeenCalledWith(payload().publicId, now);
    expect(result.status).toBe("sent");
  });

  it("persists a future schedule without invoking immediate dispatch", async () => {
    const repo = repository();
    const service = new OfficialNoticeService(repo, { now: () => now });
    const scheduledAt = new Date("2026-09-03T03:00:00.000Z");
    await service.createAndPlan(
      actor,
      { ip: "127.0.0.1" },
      {
        sourceLocale: "ja",
        level: "urgent",
        title: "メンテナンス",
        summary: "お知らせ",
        blocks: [{ id: "p-1", type: "paragraph", content: "本文" }],
        audience: { type: "all" },
        sendMode: "scheduled",
        scheduledAt: scheduledAt.toISOString(),
        idempotencyKey: "notice-service-scheduled-1"
      }
    );
    expect(repo.createAndPlan).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt }));
    expect(repo.dispatchNotice).not.toHaveBeenCalled();
  });

  it("keeps recipient reads scoped to the authenticated current identity", async () => {
    const repo = repository();
    const service = new OfficialNoticeService(repo, { now: () => now });
    await service.listMine(actor, { locale: "ja", page: 1, pageSize: 20, unreadOnly: true });
    await service.markRead(actor, { ip: "127.0.0.1" }, payload().publicId);
    expect(repo.listMine).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIdentityId: 17, locale: "ja" })
    );
    expect(repo.markRead).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIdentityId: 17, actorUserId: 7 })
    );
  });

  it("returns a terminal create replay without attempting to deliver archived content", async () => {
    const repo = repository();
    repo.createAndPlan.mockResolvedValue(payload({ status: "archived", archivedAt: now }));
    const service = new OfficialNoticeService(repo, { now: () => now });
    const result = await service.createAndPlan(
      actor,
      { ip: "127.0.0.1" },
      {
        sourceLocale: "ja",
        level: "important",
        title: "Notice",
        summary: "Summary",
        blocks: [{ id: "p-1", type: "paragraph", content: "Body" }],
        audience: { type: "all" },
        sendMode: "now",
        scheduledAt: null,
        idempotencyKey: "terminal-replay"
      }
    );
    expect(result.status).toBe("archived");
    expect(repo.dispatchNotice).not.toHaveBeenCalled();
  });

  it("lets persisted scheduled retries reach the repository after the original due time", async () => {
    const repo = repository();
    repo.createAndPlan.mockResolvedValue(payload({ status: "sent" }));
    const service = new OfficialNoticeService(repo, { now: () => now });
    await expect(
      service.createAndPlan(
        actor,
        { ip: "127.0.0.1" },
        {
          sourceLocale: "ja",
          level: "important",
          title: "Notice",
          summary: "Summary",
          blocks: [{ id: "p-1", type: "paragraph", content: "Body" }],
          audience: { type: "all" },
          sendMode: "scheduled",
          scheduledAt: new Date(now.getTime() - 1_000).toISOString(),
          idempotencyKey: "elapsed-schedule-replay"
        }
      )
    ).resolves.toMatchObject({ status: "sent" });
  });
});
