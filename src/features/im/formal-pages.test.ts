import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("formal IM routes", () => {
  it("keeps the original IM pages and swaps only their data adapter", () => {
    const source = read("./formal-api.ts");

    expect(source).toContain("realtimeApi.listConversations");
    expect(source).toContain("realtimeApi.listMessages");
    expect(source).toContain("realtimeApi.createMessage");
    expect(source).toContain("realtimeApi.markConversationRead");
    expect(source).toContain("subscribeRealtimeEvents");
    expect(source).not.toContain("data/mock");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("installImMockServer");
  });

  it("keeps formal organization members separate from reciprocal IM contacts", () => {
    const pages = read("./pages.tsx");
    const store = read("./store.ts");

    expect(store).toContain(
      "organizationContacts: bootstrap.organizationContacts",
    );
    expect(pages).toContain("store.organizationContacts !== undefined");
    expect(pages).toContain('contact.source === "merchant_technician_profile"');
    expect(pages).toContain('`/merchant/staff/${encodeURIComponent(user.entityId)}`');
    expect(pages).toContain("avatarTo={contactInfoTarget}");
  });

  it("routes every authenticated mode through the original rich pages", () => {
    const source = read("./route-pages.tsx");

    expect(source).toContain('from "./pages"');
    expect(source).not.toContain("lazy(");
    expect(source).not.toContain("<Suspense");
    expect(source).not.toContain("正在加载通讯页面");
    expect(source).not.toContain("formal-pages");
    expect(source).not.toContain("FormalImMessagesEntryPage");
  });

  it("keeps the application entry off direct legacy IM imports", () => {
    const sources = [
      read("../../App.tsx"),
      read("../../pages/user/MessagesPage.tsx"),
      read("../../pages/user/ContactsPage.tsx"),
      read("../../pages/mobile/MerchantPortalPage.tsx"),
      read("../../pages/mobile/TechnicianPortalPage.tsx"),
    ];

    expect(sources[0]).toContain('from "./features/im/route-pages"');
    sources.forEach((source) =>
      expect(source).not.toMatch(/from ["'][^"']*features\/im\/pages["']/),
    );
  });
});
