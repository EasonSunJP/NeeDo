import { ContentLocale } from "@prisma/client";
import { buildLegalDocumentContentHash } from "../src/domain/legal-document";
import { LegalDocumentRepository } from "../src/repositories/legal-document.repository";

describe("LegalDocumentRepository", () => {
  it("publishes the locked draft as an immutable active release and redacts body from audit", async () => {
    const publishedAt = new Date("2026-09-07T00:00:00.000Z");
    const draft = {
      documentId: 10,
      locale: ContentLocale.ZH_CN,
      title: "利用规约",
      body: "中文正文",
      lockVersion: 3,
      updatedAt: new Date("2026-09-06T00:00:00.000Z")
    };
    const release = {
      publicId: "22222222-2222-4222-8222-222222222222",
      documentId: 10,
      locale: ContentLocale.ZH_CN,
      version: 2,
      title: draft.title,
      body: draft.body,
      contentHash: buildLegalDocumentContentHash("zh-CN", draft.title, draft.body),
      publishedAt,
      publishedByUserId: 7
    };
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 9 }]),
      legalDocument: {
        findFirst: jest.fn(async () => ({ id: 10 })),
        update: jest.fn(async () => ({ id: 10 }))
      },
      legalDocumentDraft: { findFirst: jest.fn(async () => draft) },
      legalDocumentRelease: {
        findFirst: jest.fn(async () => ({ version: 1 })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        create: jest.fn(async () => release)
      },
      auditLog: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new LegalDocumentRepository(client as never);

    await expect(
      repository.publishWithAudit({
        publicId: "11111111-1111-4111-8111-111111111111",
        locale: "zh-CN",
        expectedDraftLockVersion: 3,
        actorUserId: 7,
        publishedAt,
        setEnabled: true,
        audit: {
          actorId: 7,
          action: "backoffice.legal_document.published",
          targetType: "LegalDocument",
          metadata: { locale: "zh-CN" },
          ip: "127.0.0.1",
          userAgent: "jest"
        }
      })
    ).resolves.toEqual({ kind: "ok", value: { ...release, locale: "zh-CN" } });
    expect(transaction.legalDocumentRelease.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ activeKey: "active" }) })
    );
    expect(transaction.legalDocumentRelease.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeKey: "active",
        version: 2,
        title: draft.title,
        body: draft.body,
        contentHash: release.contentHash,
        publishedAt
      }),
      select: expect.any(Object)
    });
    expect(transaction.legalDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isEnabled: true }) })
    );
    expect(JSON.stringify(transaction.auditLog.create.mock.calls)).not.toContain("中文正文");
  });

  it("rejects a stale draft lock before changing the active release", async () => {
    const transaction = {
      $queryRaw: jest.fn(async () => [{ id: 9 }]),
      legalDocument: { findFirst: jest.fn(async () => ({ id: 10 })) },
      legalDocumentDraft: {
        findFirst: jest.fn(async () => ({ lockVersion: 4 }))
      },
      legalDocumentRelease: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn()
      }
    };
    const client = {
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction)
      )
    };
    const repository = new LegalDocumentRepository(client as never);
    await expect(
      repository.publishWithAudit({
        publicId: "11111111-1111-4111-8111-111111111111",
        locale: "ja",
        expectedDraftLockVersion: 3,
        actorUserId: 7,
        publishedAt: new Date(),
        audit: {
          actorId: 7,
          action: "publish",
          targetType: "LegalDocument",
          ip: null,
          userAgent: null
        }
      })
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(transaction.legalDocumentRelease.updateMany).not.toHaveBeenCalled();
    expect(transaction.legalDocumentRelease.create).not.toHaveBeenCalled();
  });
});
