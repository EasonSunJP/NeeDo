import { describe, expect, it } from "vitest";
import source from "./SocialTimelinePage.tsx?raw";

describe("SocialTimelinePage", () => {
  it("keeps the mine filter inside the timeline instead of navigating to profile or me", () => {
    expect(source).toContain('raw === "nearby" || raw === "friends" || raw === "mine"');
    expect(source).toMatch(/const handleTimelineFilterChange = \(nextFilter: SocialTimelineFilterTab\) => \{\s*setTimelineFilter\(nextFilter\);\s*\};/);
    expect(source).not.toMatch(/nextFilter === "mine"[\s\S]*navigate\(/);
  });
});
