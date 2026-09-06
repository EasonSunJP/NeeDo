import {
  LegalDocumentService,
  buildLegalDocumentContentHash
} from "../src/services/legal-document.service";

const actor = {
  userId: 7,
  currentIdentityType: "operator",
  currentIdentityScopeType: "global",
  permissions: []
};
const context = { ip: "127.0.0.1", userAgent: "jest" };
const document = {
  id: 10,
  publicId: "11111111-1111-4111-8111-111111111111",
  slug: "terms-of-use",
  name: "利用规约",
  internalPath: "/me/settings/terms",
  displayLocations: ["settings"],
  isEnabled: true,
  lockVersion: 1,
  createdByUserId: 7,
  updatedByUserId: 7,
  createdAt: new Date("2026-09-06T00:00:00.000Z"),
  updatedAt: new Date("2026-09-06T00:00:00.000Z"),
  deletedAt: null
};

const draft = (locale: "zh-CN" | "ja", title: string, body: string) => ({
  documentId: 10,
  locale,
  title,
  body,
  lockVersion: 1,
  updatedAt: new Date("2026-09-06T01:00:00.000Z")
});

describe("LegalDocumentService", () => {
  it("isolates locale drafts and publishes the exact immutable draft", async () => {
    const zh = draft("zh-CN", "利用规约", "中文正文");
    const ja = draft("ja", "利用規約", "日本語本文");
    const repository = {
      getByPublicId: jest.fn(async () => document),
      saveDraftWithAudit: jest
        .fn()
        .mockResolvedValueOnce({ kind: "ok", value: zh })
        .mockResolvedValueOnce({ kind: "ok", value: ja }),
      publishWithAudit: jest.fn(async () => ({
        kind: "ok" as const,
        value: {
          publicId: "22222222-2222-4222-8222-222222222222",
          documentId: 10,
          locale: "zh-CN" as const,
          version: 1,
          title: zh.title,
          body: zh.body,
          contentHash: buildLegalDocumentContentHash("zh-CN", zh.title, zh.body),
          publishedAt: new Date("2026-09-07T00:00:00.000Z"),
          publishedByUserId: 7
        }
      })),
      getLocale: jest.fn(async (_id: number, locale: string) => ({
        draft: locale === "ja" ? ja : zh,
        currentRelease: null
      }))
    };
    const audit = { createInput: jest.fn((input) => input) };
    const service = new LegalDocumentService(repository as never, audit as never);

    await expect(
      service.saveDraft(actor as never, context, document.publicId, "zh-CN", {
        expectedLockVersion: null,
        title: zh.title,
        body: zh.body
      })
    ).resolves.toEqual(zh);
    await expect(
      service.saveDraft(actor as never, context, document.publicId, "ja", {
        expectedLockVersion: null,
        title: ja.title,
        body: ja.body
      })
    ).resolves.toEqual(ja);
    await expect(
      service.publish(actor as never, context, document.publicId, "zh-CN", {
        expectedDraftLockVersion: 1,
        publishedAt: new Date("2026-09-07T00:00:00.000Z")
      })
    ).resolves.toMatchObject({ locale: "zh-CN", version: 1, body: "中文正文" });
    await expect(service.getLocale(actor as never, document.publicId, "ja")).resolves.toMatchObject({
      locale: "ja",
      draft: { body: "日本語本文" }
    });
    expect(JSON.stringify(audit.createInput.mock.calls)).not.toContain("中文正文");
    expect(JSON.stringify(audit.createInput.mock.calls)).not.toContain("日本語本文");
  });

  it.each([
    "https://example.com",
    "//evil.test/path",
    "/me/../admin",
    "/me\\settings\\terms"
  ])("rejects unsafe internal paths: %s", async (internalPath) => {
    const service = new LegalDocumentService({} as never, { createInput: jest.fn() } as never);
    await expect(
      service.create(actor as never, context, {
        slug: "terms-of-use",
        name: "Terms",
        internalPath,
        displayLocations: [],
        isEnabled: false
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("accepts same-origin paths and keeps the content hash locale-specific", async () => {
    const repository = {
      createWithAudit: jest.fn(async (input) => ({
        kind: "ok" as const,
        value: { ...document, ...input.document }
      }))
    };
    const service = new LegalDocumentService(
      repository as never,
      { createInput: jest.fn(() => ({ action: "audit" })) } as never
    );
    await expect(
      service.create(actor as never, context, {
        slug: "terms-of-use",
        name: "Terms",
        internalPath: "/me/settings/terms?from=footer",
        displayLocations: ["footer"],
        isEnabled: false
      })
    ).resolves.toMatchObject({ internalPath: "/me/settings/terms?from=footer" });
    expect(buildLegalDocumentContentHash("zh-CN", "Title", "Body")).not.toBe(
      buildLegalDocumentContentHash("ja", "Title", "Body")
    );
  });

  it("fails closed when the exact public locale has no enabled release", async () => {
    const service = new LegalDocumentService(
      { getCurrentBySlug: jest.fn(async () => null) } as never,
      { createInput: jest.fn() } as never
    );
    await expect(service.getPublicCurrent("terms-of-use", "ko")).rejects.toMatchObject({
      statusCode: 404,
      message: "error.legal_document.unavailable"
    });
  });

  it("returns public release metadata without internal database or operator IDs", async () => {
    const repository = {
      getCurrentBySlug: jest.fn(async () => ({
        publicId: "22222222-2222-4222-8222-222222222222",
        documentId: 10,
        slug: "terms-of-use",
        internalPath: "/terms",
        displayLocations: ["footer"],
        locale: "en",
        version: 2,
        title: "Terms",
        body: "Body",
        contentHash: "a".repeat(64),
        publishedAt: new Date("2026-09-07T00:00:00.000Z"),
        publishedByUserId: 7
      }))
    };
    const service = new LegalDocumentService(repository as never, { createInput: jest.fn() } as never);
    const current = await service.getPublicCurrent("terms-of-use", "en");
    expect(current).not.toHaveProperty("documentId");
    expect(current).not.toHaveProperty("publishedByUserId");
    expect(current).toMatchObject({ locale: "en", internalPath: "/terms" });
  });

  it("maps stale draft and metadata writes to a stable conflict", async () => {
    const repository = {
      saveDraftWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const })),
      updateMetadataWithAudit: jest.fn(async () => ({ kind: "version_conflict" as const }))
    };
    const service = new LegalDocumentService(
      repository as never,
      { createInput: jest.fn((input) => input) } as never
    );
    await expect(
      service.saveDraft(actor as never, context, document.publicId, "en", {
        expectedLockVersion: 2,
        title: "Terms",
        body: "Body"
      })
    ).rejects.toMatchObject({ statusCode: 409, message: "error.legal_document.version_conflict" });
    await expect(
      service.updateMetadata(actor as never, context, document.publicId, {
        expectedLockVersion: 2,
        name: "Terms",
        internalPath: "/terms",
        displayLocations: [],
        isEnabled: true
      })
    ).rejects.toMatchObject({ statusCode: 409, message: "error.legal_document.version_conflict" });
  });

  it("normalizes pagination and does not expose internal numeric document IDs", async () => {
    const repository = { list: jest.fn(async () => ({ list: [document], total: 1 })) };
    const service = new LegalDocumentService(repository as never, { createInput: jest.fn() } as never);
    const result = await service.list(actor as never, { page: 2, pageSize: 10 });
    expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }));
    expect(result).toMatchObject({ total: 1, page: 2, page_size: 10 });
    expect(result.list[0]).not.toHaveProperty("id");
    expect(result.list[0]).not.toHaveProperty("deletedAt");
  });
});
