import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formalSource = readFileSync(new URL("./formal-pages.tsx", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("./route-pages.tsx", import.meta.url), "utf8");

describe("formal social pages", () => {
  it("reads posts and notifications from the formal realtime API", () => {
    expect(formalSource).toContain("realtimeApi.listSocialPosts");
    expect(formalSource).toContain("realtimeApi.listNotifications");
    expect(formalSource).toContain("subscribeRealtimeEvents");
    expect(formalSource).not.toContain("localStorage");
    expect(formalSource).not.toContain("../../data/mock");
    expect(formalSource).not.toContain('from "./context"');
    expect(formalSource).not.toContain("useSocial()");
  });

  it("publishes basic text posts through the formal API", () => {
    expect(formalSource).toContain("realtimeApi.createSocialPost");
    expect(formalSource).toContain('setVisibility("followers")');
    expect(formalSource).toContain('visibility === "followers" ? "followers" : "public"');
  });

  it("marks individual and all notifications as read", () => {
    expect(formalSource).toContain("realtimeApi.markNotificationRead");
    expect(formalSource).toContain("realtimeApi.markAllNotificationsRead");
  });

  it("isolates legacy social pages behind explicit static-demo bypass", () => {
    expect(routeSource).toContain("isStaticDemoMode()");
    expect(routeSource).toContain("isFrontendBypassSession(session)");
    expect(routeSource).toContain('import("./pages/SocialTimelinePage")');
    expect(routeSource).not.toMatch(/^import .*\.\/context/m);
  });
});
