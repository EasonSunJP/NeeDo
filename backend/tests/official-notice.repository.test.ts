import {
  assertOfficialNoticeMediaBindings,
  buildOfficialNoticeRecipientWhere,
  getOfficialNoticeRetryAt
} from "../src/repositories/official-notice.repository";
import { AppError } from "../src/utils/app-error";

describe("OfficialNoticeRepository audience resolution", () => {
  it("always filters inactive and soft-deleted users and identities", () => {
    expect(buildOfficialNoticeRecipientWhere({ type: "all" })).toEqual({
      isActive: true,
      deletedAt: null,
      user: { isActive: true, deletedAt: null }
    });
  });

  it("deduplicates identity types without weakening the active-user scope", () => {
    expect(
      buildOfficialNoticeRecipientWhere({
        type: "identity_types",
        identityTypes: ["customer", "technician", "customer"]
      })
    ).toEqual({
      isActive: true,
      deletedAt: null,
      user: { isActive: true, deletedAt: null },
      type: { in: ["customer", "technician"] }
    });
  });

  it("deduplicates exact user targets and still resolves their active identities", () => {
    expect(buildOfficialNoticeRecipientWhere({
      type: "exact_users",
      needoIds: ["u0000000009", "u0000000002", "u0000000009"]
    })).toEqual({
      isActive: true,
      deletedAt: null,
      user: {
        isActive: true,
        deletedAt: null,
        needoId: { in: ["u0000000009", "u0000000002"] }
      }
    });
  });

  it("schedules bounded automatic retries and leaves exhausted failures for manual retry", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    expect(getOfficialNoticeRetryAt(1, 3, now)).toEqual(new Date("2026-09-02T12:01:00.000Z"));
    expect(getOfficialNoticeRetryAt(2, 3, now)).toEqual(new Date("2026-09-02T12:01:00.000Z"));
    expect(getOfficialNoticeRetryAt(3, 3, now)).toBeNull();
  });
});

describe("OfficialNoticeRepository media ownership", () => {
  const mediaBlock = (type: "image" | "video" | "file", mediaAssetId: number, content: string, mimeType: string) => ({
    id: `${type}-${mediaAssetId}`,
    type,
    content,
    source: "media" as const,
    mediaAssetId,
    mimeType
  });
  const translations = (block: ReturnType<typeof mediaBlock>) => ({
    "zh-CN": { title: "通知", summary: "摘要", blocks: [block], sourceLocale: "zh-CN" as const, isInitialCopy: false },
    "zh-TW": { title: "通知", summary: "摘要", blocks: [], sourceLocale: "zh-CN" as const, isInitialCopy: true },
    en: { title: "Notice", summary: "Summary", blocks: [], sourceLocale: "zh-CN" as const, isInitialCopy: true },
    ja: { title: "通知", summary: "概要", blocks: [], sourceLocale: "zh-CN" as const, isInitialCopy: true },
    ko: { title: "공지", summary: "요약", blocks: [], sourceLocale: "zh-CN" as const, isInitialCopy: true }
  });

  it("accepts only an active platform-owned upload with matching URL and media family", () => {
    const url = `/media/content/${"a".repeat(64)}.mp4`;
    expect(() => assertOfficialNoticeMediaBindings(
      [{ id: 51, entityType: "official_notice_upload", ownerUserId: 7, shopId: null, url, mimeType: "video/mp4", isActive: true, deletedAt: null }],
      translations(mediaBlock("video", 51, url, "video/mp4")),
      { type: "platform" },
      7
    )).not.toThrow();

    expect(() => assertOfficialNoticeMediaBindings(
      [{ id: 51, entityType: "official_notice_upload", ownerUserId: 8, shopId: null, url, mimeType: "video/mp4", isActive: true, deletedAt: null }],
      translations(mediaBlock("video", 51, url, "video/mp4")),
      { type: "platform" },
      7
    )).toThrow(AppError);
  });

  it("allows reuse inside one shop but rejects another shop and MIME spoofing", () => {
    const url = `/media/content/${"b".repeat(64)}.pdf`;
    const shopAsset = { id: 61, entityType: "official_notice_upload", ownerUserId: 9, shopId: 301, url, mimeType: "application/pdf", isActive: true, deletedAt: null };
    expect(() => assertOfficialNoticeMediaBindings(
      [shopAsset],
      translations(mediaBlock("file", 61, url, "application/pdf")),
      { type: "shop", shopId: 301, actorUserId: 10, actorIdentityId: 29 },
      10
    )).not.toThrow();

    for (const [asset, block] of [
      [{ ...shopAsset, shopId: 302 }, mediaBlock("file", 61, url, "application/pdf")],
      [shopAsset, mediaBlock("image", 61, url, "application/pdf")]
    ] as const) {
      expect(() => assertOfficialNoticeMediaBindings(
        [asset],
        translations(block),
        { type: "shop", shopId: 301, actorUserId: 10, actorIdentityId: 29 },
        10
      )).toThrow(AppError);
    }
  });
});
