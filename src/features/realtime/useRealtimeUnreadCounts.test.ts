import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./useRealtimeUnreadCounts.ts", import.meta.url), "utf8");

describe("formal realtime unread-count hook", () => {
  it("loads durable counts and refreshes them from SSE events", () => {
    expect(source).toContain("realtimeApi.unreadCounts()");
    expect(source).toContain("subscribeRealtimeEvents");
    expect(source).toContain("setCounts");
  });

  it("waits for access-token restoration before requesting protected counts", () => {
    expect(source).toContain("const { isAuthenticated, isRestoring, session } = useAuth();");
    expect(source).toContain("!isRestoring");
  });

  it("does not contain a static demo bypass", () => {
    expect(source).not.toContain("isStaticDemoMode");
    expect(source).not.toContain("isFrontendBypassSession");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("useImStore");
    expect(source).not.toContain("useSocial");
  });
});
