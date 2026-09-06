import {
  officialNoticeCreateBodySchema,
  officialNoticeDraftCreateBodySchema,
  officialNoticeDraftUpdateBodySchema,
  officialNoticeListQuerySchema,
  officialNoticePlanBodySchema,
  officialNoticeReadQuerySchema
} from "../src/validators/official-notice.validator";

const translation = (locale: string) => ({
  title: `title-${locale}`,
  summary: `summary-${locale}`,
  blocks: [{ id: `body-${locale}`, type: "paragraph" as const, content: `body-${locale}` }]
});

const base = {
  sourceLocale: "zh-CN",
  level: "important",
  translations: {
    "zh-CN": translation("zh-CN"),
    "zh-TW": translation("zh-TW"),
    en: translation("en"),
    ja: translation("ja"),
    ko: translation("ko")
  },
  audience: { type: "identity_types", identityTypes: ["customer", "technician"] },
  sendMode: "now",
  scheduledAt: null,
  idempotencyKey: "notice-test-create-0001"
} as const;

describe("official notice validation", () => {
  it("requires five independently supplied locale payloads instead of cloning one browser field", () => {
    const explicit = { ...base, sourceLocale: "ja" as const };

    expect(officialNoticeCreateBodySchema.parse(explicit)).toEqual(explicit);
    expect(() => officialNoticeCreateBodySchema.parse({
      sourceLocale: "ja",
      level: "important",
      title: "legacy",
      summary: "legacy",
      blocks: [{ id: "legacy", type: "paragraph", content: "legacy" }],
      audience: { type: "all" },
      sendMode: "now",
      scheduledAt: null,
      idempotencyKey: "legacy-single-locale"
    })).toThrow();
    expect(() => officialNoticeCreateBodySchema.parse({
      ...explicit,
      translations: { ...explicit.translations, ko: undefined }
    })).toThrow();
  });

  it("accepts a strict immediate segment broadcast", () => {
    expect(officialNoticeCreateBodySchema.parse(base)).toEqual(base);
  });

  it("accepts formal media URLs and rejects browser-only data/blob payloads", () => {
    expect(
      officialNoticeCreateBodySchema.parse({
        ...base,
        translations: {
          ...base.translations,
          "zh-CN": {
            ...base.translations["zh-CN"],
            blocks: [
              {
                id: "image-1",
                type: "image",
                content: `/media/content/${"a".repeat(64)}.webp`,
                caption: "维护窗口",
                mediaAssetId: 41,
                source: "media"
              }
            ]
          }
        }
      }).translations["zh-CN"].blocks[0]
    ).toMatchObject({ mediaAssetId: 41, source: "media" });

    for (const content of ["data:image/png;base64,AAAA", "blob:http://localhost/file"]) {
      expect(() =>
        officialNoticeCreateBodySchema.parse({
          ...base,
          translations: {
            ...base.translations,
            "zh-CN": {
              ...base.translations["zh-CN"],
              blocks: [{ id: "image-1", type: "image", content, source: "url" }]
            }
          }
        })
      ).toThrow();
    }
  });

  it("persists supported font sizes only on textual blocks", () => {
    const parsed = officialNoticeCreateBodySchema.parse({
      ...base,
      translations: {
        ...base.translations,
        "zh-CN": {
          ...base.translations["zh-CN"],
          blocks: [
            {
              id: "paragraph-large",
              type: "paragraph",
              content: "需要醒目显示的正文",
              fontSize: "large"
            }
          ]
        }
      }
    });

    expect(parsed.translations["zh-CN"].blocks[0]).toMatchObject({ fontSize: "large" });

    for (const block of [
      { id: "paragraph-invalid", type: "paragraph", content: "正文", fontSize: "huge" },
      { id: "divider-sized", type: "divider", content: "", fontSize: "large" },
      {
        id: "image-sized",
        type: "image",
        content: `/media/content/${"b".repeat(64)}.webp`,
        source: "media",
        mediaAssetId: 42,
        fontSize: "small"
      }
    ]) {
      expect(() => officialNoticeCreateBodySchema.parse({
        ...base,
        translations: {
          ...base.translations,
          "zh-CN": { ...base.translations["zh-CN"], blocks: [block] }
        }
      })).toThrow();
    }
  });

  it("requires a future timestamp only for scheduled delivery", () => {
    expect(() =>
      officialNoticeCreateBodySchema.parse({
        ...base,
        sendMode: "scheduled",
        scheduledAt: null
      })
    ).toThrow();
    expect(() =>
      officialNoticeCreateBodySchema.parse({
        ...base,
        sendMode: "now",
        scheduledAt: "2026-09-03T10:00:00.000Z"
      })
    ).toThrow();
  });

  it("accepts incomplete multilingual content for a persisted draft", () => {
    const draft = {
      sourceLocale: "ja",
      level: "general",
      translations: {
        "zh-CN": { title: "", summary: "", blocks: [], isInitialCopy: true },
        "zh-TW": { title: "", summary: "", blocks: [], isInitialCopy: true },
        en: { title: "", summary: "", blocks: [], isInitialCopy: true },
        ja: {
          title: "編集中",
          summary: "",
          blocks: [{ id: "draft-body", type: "paragraph", content: "" }],
          isInitialCopy: false
        },
        ko: { title: "", summary: "", blocks: [], isInitialCopy: true }
      },
      audience: { type: "all" },
      idempotencyKey: "draft-create-0001"
    } as const;

    expect(officialNoticeDraftCreateBodySchema.parse(draft)).toEqual(draft);
    expect(officialNoticeDraftUpdateBodySchema.parse({
      ...draft,
      expectedLockVersion: 2,
      idempotencyKey: "draft-update-0001"
    })).toMatchObject({ expectedLockVersion: 2 });
  });

  it("requires optimistic locking and a valid delivery mode when planning a draft", () => {
    expect(officialNoticePlanBodySchema.parse({
      expectedLockVersion: 3,
      sendMode: "scheduled",
      scheduledAt: "2026-09-08T10:00:00.000Z",
      idempotencyKey: "draft-plan-0001"
    })).toMatchObject({ expectedLockVersion: 3, sendMode: "scheduled" });
    expect(() => officialNoticePlanBodySchema.parse({
      expectedLockVersion: 0,
      sendMode: "scheduled",
      scheduledAt: null,
      idempotencyKey: "draft-plan-0002"
    })).toThrow();
  });

  it("bounds exact targets and list pagination", () => {
    expect(
      officialNoticeCreateBodySchema.parse({
        ...base,
        audience: { type: "exact_users", needoIds: ["u0000000004", "u0000000009"] }
      }).audience
    ).toEqual({ type: "exact_users", needoIds: ["u0000000004", "u0000000009"] });
    expect(() =>
      officialNoticeCreateBodySchema.parse({
        ...base,
        audience: { type: "exact_users", needoIds: [] }
      })
    ).toThrow();
    expect(() =>
      officialNoticeCreateBodySchema.parse({
        ...base,
        audience: { type: "exact_users", userIds: [4, 9] }
      })
    ).toThrow();
    expect(officialNoticeListQuerySchema.parse({ page: "2", pageSize: "20" })).toMatchObject({
      page: 2,
      pageSize: 20
    });
    expect(
      officialNoticeListQuerySchema.parse({ search: "  営業時間  " })
    ).toMatchObject({ search: "営業時間" });
    expect(() =>
      officialNoticeListQuerySchema.parse({ search: "x".repeat(101) })
    ).toThrow();
    expect(() => officialNoticeReadQuerySchema.parse({ locale: "fr" })).toThrow();
  });
});
