import {
  officialNoticeCreateBodySchema,
  officialNoticeListQuerySchema,
  officialNoticeReadQuerySchema
} from "../src/validators/official-notice.validator";

const base = {
  sourceLocale: "zh-CN",
  level: "important",
  title: "系统维护通知",
  summary: "今晚将进行短时维护。",
  blocks: [{ id: "body-1", type: "paragraph", content: "请提前保存正在编辑的内容。" }],
  audience: { type: "identity_types", identityTypes: ["customer", "technician"] },
  sendMode: "now",
  scheduledAt: null,
  idempotencyKey: "notice-test-create-0001"
} as const;

describe("official notice validation", () => {
  it("accepts a strict immediate segment broadcast", () => {
    expect(officialNoticeCreateBodySchema.parse(base)).toEqual(base);
  });

  it("accepts formal media URLs and rejects browser-only data/blob payloads", () => {
    expect(
      officialNoticeCreateBodySchema.parse({
        ...base,
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
      }).blocks[0]
    ).toMatchObject({ mediaAssetId: 41, source: "media" });

    for (const content of ["data:image/png;base64,AAAA", "blob:http://localhost/file"]) {
      expect(() =>
        officialNoticeCreateBodySchema.parse({
          ...base,
          blocks: [{ id: "image-1", type: "image", content, source: "url" }]
        })
      ).toThrow();
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

  it("bounds exact targets and list pagination", () => {
    expect(
      officialNoticeCreateBodySchema.parse({
        ...base,
        audience: { type: "exact_users", userIds: [4, 9] }
      }).audience
    ).toEqual({ type: "exact_users", userIds: [4, 9] });
    expect(() =>
      officialNoticeCreateBodySchema.parse({
        ...base,
        audience: { type: "exact_users", userIds: [] }
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
