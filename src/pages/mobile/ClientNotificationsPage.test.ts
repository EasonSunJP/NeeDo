import { describe, expect, it } from "vitest";
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
});
