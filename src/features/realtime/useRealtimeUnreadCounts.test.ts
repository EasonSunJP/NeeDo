import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./useRealtimeUnreadCounts.ts", import.meta.url), "utf8");

describe("formal realtime unread-count hook", () => {
  it("loads durable counts and refreshes them from SSE events", () => {
    expect(source).toContain("realtimeApi.unreadCounts()");
    expect(source).toContain("subscribeRealtimeEvents");
    expect(source).toContain("setCounts");
  });

  it("does not call the backend for the explicit static demo bypass", () => {
    expect(source).toContain("isStaticDemoMode() && isFrontendBypassSession(session)");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("useImStore");
    expect(source).not.toContain("useSocial");
  });
});
