import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("formal IM routes", () => {
  it("uses formal REST and SSE without browser business state", () => {
    const source = read("./formal-pages.tsx");

    expect(source).toContain("realtimeApi.listConversations");
    expect(source).toContain("realtimeApi.listMessages");
    expect(source).toContain("realtimeApi.createMessage");
    expect(source).toContain("realtimeApi.markConversationRead");
    expect(source).toContain("subscribeRealtimeEvents");
    expect(source).not.toContain("data/mock");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("installImMockServer");
  });

  it("keeps legacy pages behind static-demo and frontend-bypass checks", () => {
    const source = read("./route-pages.tsx");

    expect(source).toContain("isStaticDemoMode()");
    expect(source).toContain("isFrontendBypassSession(session)");
    expect(source).toContain('import("./pages")');
    expect(source).toContain("FormalImMessagesEntryPage");
  });

  it("keeps the application entry off direct legacy IM imports", () => {
    const sources = [
      read("../../App.tsx"),
      read("../../pages/user/MessagesPage.tsx"),
      read("../../pages/user/ContactsPage.tsx"),
      read("../../pages/mobile/MerchantPortalPage.tsx"),
      read("../../pages/mobile/TechnicianPortalPage.tsx")
    ];

    expect(sources[0]).toContain('from "./features/im/route-pages"');
    sources.forEach((source) => expect(source).not.toMatch(/from ["'][^"']*features\/im\/pages["']/));
  });
});
