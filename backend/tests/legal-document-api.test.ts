import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

const publicId = "11111111-1111-4111-8111-111111111111";
const service = () => ({
  list: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
  create: jest.fn(async (_actor, _context, input) => ({ publicId, ...input, lockVersion: 1 })),
  updateMetadata: jest.fn(async (_actor, _context, _publicId, input) => ({
    publicId,
    ...input,
    lockVersion: 2
  })),
  getLocale: jest.fn(async (_actor, _publicId, locale) => ({
    publicId,
    locale,
    draft: null,
    currentRelease: null
  })),
  saveDraft: jest.fn(async (_actor, _context, _publicId, locale, input) => ({
    locale,
    ...input,
    lockVersion: 1
  })),
  publish: jest.fn(async (_actor, _context, _publicId, locale, input) => ({
    publicId,
    locale,
    version: 1,
    title: "Title",
    body: "Body",
    contentHash: "a".repeat(64),
    publishedAt: input.publishedAt
  })),
  listReleases: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
  getPublicCurrent: jest.fn(async (slug, locale) => ({
    slug,
    locale,
    version: 1,
    title: "Title",
    body: "Body",
    contentHash: "a".repeat(64),
    publishedAt: new Date("2026-09-07T00:00:00.000Z")
  }))
});

describe("legal document API", () => {
  it("enforces exact read/write/publish permissions", async () => {
    const fake = service();
    const fixture = await createStep06Fixture({ legalDocumentService: fake } as never);
    const token = await fixture.loginAsAdmin();

    fixture.replaceAdminPermissions(["backoffice:legal-documents:read"]);
    await request(fixture.app)
      .get("/api/v1/backoffice/legal-documents?page=1&page_size=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/backoffice/legal-documents")
      .set("Authorization", `Bearer ${token}`)
      .send({ slug: "terms", name: "Terms", internalPath: "/terms", displayLocations: [], isEnabled: false })
      .expect(403);

    fixture.replaceAdminPermissions(["backoffice:legal-documents:publish"]);
    await request(fixture.app)
      .post(`/api/v1/backoffice/legal-documents/${publicId}/locales/ja/publish`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedDraftLockVersion: 1, publishedAt: "2026-09-07T00:00:00.000Z" })
      .expect(201);
  });

  it("keeps locale drafts independent and validates strict bodies", async () => {
    const fake = service();
    const fixture = await createStep06Fixture({ legalDocumentService: fake } as never);
    fixture.replaceAdminPermissions(["backoffice:legal-documents:write"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .put(`/api/v1/backoffice/legal-documents/${publicId}/locales/zh-CN/draft`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedLockVersion: null, title: "标题", body: "正文", fallbackLocale: "ja" })
      .expect(400);
    await request(fixture.app)
      .put(`/api/v1/backoffice/legal-documents/${publicId}/locales/ja/draft`)
      .set("Authorization", `Bearer ${token}`)
      .send({ expectedLockVersion: null, title: "題名", body: "本文" })
      .expect(200);
    expect(fake.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
      expect.any(Object),
      publicId,
      "ja",
      { expectedLockVersion: null, title: "題名", body: "本文" }
    );
  });

  it("serves the exact requested public locale without authentication", async () => {
    const fake = service();
    const fixture = await createStep06Fixture({ legalDocumentService: fake } as never);
    const response = await request(fixture.app)
      .get("/api/v1/legal-documents/privacy-policy/current?locale=ko")
      .expect(200);
    expect(response.body.data).toMatchObject({ slug: "privacy-policy", locale: "ko" });
    expect(fake.getPublicCurrent).toHaveBeenCalledWith("privacy-policy", "ko");
  });
});
