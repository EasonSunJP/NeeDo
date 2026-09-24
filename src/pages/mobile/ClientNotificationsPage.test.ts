import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import source from "./ClientNotificationsPage.tsx?raw";

describe("client official notification inbox", () => {
  it("lists the signed-in identity's official notices with date and read state", () => {
    expect(source).toContain("officialNoticesApi.listInbox({ locale, unreadOnly: false, page, pageSize })");
    expect(source).toContain("item.sentAt");
    expect(source).toContain('item.readAt ? "已读" : "新"');
  });

  it("marks a selected notice read and refreshes the shared badge", () => {
    expect(source).toContain("officialNoticesApi.markRead(item.publicId)");
    expect(source).toContain("OFFICIAL_NOTICE_CHANGED_EVENT");
  });

  it("uses the shared read-only timeline with notice dates and read states", () => {
    expect(source).toContain("<ContactEventTimeline");
    expect(source).toContain("showCommentComposer={false}");
    expect(source).toContain("preserveAtLabel: true");
    expect(source).toContain('tone: item.readAt ? "neutral" : "green"');
  });

  it("uses status wording for read notices in Japanese and Korean", () => {
    expect(translateText("已读", "ja")).toBe("既読");
    expect(translateText("已读", "ko")).toBe("읽음");
  });
});
